import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../domain/chat_message.dart';
import '../../../domain/content_block.dart';
import '../../../domain/llm_model.dart';
import '../llm_provider.dart';
import '../llm_stream_event.dart';

/// Shared SSE streaming client for OpenAI-compatible APIs (Ollama, etc.).
class OpenAiCompatClient {
  final String baseUrl;
  final String? apiKey;
  final Map<String, String> extraHeaders;

  OpenAiCompatClient({
    required this.baseUrl,
    this.apiKey,
    this.extraHeaders = const {},
  });

  Stream<LlmStreamEvent> sendMessage({
    required LlmModel model,
    required List<ChatMessage> messages,
    String? systemPrompt,
    int? maxTokens,
    double? temperature,
    required String providerId,
  }) async* {
    final body = _buildBody(
      model: model,
      messages: messages,
      systemPrompt: systemPrompt,
      maxTokens: maxTokens,
      temperature: temperature,
    );

    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (apiKey?.isNotEmpty == true) 'Authorization': 'Bearer $apiKey',
      ...extraHeaders,
    };

    final request = http.Request(
      'POST',
      Uri.parse('$baseUrl/chat/completions'),
    )
      ..headers.addAll(headers)
      ..body = jsonEncode(body);

    http.StreamedResponse response;
    try {
      response = await http.Client().send(request);
    } catch (e) {
      throw LlmTransportException(providerId, 'Connection failed', e);
    }

    if (response.statusCode == 401 || response.statusCode == 403) {
      throw LlmAuthException(providerId, 'HTTP ${response.statusCode}');
    }
    if (response.statusCode != 200) {
      final body = await response.stream.bytesToString();
      throw LlmTransportException(
          providerId, 'HTTP ${response.statusCode}: $body');
    }

    final buffer = StringBuffer();
    await for (final chunk
        in response.stream.transform(utf8.decoder)) {
      buffer.write(chunk);
      // Process complete lines from buffer
      final content = buffer.toString();
      final lines = content.split('\n');
      // Keep the last potentially-incomplete line in the buffer
      buffer
        ..clear()
        ..write(lines.last);

      for (final line in lines.sublist(0, lines.length - 1)) {
        final event = _parseLine(line.trim(), providerId);
        if (event != null) yield event;
      }
    }

    // Process any remaining buffered content
    final remaining = buffer.toString().trim();
    if (remaining.isNotEmpty) {
      final event = _parseLine(remaining, providerId);
      if (event != null) yield event;
    }

    yield const Stop(StopReason.endTurn);
  }

  LlmStreamEvent? _parseLine(String line, String providerId) {
    if (!line.startsWith('data: ')) return null;
    final data = line.substring(6).trim();
    if (data == '[DONE]') return const Stop(StopReason.endTurn);

    try {
      final json = jsonDecode(data) as Map<String, dynamic>;
      final choices = json['choices'] as List<dynamic>?;
      if (choices == null || choices.isEmpty) return null;
      final choice = choices.first as Map<String, dynamic>;
      final delta = choice['delta'] as Map<String, dynamic>?;
      final content = delta?['content'] as String?;
      final finishReason = choice['finish_reason'] as String?;

      if (content != null && content.isNotEmpty) {
        return TextDelta(content);
      }
      if (finishReason != null) {
        return Stop(_mapFinishReason(finishReason));
      }
    } catch (_) {
      // Malformed JSON — skip line silently
    }
    return null;
  }

  StopReason _mapFinishReason(String reason) => switch (reason) {
        'stop' => StopReason.endTurn,
        'length' => StopReason.maxTokens,
        'tool_calls' => StopReason.toolUse,
        _ => StopReason.endTurn,
      };

  Map<String, dynamic> _buildBody({
    required LlmModel model,
    required List<ChatMessage> messages,
    String? systemPrompt,
    int? maxTokens,
    double? temperature,
  }) {
    final oaiMessages = <Map<String, dynamic>>[];
    if (systemPrompt != null && systemPrompt.trim().isNotEmpty) {
      oaiMessages.add({'role': 'system', 'content': systemPrompt.trim()});
    }
    for (final m in messages) {
      switch (m.role) {
        case MessageRole.system:
          // Already added above — skip duplicates in the message list.
          break;
        case MessageRole.user:
          oaiMessages.add({'role': 'user', 'content': m.plainText});
        case MessageRole.assistant:
          if (m.plainText.trim().isNotEmpty) {
            oaiMessages.add({'role': 'assistant', 'content': m.plainText});
          }
        case MessageRole.tool:
          break;
      }
    }

    return {
      'model': model.id,
      'messages': oaiMessages,
      'stream': true,
      'max_tokens': maxTokens ?? 4096,
      if (temperature != null) 'temperature': temperature, // ignore: use_null_aware_elements
    };
  }

  Future<bool> ping(String modelId, String providerId) async {
    try {
      final stream = sendMessage(
        model: LlmModel(
          id: modelId,
          providerId: providerId,
          displayName: '',
          contextWindow: 4096,
        ),
        messages: [
          ChatMessage(
            id: 'ping',
            role: MessageRole.user,
            blocks: const [TextBlock('ping')],
            createdAt: DateTime.now(),
          ),
        ],
        maxTokens: 1,
        providerId: providerId,
      );
      await stream.first;
      return true;
    } on LlmAuthException {
      return false;
    } catch (_) {
      return false;
    }
  }
}
