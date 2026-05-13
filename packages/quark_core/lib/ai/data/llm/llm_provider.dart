import '../../domain/chat_message.dart';
import '../../domain/llm_model.dart';
import '../../domain/tool_definition.dart';
import 'llm_stream_event.dart';

/// Thrown when the provider's credentials are rejected (401/403) — the UI
/// uses this to prompt the user to re-auth.
class LlmAuthException implements Exception {
  final String providerId;
  final String message;
  const LlmAuthException(this.providerId, this.message);

  @override
  String toString() => 'LlmAuthException($providerId): $message';
}

/// Generic transport error not specific to auth (network, 5xx, malformed
/// response, etc.).
class LlmTransportException implements Exception {
  final String providerId;
  final String message;
  final Object? cause;
  const LlmTransportException(this.providerId, this.message, [this.cause]);

  @override
  String toString() => 'LlmTransportException($providerId): $message';
}

abstract class LlmProvider {
  String get providerId;
  String get displayName;
  List<LlmModel> get models;

  /// Streams an assistant turn. The caller is responsible for cancelling the
  /// subscription if it needs to abort.
  Stream<LlmStreamEvent> sendMessage({
    required LlmModel model,
    required List<ChatMessage> messages,
    String? systemPrompt,
    List<ToolDefinition>? tools,
    int? maxTokens,
    double? temperature,
  });

  /// Fast sanity-check used by the settings dialog's "Test" button.
  Future<bool> ping();
}
