import 'dart:async';

import 'package:google_generative_ai/google_generative_ai.dart' as gen;

import '../../../domain/chat_message.dart';
import '../../../domain/content_block.dart';
import '../../../domain/llm_model.dart';
import '../../../domain/provider_config.dart';
import '../../../domain/tool_definition.dart';
import '../llm_provider.dart';
import '../llm_stream_event.dart';

const _kGoogleProviderId = 'google';

const List<LlmModel> _kGoogleModels = [
  LlmModel(
    id: 'gemini-2.5-flash',
    providerId: _kGoogleProviderId,
    displayName: 'Gemini 2.5 Flash',
    contextWindow: 1048576,
  ),
  LlmModel(
    id: 'gemini-3-flash-preview',
    providerId: _kGoogleProviderId,
    displayName: 'Gemini 3.1 Flash',
    contextWindow: 1048576,
  ),
  LlmModel(
    id: 'gemini-3.1-flash-lite',
    providerId: _kGoogleProviderId,
    displayName: 'Gemini 3.1 Flash Lite',
    contextWindow: 1048576,
  )
];

class GoogleProvider implements LlmProvider {
  final String _apiKey;

  GoogleProvider._(this._apiKey);

  static GoogleProvider? maybeBuild(ProviderConfig config) {
    if (!config.isConfigured) return null;
    if (config.authMode != ProviderAuthMode.apiKey) return null;
    return GoogleProvider._(config.apiKey!);
  }

  @override
  String get providerId => _kGoogleProviderId;

  @override
  String get displayName => 'Google Gemini';

  @override
  List<LlmModel> get models => _kGoogleModels;

  @override
  Stream<LlmStreamEvent> sendMessage({
    required LlmModel model,
    required List<ChatMessage> messages,
    String? systemPrompt,
    List<ToolDefinition>? tools,
    int? maxTokens,
    double? temperature,
  }) async* {
    final genTools = (tools == null || tools.isEmpty)
        ? null
        : <gen.Tool>[
            gen.Tool(
              functionDeclarations:
                  tools.map(_toFunctionDeclaration).toList(growable: false),
            ),
          ];

    final genModel = gen.GenerativeModel(
      model: model.id,
      apiKey: _apiKey,
      systemInstruction:
          (systemPrompt != null && systemPrompt.trim().isNotEmpty)
              ? gen.Content.system(systemPrompt.trim())
              : null,
      generationConfig: gen.GenerationConfig(
        maxOutputTokens: maxTokens,
        temperature: temperature,
      ),
      tools: genTools,
    );

    final contents = _mapToContents(messages);

    Stream<gen.GenerateContentResponse> stream;
    try {
      stream = genModel.generateContentStream(contents);
    } on gen.InvalidApiKey catch (e) {
      throw LlmAuthException(providerId, e.toString());
    } catch (e) {
      throw LlmTransportException(providerId, 'Failed to start stream', e);
    }

    StopReason? finalReason;
    var sawToolCall = false;
    var callCounter = 0;
    try {
      await for (final resp in stream) {
        for (final candidate in resp.candidates) {
          for (final part in candidate.content.parts) {
            if (part is gen.TextPart) {
              if (part.text.isNotEmpty) {
                yield TextDelta(part.text);
              }
            } else if (part is gen.FunctionCall) {
              sawToolCall = true;
              final callId =
                  'gem_${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}_${callCounter++}';
              yield ToolUseStart(callId: callId, toolName: part.name);
              yield ToolUseEnd(
                callId: callId,
                toolName: part.name,
                input: Map<String, dynamic>.from(part.args),
              );
            }
          }
          final finish = candidate.finishReason;
          if (finish != null && finalReason == null) {
            finalReason = _mapFinish(finish);
          }
        }
      }
    } on gen.InvalidApiKey catch (e) {
      throw LlmAuthException(providerId, e.toString());
    } on gen.ServerException catch (e) {
      yield StreamError('Server error: ${e.message}', e);
      return;
    } catch (e) {
      yield StreamError('Unexpected error: $e', e);
      return;
    }

    // Gemini reports `stop` even when it emitted a FunctionCall — the
    // runtime needs the toolUse signal to actually run the handler.
    if (sawToolCall) {
      yield const Stop(StopReason.toolUse);
    } else {
      yield Stop(finalReason ?? StopReason.endTurn);
    }
  }

  @override
  Future<bool> ping() async {
    try {
      final m = gen.GenerativeModel(
        model: 'gemini-2.5-flash',
        apiKey: _apiKey,
        generationConfig: gen.GenerationConfig(maxOutputTokens: 1),
      );
      await m.generateContent([gen.Content.text('ping')]);
      return true;
    } on gen.InvalidApiKey {
      return false;
    } catch (_) {
      return false;
    }
  }

  List<gen.Content> _mapToContents(List<ChatMessage> messages) {
    final out = <gen.Content>[];
    for (final m in messages) {
      switch (m.role) {
        case MessageRole.system:
          continue;
        case MessageRole.user:
          final text = m.wireText;
          if (text.trim().isEmpty) continue;
          out.add(gen.Content.text(text));
        case MessageRole.assistant:
          final parts = <gen.Part>[];
          for (final b in m.blocks) {
            if (b is TextBlock && b.text.isNotEmpty) {
              parts.add(gen.TextPart(b.text));
            } else if (b is ToolUseBlock) {
              parts.add(gen.FunctionCall(b.toolName, b.input));
            }
          }
          if (parts.isEmpty) continue;
          out.add(gen.Content.model(parts));
        case MessageRole.tool:
          final responses = <gen.FunctionResponse>[];
          for (final b in m.blocks) {
            if (b is ToolResultBlock) {
              responses.add(gen.FunctionResponse(
                b.toolName,
                {
                  if (b.isError) 'error': b.output else 'result': b.output,
                },
              ));
            }
          }
          if (responses.isEmpty) continue;
          out.add(gen.Content.functionResponses(responses));
      }
    }
    return out;
  }

  StopReason _mapFinish(gen.FinishReason finish) => switch (finish) {
        gen.FinishReason.stop => StopReason.endTurn,
        gen.FinishReason.maxTokens => StopReason.maxTokens,
        gen.FinishReason.safety => StopReason.error,
        gen.FinishReason.recitation => StopReason.error,
        gen.FinishReason.other => StopReason.error,
        gen.FinishReason.unspecified => StopReason.endTurn,
      };

  gen.FunctionDeclaration _toFunctionDeclaration(ToolDefinition tool) {
    final schema = _schemaFromJson(tool.inputSchema);
    return gen.FunctionDeclaration(tool.name, tool.description, schema);
  }

  gen.Schema? _schemaFromJson(Map<String, dynamic> json) {
    final type = (json['type'] as String?)?.toLowerCase();
    if (type == null) return null;
    final description = json['description'] as String?;
    final nullable = json['nullable'] as bool?;
    switch (type) {
      case 'object':
        final propsJson =
            (json['properties'] as Map?)?.cast<String, dynamic>() ??
                const <String, dynamic>{};
        final props = <String, gen.Schema>{};
        for (final entry in propsJson.entries) {
          final sub = (entry.value as Map).cast<String, dynamic>();
          final childSchema = _schemaFromJson(sub);
          if (childSchema != null) props[entry.key] = childSchema;
        }
        final required = (json['required'] as List?)?.cast<String>();
        return gen.Schema.object(
          properties: props,
          requiredProperties: required,
          description: description,
          nullable: nullable,
        );
      case 'array':
        final itemsJson =
            (json['items'] as Map?)?.cast<String, dynamic>() ?? const {};
        final itemsSchema = _schemaFromJson(itemsJson) ??
            gen.Schema.string();
        return gen.Schema.array(
          items: itemsSchema,
          description: description,
          nullable: nullable,
        );
      case 'string':
        final enumValues = (json['enum'] as List?)?.cast<String>();
        if (enumValues != null) {
          return gen.Schema.enumString(
            enumValues: enumValues,
            description: description,
            nullable: nullable,
          );
        }
        return gen.Schema.string(
          description: description,
          nullable: nullable,
        );
      case 'integer':
        return gen.Schema.integer(
          description: description,
          nullable: nullable,
        );
      case 'number':
        return gen.Schema.number(
          description: description,
          nullable: nullable,
        );
      case 'boolean':
        return gen.Schema.boolean(
          description: description,
          nullable: nullable,
        );
      default:
        return null;
    }
  }
}
