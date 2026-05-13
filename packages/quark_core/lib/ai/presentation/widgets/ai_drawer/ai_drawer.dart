import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../theme/quarks_color_extension.dart';
import '../../../domain/ai_context.dart';
import '../../../domain/chat_message.dart';
import '../../../domain/content_block.dart';
import '../../../domain/conversation.dart';
import '../../providers/ai_context_provider.dart';
import '../../providers/chat_providers.dart';
import '../../providers/llm_providers.dart';
import '../ai_settings/ai_settings_dialog.dart';
import 'model_selector.dart';

const _kDrawerMinWidth = 320.0;
const _kDrawerMaxWidth = 720.0;
const _kAnimDuration = Duration(milliseconds: 180);

/// Global AI drawer. Slides in from the right when [aiDrawerOpenProvider] is
/// true. Owns its own resize handle and the switch between the conversations
/// list and the active conversation view.
class AiDrawer extends ConsumerStatefulWidget {
  const AiDrawer({super.key});

  @override
  ConsumerState<AiDrawer> createState() => _AiDrawerState();
}

class _AiDrawerState extends ConsumerState<AiDrawer> {
  bool _showingList = false;

  @override
  Widget build(BuildContext context) {
    final open = ref.watch(aiDrawerOpenProvider);
    final width = ref.watch(aiDrawerWidthProvider);
    final colors = context.quarksColors;

    return AnimatedPositioned(
      duration: _kAnimDuration,
      curve: Curves.easeOutCubic,
      top: 0,
      bottom: 0,
      right: open ? 0 : -width,
      width: width,
      child: Material(
        color: Colors.transparent,
        child: Row(
          children: [
            _ResizeHandle(),
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: colors.surface,
                  border: Border(
                    left: BorderSide(color: colors.borderDark, width: 1),
                  ),
                ),
                child: Column(
                  children: [
                    _Header(
                      showingList: _showingList,
                      onToggleList: () =>
                          setState(() => _showingList = !_showingList),
                    ),
                    Expanded(
                      child: _showingList
                          ? _ConversationListView(
                              onPicked: () =>
                                  setState(() => _showingList = false),
                            )
                          : const _ConversationView(),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ResizeHandle extends ConsumerStatefulWidget {
  @override
  ConsumerState<_ResizeHandle> createState() => _ResizeHandleState();
}

class _ResizeHandleState extends ConsumerState<_ResizeHandle> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return MouseRegion(
      cursor: SystemMouseCursors.resizeLeftRight,
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onHorizontalDragUpdate: (details) {
          final current = ref.read(aiDrawerWidthProvider);
          final next = (current - details.delta.dx)
              .clamp(_kDrawerMinWidth, _kDrawerMaxWidth);
          ref.read(aiDrawerWidthProvider.notifier).state = next;
        },
        child: Container(
          width: 4,
          color: _hovering ? colors.primary : Colors.transparent,
        ),
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  final bool showingList;
  final VoidCallback onToggleList;

  const _Header({required this.showingList, required this.onToggleList});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final activeId = ref.watch(activeConversationIdProvider);
    final summaries = ref.watch(conversationSummariesProvider).valueOrNull ?? const [];
    final activeSummary = activeId == null
        ? null
        : summaries.cast<ConversationSummary?>().firstWhere(
              (s) => s?.id == activeId,
              orElse: () => null,
            );

    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: colors.primary,
        border: Border(
          bottom: BorderSide(color: colors.borderDark, width: 1),
        ),
      ),
      child: Row(
        children: [
          _IconBtn(
            icon: showingList ? Icons.arrow_back : Icons.menu,
            tooltip: showingList ? 'Volver' : 'Conversaciones',
            onTap: onToggleList,
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              showingList
                  ? 'Conversaciones'
                  : (activeSummary?.title ?? 'IA'),
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 13,
                color: colors.textPrimary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          if (!showingList) ...[
            const ProviderSelector(),
            const SizedBox(width: 4),
            const ModelSelector(),
          ],
          const SizedBox(width: 4),
          _IconBtn(
            icon: Icons.settings_outlined,
            tooltip: 'Settings IA',
            onTap: () => showAiSettingsDialog(context),
          ),
          _IconBtn(
            icon: Icons.close,
            tooltip: 'Cerrar (Esc)',
            onTap: () =>
                ref.read(aiDrawerOpenProvider.notifier).state = false,
          ),
        ],
      ),
    );
  }
}

class _IconBtn extends StatefulWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _IconBtn({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  @override
  State<_IconBtn> createState() => _IconBtnState();
}

class _IconBtnState extends State<_IconBtn> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Tooltip(
      message: widget.tooltip,
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            color: _hovering ? colors.primaryDark : Colors.transparent,
            child: Icon(widget.icon, size: 16, color: colors.textPrimary),
          ),
        ),
      ),
    );
  }
}

class _ConversationListView extends ConsumerWidget {
  final VoidCallback onPicked;

  const _ConversationListView({required this.onPicked});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final summariesAsync = ref.watch(conversationSummariesProvider);

    return summariesAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            'Error cargando conversaciones: $e',
            style: TextStyle(color: colors.error, fontSize: 12),
          ),
        ),
      ),
      data: (summaries) {
        if (summaries.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Sin conversaciones todavía',
                  style:
                      TextStyle(color: colors.textSecondary, fontSize: 12),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => _newConversation(context, ref),
                  child: const Text('Nueva conversación'),
                ),
              ],
            ),
          );
        }
        return Column(
          children: [
            _NewChatButton(
              onTap: () async {
                await _newConversation(context, ref);
                onPicked();
              },
            ),
            Expanded(
              child: ListView.builder(
                itemCount: summaries.length,
                itemBuilder: (ctx, i) {
                  final s = summaries[i];
                  return _ConversationRow(
                    summary: s,
                    onTap: () {
                      ref.read(activeConversationIdProvider.notifier).state = s.id;
                      onPicked();
                    },
                    onDelete: () async {
                      await ref
                          .read(conversationSummariesProvider.notifier)
                          .deleteConversation(s.id);
                      if (ref.read(activeConversationIdProvider) == s.id) {
                        ref.read(activeConversationIdProvider.notifier).state =
                            null;
                      }
                    },
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _newConversation(BuildContext context, WidgetRef ref) async {
    final activeModel = ref.read(activeModelProvider);
    if (activeModel == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              'Configurá un proveedor primero (gear en el header del drawer).'),
          duration: Duration(seconds: 4),
        ),
      );
      return;
    }
    final activeQuark = ref.read(activeQuarkProvider);
    final conv = await ref
        .read(conversationSummariesProvider.notifier)
        .createConversation(
          modelId: activeModel.qualifiedId,
          originQuarkId: activeQuark?.id,
        );
    ref.read(activeConversationIdProvider.notifier).state = conv.id;
  }
}

class _NewChatButton extends StatelessWidget {
  final VoidCallback onTap;

  const _NewChatButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: colors.borderLight, width: 1),
          ),
        ),
        child: Row(
          children: [
            Icon(Icons.add, size: 14, color: colors.textPrimary),
            const SizedBox(width: 8),
            Text(
              'Nueva conversación',
              style: TextStyle(fontSize: 12, color: colors.textPrimary),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConversationRow extends StatefulWidget {
  final ConversationSummary summary;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _ConversationRow({
    required this.summary,
    required this.onTap,
    required this.onDelete,
  });

  @override
  State<_ConversationRow> createState() => _ConversationRowState();
}

class _ConversationRowState extends State<_ConversationRow> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          color: _hovering ? colors.cardHover : Colors.transparent,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  widget.summary.title,
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                  style: TextStyle(fontSize: 12, color: colors.textPrimary),
                ),
              ),
              if (_hovering)
                GestureDetector(
                  onTap: widget.onDelete,
                  child: Icon(Icons.delete_outline,
                      size: 14, color: colors.textSecondary),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ConversationView extends ConsumerWidget {
  const _ConversationView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final activeId = ref.watch(activeConversationIdProvider);
    final activeModel = ref.watch(activeModelProvider);

    if (activeModel == null) {
      return _EmptyState(
        title: 'No hay modelos configurados',
        body: 'Pegá una API key desde el gear (arriba a la derecha).',
        action: 'Abrir settings',
        onAction: () => showAiSettingsDialog(context),
      );
    }

    if (activeId == null) {
      return _EmptyState(
        title: 'Sin conversación activa',
        body: 'Creá una nueva o elegí una existente.',
        action: 'Nueva conversación',
        onAction: () async {
          final aq = ref.read(activeQuarkProvider);
          final conv = await ref
              .read(conversationSummariesProvider.notifier)
              .createConversation(
                modelId: activeModel.qualifiedId,
                originQuarkId: aq?.id,
              );
          ref.read(activeConversationIdProvider.notifier).state = conv.id;
        },
      );
    }

    final convAsync = ref.watch(conversationProvider(activeId));

    return convAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            'Error: $e',
            style: TextStyle(color: colors.error, fontSize: 12),
          ),
        ),
      ),
      data: (conv) {
        return Column(
          children: [
            _ContextBanner(),
            Expanded(child: _MessageList(messages: conv.messages)),
            _ContextChipBar(),
            _MessageInput(conversationId: conv.id),
          ],
        );
      },
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String title;
  final String body;
  final String action;
  final VoidCallback onAction;

  const _EmptyState({
    required this.title,
    required this.body,
    required this.action,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: colors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              body,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: colors.textSecondary),
            ),
            const SizedBox(height: 16),
            TextButton(onPressed: onAction, child: Text(action)),
          ],
        ),
      ),
    );
  }
}

class _ContextBanner extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final activeQuark = ref.watch(activeQuarkProvider);
    final aiContext = activeQuark?.buildAiContext(context, ref);
    if (aiContext == null || aiContext.contextLabel == null) {
      return const SizedBox.shrink();
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        border: Border(
          bottom: BorderSide(color: colors.borderLight, width: 1),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.link, size: 12, color: colors.textSecondary),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              'Contexto: ${aiContext.contextLabel}',
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 11, color: colors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageList extends ConsumerWidget {
  final List<ChatMessage> messages;

  const _MessageList({required this.messages});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final streaming = ref.watch(chatStreamingProvider);
    if (messages.isEmpty) {
      final colors = context.quarksColors;
      return Center(
        child: Text(
          'Escribí abajo para empezar.',
          style: TextStyle(fontSize: 12, color: colors.textSecondary),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 12),
      itemCount: messages.length,
      itemBuilder: (ctx, i) {
        final msg = messages[i];
        final isLast = i == messages.length - 1;
        return _MessageBubble(
          message: msg,
          isStreaming: streaming && isLast && msg.role == MessageRole.assistant,
        );
      },
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final bool isStreaming;

  const _MessageBubble({required this.message, required this.isStreaming});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    if (message.role == MessageRole.tool) {
      return _ToolResultsCard(message: message);
    }

    final isUser = message.role == MessageRole.user;
    final text = message.plainText;
    final toolCalls = message.blocks.whereType<ToolUseBlock>().toList();

    if (text.isEmpty && toolCalls.isEmpty && !isStreaming) {
      return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.85,
        ),
        child: Column(
          crossAxisAlignment:
              isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (text.isNotEmpty || (isStreaming && toolCalls.isEmpty))
              Container(
                decoration: BoxDecoration(
                  color: isUser ? colors.primaryLight : colors.surfaceAlt,
                  border: Border.all(color: colors.borderLight, width: 1),
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: isStreaming
                    ? Text(
                        text.isEmpty ? '…' : text,
                        style: TextStyle(
                            fontSize: 13, color: colors.textPrimary),
                      )
                    : MarkdownBody(
                        data: text,
                        selectable: true,
                        styleSheet:
                            MarkdownStyleSheet.fromTheme(Theme.of(context))
                                .copyWith(
                          p: TextStyle(
                              fontSize: 13, color: colors.textPrimary),
                          code: TextStyle(
                            fontSize: 12,
                            backgroundColor: colors.surface,
                            color: colors.textPrimary,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ),
              ),
            for (final c in toolCalls)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: _ToolCallCard(call: c),
              ),
          ],
        ),
      ),
    );
  }
}

class _ToolCallCard extends StatefulWidget {
  final ToolUseBlock call;
  const _ToolCallCard({required this.call});

  @override
  State<_ToolCallCard> createState() => _ToolCallCardState();
}

class _ToolCallCardState extends State<_ToolCallCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border.all(color: colors.borderLight, width: 1),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  _expanded
                      ? Icons.keyboard_arrow_down
                      : Icons.keyboard_arrow_right,
                  size: 12,
                  color: colors.textSecondary,
                ),
                const SizedBox(width: 4),
                Icon(Icons.build_outlined,
                    size: 12, color: colors.textSecondary),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    widget.call.toolName,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      color: colors.textPrimary,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
              ],
            ),
            if (_expanded) ...[
              const SizedBox(height: 4),
              Text(
                'input: ${_prettyJson(widget.call.input)}',
                style: TextStyle(
                  fontSize: 11,
                  color: colors.textSecondary,
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ToolResultsCard extends StatefulWidget {
  final ChatMessage message;
  const _ToolResultsCard({required this.message});

  @override
  State<_ToolResultsCard> createState() => _ToolResultsCardState();
}

class _ToolResultsCardState extends State<_ToolResultsCard> {
  final Set<String> _expanded = <String>{};

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final results = widget.message.blocks.whereType<ToolResultBlock>().toList();
    if (results.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      alignment: Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.85,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final r in results)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: GestureDetector(
                  onTap: () => setState(() {
                    if (!_expanded.add(r.toolCallId)) {
                      _expanded.remove(r.toolCallId);
                    }
                  }),
                  child: Container(
                    decoration: BoxDecoration(
                      color: r.isError ? colors.error.withValues(alpha: 0.1) : colors.surface,
                      border: Border.all(
                          color: r.isError ? colors.error : colors.borderLight,
                          width: 1),
                    ),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 6),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              _expanded.contains(r.toolCallId)
                                  ? Icons.keyboard_arrow_down
                                  : Icons.keyboard_arrow_right,
                              size: 12,
                              color: colors.textSecondary,
                            ),
                            const SizedBox(width: 4),
                            Icon(
                              r.isError
                                  ? Icons.error_outline
                                  : Icons.check_circle_outline,
                              size: 12,
                              color: r.isError
                                  ? colors.error
                                  : colors.textSecondary,
                            ),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                '${r.toolName} → ${_previewOutput(r.output)}',
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: colors.textPrimary,
                                  fontFamily: 'monospace',
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (_expanded.contains(r.toolCallId)) ...[
                          const SizedBox(height: 4),
                          SelectableText(
                            r.output,
                            style: TextStyle(
                              fontSize: 11,
                              color: colors.textSecondary,
                              fontFamily: 'monospace',
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

String _prettyJson(Map<String, dynamic> input) {
  if (input.isEmpty) return '{}';
  final parts = input.entries.map((e) => '${e.key}: ${e.value}').join(', ');
  return '{$parts}';
}

String _previewOutput(String output) {
  final s = output.replaceAll('\n', ' ').trim();
  if (s.length <= 80) return s;
  return '${s.substring(0, 77)}…';
}

class _ContextChipBar extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final pending = ref.watch(pendingAttachmentsProvider);
    final activeQuark = ref.watch(activeQuarkProvider);
    final aiContext = activeQuark?.buildAiContext(context, ref);
    final suggestions = aiContext?.suggestions ?? const [];

    // Non-suggestion pending items (e.g. future file drops).
    final extra = pending.where((a) => a.suggestionId == null).toList();

    if (extra.isEmpty && suggestions.isEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: colors.borderLight, width: 1)),
      ),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final att in extra)
            _RemovableChip(
              label: att.label,
              onTap: () {
                ref.read(pendingAttachmentsProvider.notifier).state =
                    pending.where((a) => a != att).toList();
              },
            ),
          for (final s in suggestions) _SuggestionChip(suggestion: s),
        ],
      ),
    );
  }
}

/// Toggle chip for an [AiAttachmentSuggestion]. Lit up when active (in pending).
class _SuggestionChip extends ConsumerStatefulWidget {
  final AiAttachmentSuggestion suggestion;
  const _SuggestionChip({required this.suggestion});

  @override
  ConsumerState<_SuggestionChip> createState() => _SuggestionChipState();
}

class _SuggestionChipState extends ConsumerState<_SuggestionChip> {
  bool _loading = false;

  Future<void> _toggle() async {
    final pending = ref.read(pendingAttachmentsProvider);
    final id = widget.suggestion.id;
    if (pending.any((a) => a.suggestionId == id)) {
      ref.read(pendingAttachmentsProvider.notifier).state =
          pending.where((a) => a.suggestionId != id).toList();
      return;
    }
    setState(() => _loading = true);
    try {
      final built = await widget.suggestion.build();
      if (built != null && mounted) {
        final current = ref.read(pendingAttachmentsProvider);
        ref.read(pendingAttachmentsProvider.notifier).state = [...current, built];
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final active = ref
        .watch(pendingAttachmentsProvider)
        .any((a) => a.suggestionId == widget.suggestion.id);

    return GestureDetector(
      onTap: _toggle,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: active ? colors.primaryLight : colors.surfaceAlt,
          border: Border.all(color: colors.borderLight, width: 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_loading)
              SizedBox(
                width: 10,
                height: 10,
                child: CircularProgressIndicator(
                    strokeWidth: 1.5, color: colors.textSecondary),
              )
            else
              Icon(widget.suggestion.icon, size: 11, color: colors.textPrimary),
            const SizedBox(width: 4),
            Text(widget.suggestion.label,
                style: TextStyle(fontSize: 11, color: colors.textPrimary)),
          ],
        ),
      ),
    );
  }
}

/// Removable chip for non-suggestion pending attachments.
class _RemovableChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _RemovableChip({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: colors.primaryLight,
          border: Border.all(color: colors.borderLight, width: 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.attach_file, size: 11, color: colors.textPrimary),
            const SizedBox(width: 4),
            Text(label,
                style: TextStyle(fontSize: 11, color: colors.textPrimary)),
            const SizedBox(width: 4),
            Icon(Icons.close, size: 10, color: colors.textSecondary),
          ],
        ),
      ),
    );
  }
}

class _MessageInput extends ConsumerStatefulWidget {
  final String conversationId;

  const _MessageInput({required this.conversationId});

  @override
  ConsumerState<_MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends ConsumerState<_MessageInput> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text;
    if (text.trim().isEmpty) return;
    final activeQuark = ref.read(activeQuarkProvider);
    final aiContext = activeQuark?.buildAiContext(context, ref);
    _controller.clear();
    try {
      await ref
          .read(conversationProvider(widget.conversationId).notifier)
          .sendUserMessage(text, aiContext: aiContext);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), duration: const Duration(seconds: 4)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final streaming = ref.watch(chatStreamingProvider);

    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        border: Border(
          top: BorderSide(color: colors.borderLight, width: 1),
        ),
      ),
      padding: const EdgeInsets.all(8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Container(
              constraints: const BoxConstraints(maxHeight: 140),
              decoration: BoxDecoration(
                color: colors.surface,
                border: Border.all(color: colors.borderLight, width: 1),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              child: TextField(
                controller: _controller,
                focusNode: _focusNode,
                maxLines: null,
                minLines: 1,
                enabled: !streaming,
                style:
                    TextStyle(fontSize: 13, color: colors.textPrimary),
                decoration: InputDecoration.collapsed(
                  hintText: streaming
                      ? 'Esperando respuesta…'
                      : 'Mensaje para la IA…',
                  hintStyle: TextStyle(
                    fontSize: 13,
                    color: colors.textLight,
                  ),
                ),
                textInputAction: TextInputAction.send,
                onSubmitted: streaming ? null : (_) => _send(),
              ),
            ),
          ),
          const SizedBox(width: 6),
          if (streaming)
            _SendButton(
              icon: Icons.stop,
              tooltip: 'Detener',
              onTap: () => ref
                  .read(conversationProvider(widget.conversationId).notifier)
                  .cancel(),
            )
          else
            _SendButton(
              icon: Icons.send,
              tooltip: 'Enviar (Enter)',
              onTap: _send,
            ),
        ],
      ),
    );
  }
}

class _SendButton extends StatefulWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _SendButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  @override
  State<_SendButton> createState() => _SendButtonState();
}

class _SendButtonState extends State<_SendButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Tooltip(
      message: widget.tooltip,
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: _hovering ? colors.primaryDark : colors.primary,
              border: Border.all(color: colors.borderDark, width: 1),
            ),
            child: Icon(widget.icon, size: 16, color: colors.textPrimary),
          ),
        ),
      ),
    );
  }
}
