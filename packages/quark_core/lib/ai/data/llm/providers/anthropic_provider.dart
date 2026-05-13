import 'dart:async';
import 'dart:convert';

import 'package:anthropic_sdk_dart/anthropic_sdk_dart.dart' as anth;

import '../../../domain/chat_message.dart';
import '../../../domain/content_block.dart' as core_blocks;
import '../../../domain/llm_model.dart';
import '../../../domain/provider_config.dart';
import '../../../domain/tool_definition.dart' as core_tool;
import '../llm_provider.dart';
import '../llm_stream_event.dart';

const _kAnthropicProviderId = 'anthropic';

const List<LlmModel> _kAnthropicModels = [
  LlmModel(
    id: 'claude-opus-4-7',
    providerId: _kAnthropicProviderId,
    displayName: 'Claude Opus 4.7',
    contextWindow: 200000,
  ),
  LlmModel(
    id: 'claude-sonnet-4-6',
    providerId: _kAnthropicProviderId,
    displayName: 'Claude Sonnet 4.6',
    contextWindow: 200000,
  ),
  LlmModel(
    id: 'claude-haiku-4-5-20251001',
    providerId: _kAnthropicProviderId,
    displayName: 'Claude Haiku 4.5',
    contextWindow: 200000,
  ),
];

class AnthropicProvider implements LlmProvider {
  final ProviderConfig _config;
  final anth.AnthropicClient _client;

  AnthropicProvider._(this._config, this._client);

  /// Builds an [AnthropicProvider] for [config]. Returns null when the config
  /// has no usable credentials — the registry skips providers without creds.
  static AnthropicProvider? maybeBuild(ProviderConfig config) {
    if (!config.isConfigured) return null;
    if (config.authMode == ProviderAuthMode.apiKey) {
      final client = anth.AnthropicClient.withApiKey(config.apiKey!);
      return AnthropicProvider._(config, client);
    }
    // OAuth path — mimics Claude Code's header trick. The Messages API needs
    // x-api-key (via ApiKeyProvider), Authorization Bearer, and the beta header.
    final token = config.oauthAccessToken!;
    final client = anth.AnthropicClient(
      config: anth.AnthropicConfig(
        authProvider: anth.ApiKeyProvider(token),
        defaultHeaders: {
          'anthropic-beta': 'oauth-2025-04-20',
          'Authorization': 'Bearer $token',
        },
      ),
    );
    return AnthropicProvider._(config, client);
  }

  @override
  String get providerId => _kAnthropicProviderId;

  @override
  String get displayName => 'Anthropic';

  @override
  List<LlmModel> get models => _kAnthropicModels;

  /// System prompt prefix the Messages API expects when OAuth tokens are used.
  /// Without it, the request fails with "OAuth authentication is currently
  /// not supported".
  static const _oauthSystemPrefix =
      "You are Claude Code, Anthropic's official CLI for Claude.";

  @override
  Stream<LlmStreamEvent> sendMessage({
    required LlmModel model,
    required List<ChatMessage> messages,
    String? systemPrompt,
    List<core_tool.ToolDefinition>? tools,
    int? maxTokens,
    double? temperature,
  }) async* {
    // Fail fast if the OAuth token has already expired.
    if (_config.authMode == ProviderAuthMode.oauth) {
      final exp = _config.oauthExpiresAt;
      if (exp != null && DateTime.now().toUtc().isAfter(exp)) {
        throw LlmAuthException(
            providerId, 'OAuth token expired — reconnect in settings');
      }
    }

    final inputs = _mapToInputMessages(messages);
    final effectiveSystem = _buildSystemPrompt(systemPrompt);
    final anthTools = (tools == null || tools.isEmpty)
        ? null
        : tools
            .map((t) => anth.ToolDefinition.custom(anth.Tool(
                  name: t.name,
                  description: t.description,
                  inputSchema: anth.InputSchema.fromJson(t.inputSchema),
                )))
            .toList(growable: false);

    final request = anth.MessageCreateRequest(
      model: model.id,
      messages: inputs,
      maxTokens: maxTokens ?? 4096,
      system: effectiveSystem,
      temperature: temperature,
      tools: anthTools,
    );

    Stream<anth.MessageStreamEvent> stream;
    try {
      stream = _client.messages.createStream(request);
    } on anth.AuthenticationException catch (e) {
      throw LlmAuthException(providerId, e.toString());
    } catch (e) {
      throw LlmTransportException(providerId, 'Failed to start stream', e);
    }

    // Track per-content-block state so we can emit tool_use end events with
    // a fully-parsed input map, and avoid leaking SDK types upward.
    final toolBuffers = <int, _ToolBuffer>{};

    try {
      await for (final event in stream) {
        switch (event) {
          case anth.ContentBlockStartEvent(:final index, :final contentBlock):
            if (contentBlock is anth.ToolUseBlock) {
              toolBuffers[index] = _ToolBuffer(
                callId: contentBlock.id,
                toolName: contentBlock.name,
              );
              yield ToolUseStart(
                callId: contentBlock.id,
                toolName: contentBlock.name,
              );
            }
          case anth.ContentBlockDeltaEvent(:final index, :final delta):
            switch (delta) {
              case anth.TextDelta(:final text):
                yield TextDelta(text);
              case anth.InputJsonDelta(:final partialJson):
                final buf = toolBuffers[index];
                if (buf != null) {
                  buf.partialJson.write(partialJson);
                  yield ToolUseDelta(
                    callId: buf.callId,
                    inputJsonChunk: partialJson,
                  );
                }
              default:
                // Other delta types (thinking, signature, citations, etc.) are
                // ignored for MVP — we only render text and tool use.
                break;
            }
          case anth.ContentBlockStopEvent(:final index):
            final buf = toolBuffers.remove(index);
            if (buf != null) {
              Map<String, dynamic> parsed;
              try {
                parsed = buf.partialJson.isEmpty
                    ? const {}
                    : jsonDecode(buf.partialJson.toString())
                        as Map<String, dynamic>;
              } catch (_) {
                parsed = const {};
              }
              yield ToolUseEnd(
                callId: buf.callId,
                toolName: buf.toolName,
                input: parsed,
              );
            }
          case anth.MessageDeltaEvent(:final delta):
            // Capture stop_reason when it arrives on the message-level delta.
            final reason = _mapStopReason(delta.stopReason?.toJson());
            if (reason != null) {
              yield Stop(reason);
            }
          case anth.MessageStopEvent():
            // The provider emits the canonical Stop above on MessageDeltaEvent;
            // here we only forward end-of-turn if we never saw a reason.
            break;
          case anth.ErrorEvent(:final errorType, :final message):
            yield StreamError('[$errorType] $message');
          default:
            break;
        }
      }
    } on anth.AuthenticationException catch (e) {
      throw LlmAuthException(providerId, e.toString());
    } on anth.RateLimitException catch (e) {
      yield StreamError('Rate limited: ${e.toString()}', e);
    } on anth.ApiException catch (e) {
      yield StreamError('API error: ${e.toString()}', e);
    } catch (e) {
      yield StreamError('Unexpected error: $e', e);
    }
  }

  @override
  Future<bool> ping() async {
    try {
      final stream = _client.messages.createStream(
        anth.MessageCreateRequest(
          model: 'claude-haiku-4-5-20251001',
          maxTokens: 1,
          messages: [anth.InputMessage.user('ping')],
          system: _buildSystemPrompt(null),
        ),
      );
      await stream.first;
      return true;
    } on anth.AuthenticationException {
      return false;
    } catch (_) {
      return false;
    }
  }

  List<anth.InputMessage> _mapToInputMessages(List<ChatMessage> messages) {
    final out = <anth.InputMessage>[];
    for (final m in messages) {
      switch (m.role) {
        case MessageRole.system:
          continue;
        case MessageRole.user:
          out.add(anth.InputMessage.user(m.wireText));
        case MessageRole.assistant:
          final blocks = <anth.InputContentBlock>[];
          for (final b in m.blocks) {
            if (b is core_blocks.TextBlock && b.text.isNotEmpty) {
              blocks.add(anth.TextInputBlock(b.text));
            } else if (b is core_blocks.ToolUseBlock) {
              blocks.add(anth.ToolUseInputBlock(
                id: b.toolCallId,
                name: b.toolName,
                input: b.input,
              ));
            }
          }
          if (blocks.isEmpty) continue;
          out.add(anth.InputMessage.assistantBlocks(blocks));
        case MessageRole.tool:
          // Anthropic expects tool_result blocks in a user-role message.
          final blocks = <anth.InputContentBlock>[];
          for (final b in m.blocks) {
            if (b is core_blocks.ToolResultBlock) {
              blocks.add(anth.ToolResultInputBlock.text(
                toolUseId: b.toolCallId,
                text: b.output,
                isError: b.isError ? true : null,
              ));
            }
          }
          if (blocks.isEmpty) continue;
          out.add(anth.InputMessage.userBlocks(blocks));
      }
    }
    return out;
  }

  anth.SystemPrompt? _buildSystemPrompt(String? userSystem) {
    final isOauth = _config.authMode == ProviderAuthMode.oauth;
    final parts = <String>[
      if (isOauth) _oauthSystemPrefix,
      if (userSystem != null && userSystem.trim().isNotEmpty) userSystem.trim(),
    ];
    if (parts.isEmpty) return null;
    return anth.SystemPrompt.text(parts.join('\n\n'));
  }

  StopReason? _mapStopReason(dynamic raw) {
    if (raw is! String) return null;
    return switch (raw) {
      'end_turn' => StopReason.endTurn,
      'max_tokens' => StopReason.maxTokens,
      'tool_use' => StopReason.toolUse,
      _ => null,
    };
  }
}

class _ToolBuffer {
  final String callId;
  final String toolName;
  final StringBuffer partialJson = StringBuffer();

  _ToolBuffer({required this.callId, required this.toolName});
}
