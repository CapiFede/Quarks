/// Provider-neutral event emitted while an assistant turn is streaming.
/// Each concrete [LlmProvider] translates its SDK's native stream into a
/// sequence of these events.
sealed class LlmStreamEvent {
  const LlmStreamEvent();
}

class TextDelta extends LlmStreamEvent {
  final String text;
  const TextDelta(this.text);
}

class ToolUseStart extends LlmStreamEvent {
  final String callId;
  final String toolName;
  const ToolUseStart({required this.callId, required this.toolName});
}

class ToolUseDelta extends LlmStreamEvent {
  final String callId;
  final String inputJsonChunk;
  const ToolUseDelta({required this.callId, required this.inputJsonChunk});
}

class ToolUseEnd extends LlmStreamEvent {
  final String callId;
  final String toolName;
  final Map<String, dynamic> input;
  const ToolUseEnd({
    required this.callId,
    required this.toolName,
    required this.input,
  });
}

enum StopReason { endTurn, maxTokens, toolUse, cancelled, error }

class Stop extends LlmStreamEvent {
  final StopReason reason;
  const Stop(this.reason);
}

class StreamError extends LlmStreamEvent {
  final String message;
  final Object? cause;
  const StreamError(this.message, [this.cause]);
}
