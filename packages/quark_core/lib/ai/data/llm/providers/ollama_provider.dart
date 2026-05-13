import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../domain/chat_message.dart';
import '../../../domain/llm_model.dart';
import '../../../domain/provider_config.dart';
import '../../../domain/tool_definition.dart';
import '../llm_provider.dart';
import '../llm_stream_event.dart';
import '_openai_compat_client.dart';

const _kProviderId = 'ollama';
const _kDefaultBaseUrl = 'http://localhost:11434';

const _kLocalModel = LlmModel(
  id: '__local__',
  providerId: _kProviderId,
  displayName: 'Local',
  contextWindow: 128000,
);

class OllamaProvider implements LlmProvider {
  final String _baseUrl;
  final OpenAiCompatClient _client;

  OllamaProvider._(this._baseUrl)
      : _client = OpenAiCompatClient(baseUrl: '$_baseUrl/v1');

  static OllamaProvider maybeBuild(ProviderConfig config) {
    final url = (config.baseUrl?.isNotEmpty == true)
        ? config.baseUrl!
        : _kDefaultBaseUrl;
    return OllamaProvider._(url);
  }

  @override
  String get providerId => _kProviderId;

  @override
  String get displayName => 'Ollama (local)';

  @override
  List<LlmModel> get models => const [_kLocalModel];

  /// Returns the model name currently loaded in Ollama, or null if none.
  Future<String?> _runningModelId() async {
    try {
      final res = await http
          .get(Uri.parse('$_baseUrl/api/ps'))
          .timeout(const Duration(seconds: 3));
      if (res.statusCode != 200) return null;
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      final list = json['models'] as List<dynamic>?;
      if (list == null || list.isEmpty) return null;
      return (list.first as Map<String, dynamic>)['model'] as String?;
    } catch (_) {
      return null;
    }
  }

  @override
  Stream<LlmStreamEvent> sendMessage({
    required LlmModel model,
    required List<ChatMessage> messages,
    String? systemPrompt,
    List<ToolDefinition>? tools,
    int? maxTokens,
    double? temperature,
  }) async* {
    final runningId = await _runningModelId();
    if (runningId == null) {
      throw LlmTransportException(
        _kProviderId,
        'No hay ningún modelo cargado en Ollama. '
        'Cargá un modelo primero (ej: ollama run llama3.2).',
      );
    }
    final resolved = LlmModel(
      id: runningId,
      providerId: _kProviderId,
      displayName: runningId,
      contextWindow: _kLocalModel.contextWindow,
    );
    yield* _client.sendMessage(
      model: resolved,
      messages: messages,
      systemPrompt: systemPrompt,
      maxTokens: maxTokens,
      temperature: temperature,
      providerId: _kProviderId,
    );
  }

  @override
  Future<bool> ping() async {
    final id = await _runningModelId();
    if (id == null) return false;
    return _client.ping(id, _kProviderId);
  }
}
