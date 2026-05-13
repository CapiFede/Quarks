/// Provider-neutral content block inside an assistant or tool message.
///
/// Models the same shape Anthropic uses (text + tool_use + tool_result), since
/// it's the richest of the three big APIs — Gemini and OpenAI-compatible
/// responses get mapped down into this on the way in.
sealed class ContentBlock {
  const ContentBlock();

  Map<String, dynamic> toJson();

  static ContentBlock fromJson(Map<String, dynamic> json) {
    final type = json['type'] as String;
    switch (type) {
      case 'text':
        return TextBlock(json['text'] as String);
      case 'hidden_context':
        return HiddenContextBlock(json['text'] as String);
      case 'tool_use':
        return ToolUseBlock(
          toolCallId: json['toolCallId'] as String,
          toolName: json['toolName'] as String,
          input: Map<String, dynamic>.from(json['input'] as Map),
        );
      case 'tool_result':
        return ToolResultBlock(
          toolCallId: json['toolCallId'] as String,
          toolName: json['toolName'] as String? ?? '',
          output: json['output'] as String,
          isError: json['isError'] as bool? ?? false,
        );
      default:
        throw FormatException('Unknown ContentBlock type: $type');
    }
  }
}

class TextBlock extends ContentBlock {
  final String text;

  const TextBlock(this.text);

  @override
  Map<String, dynamic> toJson() => {'type': 'text', 'text': text};
}

/// Context the user attached to a message that should be sent to the LLM
/// but never rendered in the chat bubble (e.g. a chapter pasted via a
/// suggestion chip, the auto-prepended "user is referring to this paragraph"
/// prefix). Providers include it when serialising the user message;
/// [ChatMessage.plainText] ignores it so the UI shows only what the user
/// actually typed.
class HiddenContextBlock extends ContentBlock {
  final String text;

  const HiddenContextBlock(this.text);

  @override
  Map<String, dynamic> toJson() => {'type': 'hidden_context', 'text': text};
}

class ToolUseBlock extends ContentBlock {
  final String toolCallId;
  final String toolName;
  final Map<String, dynamic> input;

  const ToolUseBlock({
    required this.toolCallId,
    required this.toolName,
    required this.input,
  });

  @override
  Map<String, dynamic> toJson() => {
        'type': 'tool_use',
        'toolCallId': toolCallId,
        'toolName': toolName,
        'input': input,
      };
}

class ToolResultBlock extends ContentBlock {
  final String toolCallId;
  final String toolName;
  final String output;
  final bool isError;

  const ToolResultBlock({
    required this.toolCallId,
    required this.toolName,
    required this.output,
    this.isError = false,
  });

  @override
  Map<String, dynamic> toJson() => {
        'type': 'tool_result',
        'toolCallId': toolCallId,
        'toolName': toolName,
        'output': output,
        'isError': isError,
      };
}
