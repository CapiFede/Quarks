import 'content_block.dart';

enum MessageRole {
  system,
  user,
  assistant,
  tool;

  String get wireValue => switch (this) {
        MessageRole.system => 'system',
        MessageRole.user => 'user',
        MessageRole.assistant => 'assistant',
        MessageRole.tool => 'tool',
      };

  static MessageRole fromWire(String value) => switch (value) {
        'system' => MessageRole.system,
        'user' => MessageRole.user,
        'assistant' => MessageRole.assistant,
        'tool' => MessageRole.tool,
        _ => throw FormatException('Unknown role: $value'),
      };
}

class ChatMessage {
  final String id;
  final MessageRole role;
  final List<ContentBlock> blocks;
  final DateTime createdAt;
  final String? modelId;

  ChatMessage({
    required this.id,
    required this.role,
    required this.blocks,
    required this.createdAt,
    this.modelId,
  });

  ChatMessage copyWith({
    List<ContentBlock>? blocks,
    String? modelId,
  }) {
    return ChatMessage(
      id: id,
      role: role,
      blocks: blocks ?? this.blocks,
      createdAt: createdAt,
      modelId: modelId ?? this.modelId,
    );
  }

  /// Text shown to the user in the chat bubble — only [TextBlock] content.
  String get plainText =>
      blocks.whereType<TextBlock>().map((b) => b.text).join();

  /// Text sent to the LLM for user messages — hidden context blocks first
  /// (attachments, selection prefix), then the user's typed text.
  String get wireText {
    final hidden = blocks.whereType<HiddenContextBlock>().map((b) => b.text);
    final visible = blocks.whereType<TextBlock>().map((b) => b.text);
    final parts = [...hidden, ...visible].where((s) => s.isNotEmpty);
    return parts.join('\n\n');
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'role': role.wireValue,
        'blocks': blocks.map((b) => b.toJson()).toList(),
        'createdAt': createdAt.toIso8601String(),
        if (modelId != null) 'modelId': modelId,
      };

  static ChatMessage fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] as String,
      role: MessageRole.fromWire(json['role'] as String),
      blocks: (json['blocks'] as List)
          .map((b) => ContentBlock.fromJson(Map<String, dynamic>.from(b as Map)))
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      modelId: json['modelId'] as String?,
    );
  }
}
