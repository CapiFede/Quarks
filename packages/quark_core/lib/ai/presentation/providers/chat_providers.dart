import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/llm/llm_provider.dart';
import '../../data/llm/llm_stream_event.dart' as ev;
import '../../data/services/chat_storage_service.dart';
import '../../domain/ai_attachment.dart';
import '../../domain/ai_context.dart';
import '../../domain/chat_message.dart';
import '../../domain/content_block.dart';
import '../../domain/conversation.dart';
import 'agent_md_providers.dart';
import 'llm_providers.dart';

final chatStorageServiceProvider =
    Provider<ChatStorageService>((ref) => ChatStorageService());

/// All conversations summarized for the sidebar. Sorted by updatedAt desc.
final conversationSummariesProvider = AsyncNotifierProvider<
    ConversationSummariesNotifier, List<ConversationSummary>>(
  ConversationSummariesNotifier.new,
);

class ConversationSummariesNotifier
    extends AsyncNotifier<List<ConversationSummary>> {
  @override
  Future<List<ConversationSummary>> build() async {
    final storage = ref.read(chatStorageServiceProvider);
    return storage.listSummaries();
  }

  Future<Conversation> createConversation({
    String? title,
    required String modelId,
    String? originQuarkId,
  }) async {
    final now = DateTime.now();
    final conv = Conversation(
      id: _generateId('c'),
      title: title ?? 'Nueva conversación',
      modelId: modelId,
      originQuarkId: originQuarkId,
      messages: const [],
      createdAt: now,
      updatedAt: now,
    );
    final storage = ref.read(chatStorageServiceProvider);
    await storage.saveConversation(conv);
    ref.invalidateSelf();
    await future;
    return conv;
  }

  Future<void> deleteConversation(String id) async {
    final storage = ref.read(chatStorageServiceProvider);
    await storage.deleteConversation(id);
    ref.invalidateSelf();
    await future;
  }

  Future<void> renameConversation(String id, String newTitle) async {
    final storage = ref.read(chatStorageServiceProvider);
    final conv = await storage.loadConversation(id);
    if (conv == null) return;
    final updated = conv.copyWith(
      title: newTitle.trim().isEmpty ? conv.title : newTitle.trim(),
      updatedAt: DateTime.now(),
    );
    await storage.saveConversation(updated);
    ref.invalidateSelf();
    await future;
  }
}

/// Which conversation is currently open in the drawer.
final activeConversationIdProvider = StateProvider<String?>((ref) => null);

/// True while an assistant turn is streaming. Drives UI affordances (disable
/// the send button, show a stop affordance).
final chatStreamingProvider = StateProvider<bool>((ref) => false);

/// Open/closed state of the global AI drawer. The launcher's `_handleGlobalKey`
/// toggles this on F4 and on Escape (when the drawer is open).
final aiDrawerOpenProvider = StateProvider<bool>((ref) => false);

/// Width in pixels of the AI drawer. Clamped 320-720 by the resize handle.
final aiDrawerWidthProvider = StateProvider<double>((ref) => 400);

/// Attachments staged in the input bar. Cleared on send.
final pendingAttachmentsProvider =
    StateProvider<List<AiAttachment>>((ref) => const []);

/// Per-conversation state. Loads from disk on demand; the notifier owns the
/// streaming round-trip with the active LLM provider.
final conversationProvider =
    AsyncNotifierProvider.family<ConversationNotifier, Conversation, String>(
  ConversationNotifier.new,
);

class ConversationNotifier extends FamilyAsyncNotifier<Conversation, String> {
  StreamSubscription<ev.LlmStreamEvent>? _activeStream;

  @override
  Future<Conversation> build(String convId) async {
    ref.onDispose(() {
      _activeStream?.cancel();
    });
    final storage = ref.read(chatStorageServiceProvider);
    final conv = await storage.loadConversation(convId);
    if (conv == null) {
      throw StateError('Conversation $convId not found');
    }
    return conv;
  }

  /// Appends a user message and streams the assistant reply, looping
  /// through tool calls until the model stops requesting them or the
  /// 6-hop cap is hit. The drawer widget resolves [aiContext] from
  /// BuildContext and hands the built value in.
  Future<void> sendUserMessage(
    String text, {
    AiContext? aiContext,
  }) async {
    final current = state.valueOrNull;
    if (current == null) return;
    if (text.trim().isEmpty) return;

    final attachments = ref.read(pendingAttachmentsProvider);
    final activeModel = ref.read(activeModelProvider);
    if (activeModel == null) {
      throw StateError('No hay modelo seleccionado.');
    }
    final registry = ref.read(llmProviderRegistryProvider);
    final provider = registry.providerForModel(activeModel);
    if (provider == null) {
      throw StateError(
          'El proveedor del modelo seleccionado no está configurado.');
    }

    final hiddenContext = _composeHiddenContext(attachments, aiContext);
    final userMsg = ChatMessage(
      id: _generateId('m'),
      role: MessageRole.user,
      blocks: [
        if (hiddenContext.isNotEmpty) HiddenContextBlock(hiddenContext),
        TextBlock(text),
      ],
      createdAt: DateTime.now(),
    );

    var draftAssistant = ChatMessage(
      id: _generateId('m'),
      role: MessageRole.assistant,
      blocks: const [],
      createdAt: DateTime.now(),
      modelId: activeModel.qualifiedId,
    );

    final autoTitle = current.messages.isEmpty
        ? _deriveTitleFrom(text)
        : current.title;

    var working = current.copyWith(
      title: autoTitle,
      modelId: activeModel.qualifiedId,
      messages: [...current.messages, userMsg, draftAssistant],
      updatedAt: DateTime.now(),
    );
    state = AsyncData(working);
    ref.read(pendingAttachmentsProvider.notifier).state = const [];

    final storage = ref.read(chatStorageServiceProvider);
    await storage.saveConversation(working);
    ref.invalidate(conversationSummariesProvider);

    final systemPrompt = await _composeSystemPrompt(ref, aiContext);
    final tools = aiContext?.tools;
    final toolHandler = aiContext?.toolHandler;

    ref.read(chatStreamingProvider.notifier).state = true;

    const maxHops = 6;
    var hops = 0;
    try {
      while (hops < maxHops) {
        var accumulated = <ContentBlock>[];
        final pendingToolCalls = <ToolUseBlock>[];

        void replaceDraft() {
          final convNow = state.valueOrNull;
          if (convNow == null) return;
          final updatedDraft = draftAssistant.copyWith(blocks: accumulated);
          final msgs = List<ChatMessage>.from(convNow.messages);
          msgs[msgs.length - 1] = updatedDraft;
          working = convNow.copyWith(
            messages: msgs,
            updatedAt: DateTime.now(),
          );
          state = AsyncData(working);
        }

        void appendText(String chunk) {
          final last = accumulated.isEmpty ? null : accumulated.last;
          if (last is TextBlock) {
            accumulated[accumulated.length - 1] =
                TextBlock(last.text + chunk);
          } else {
            accumulated = [...accumulated, TextBlock(chunk)];
          }
          replaceDraft();
        }

        final outgoingMessages =
            working.messages.sublist(0, working.messages.length - 1);

        Stream<ev.LlmStreamEvent> stream;
        try {
          stream = provider.sendMessage(
            model: activeModel,
            messages: outgoingMessages,
            systemPrompt: systemPrompt,
            tools: tools,
          );
        } on LlmAuthException catch (e) {
          accumulated = [...accumulated, TextBlock('\n\n[Auth: $e]')];
          replaceDraft();
          await storage.saveConversation(working);
          return;
        }

        final completer = Completer<void>();
        _activeStream = stream.listen(
          (event) {
            switch (event) {
              case ev.TextDelta(:final text):
                appendText(text);
              case ev.ToolUseEnd(:final callId, :final toolName, :final input):
                final block = ToolUseBlock(
                  toolCallId: callId,
                  toolName: toolName,
                  input: input,
                );
                accumulated = [...accumulated, block];
                pendingToolCalls.add(block);
                replaceDraft();
              case ev.StreamError(:final message):
                accumulated = [
                  ...accumulated,
                  TextBlock('\n\n[Error: $message]')
                ];
                replaceDraft();
              case ev.Stop():
              case ev.ToolUseStart():
              case ev.ToolUseDelta():
                break;
            }
          },
          onError: (Object e, StackTrace st) {
            accumulated = [...accumulated, TextBlock('\n\n[Error: $e]')];
            replaceDraft();
            if (!completer.isCompleted) completer.complete();
          },
          onDone: () {
            if (!completer.isCompleted) completer.complete();
          },
        );

        await completer.future;
        _activeStream = null;
        await storage.saveConversation(working);

        if (pendingToolCalls.isEmpty) break;

        // Execute tool calls and append a tool-role message with all results.
        final results = <ContentBlock>[];
        for (final call in pendingToolCalls) {
          String output;
          var isError = false;
          if (toolHandler == null) {
            output = 'No tool handler available for "${call.toolName}".';
            isError = true;
          } else {
            try {
              output = await toolHandler(call.toolName, call.input);
            } catch (e) {
              output = e.toString();
              isError = true;
            }
          }
          results.add(ToolResultBlock(
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            output: output,
            isError: isError,
          ));
        }

        final toolMsg = ChatMessage(
          id: _generateId('m'),
          role: MessageRole.tool,
          blocks: results,
          createdAt: DateTime.now(),
        );
        draftAssistant = ChatMessage(
          id: _generateId('m'),
          role: MessageRole.assistant,
          blocks: const [],
          createdAt: DateTime.now(),
          modelId: activeModel.qualifiedId,
        );
        working = working.copyWith(
          messages: [...working.messages, toolMsg, draftAssistant],
          updatedAt: DateTime.now(),
        );
        state = AsyncData(working);
        await storage.saveConversation(working);

        hops++;
      }
    } finally {
      _activeStream = null;
      ref.read(chatStreamingProvider.notifier).state = false;
      await storage.saveConversation(working);
      ref.invalidate(conversationSummariesProvider);
    }
  }

  Future<String?> _composeSystemPrompt(Ref ref, AiContext? aiContext) async {
    final general = await ref.read(generalAgentMdProvider.future);
    final quarkMd = aiContext?.quarkId != null
        ? await ref.read(quarkAgentMdProvider(aiContext!.quarkId).future)
        : '';
    final addition = aiContext?.systemPromptAddition ?? '';
    final parts = [general, quarkMd, addition]
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    return parts.isEmpty ? null : parts.join('\n\n');
  }

  /// Aborts the in-flight stream (assistant message keeps whatever it had so
  /// far).
  Future<void> cancel() async {
    await _activeStream?.cancel();
    _activeStream = null;
    ref.read(chatStreamingProvider.notifier).state = false;
    final conv = state.valueOrNull;
    if (conv != null) {
      await ref.read(chatStorageServiceProvider).saveConversation(conv);
    }
  }

  /// Assembles the context that should be sent to the LLM alongside the
  /// user's typed text but kept out of the visible chat bubble — attachments
  /// (default + chips) and, if no explicit `selection` chip is staged, the
  /// "user is referring to this paragraph" prefix.
  String _composeHiddenContext(
    List<AiAttachment> attachments,
    AiContext? aiContext,
  ) {
    final parts = <String>[];

    final selection = aiContext?.currentSelectionText;
    final hasSelectionChip =
        attachments.any((a) => a.suggestionId == 'selection');
    if (selection != null &&
        selection.trim().isNotEmpty &&
        !hasSelectionChip) {
      parts.add(
        'El usuario está refiriéndose a este párrafo:\n"""\n$selection\n"""',
      );
    }

    final defaultAtt = aiContext?.defaultAttachments ?? const [];
    for (final a in [...defaultAtt, ...attachments]) {
      parts.add(a.renderForPrompt());
    }

    return parts.join('\n\n');
  }

  String _deriveTitleFrom(String text) {
    final stripped = text.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (stripped.length <= 48) return stripped;
    return '${stripped.substring(0, 45)}…';
  }
}

String _generateId(String prefix) =>
    '$prefix${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}';
