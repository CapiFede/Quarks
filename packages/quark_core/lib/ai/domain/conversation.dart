import 'chat_message.dart';

class Conversation {
  static const int currentSchemaVersion = 1;

  final String id;
  final String title;
  final String modelId;
  final String? originQuarkId;
  final List<ChatMessage> messages;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Conversation({
    required this.id,
    required this.title,
    required this.modelId,
    required this.messages,
    required this.createdAt,
    required this.updatedAt,
    this.originQuarkId,
  });

  Conversation copyWith({
    String? title,
    String? modelId,
    List<ChatMessage>? messages,
    DateTime? updatedAt,
  }) {
    return Conversation(
      id: id,
      title: title ?? this.title,
      modelId: modelId ?? this.modelId,
      originQuarkId: originQuarkId,
      messages: messages ?? this.messages,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, dynamic> toJson() => {
        'schemaVersion': currentSchemaVersion,
        'id': id,
        'title': title,
        'modelId': modelId,
        if (originQuarkId != null) 'originQuarkId': originQuarkId,
        'messages': messages.map((m) => m.toJson()).toList(),
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  static Conversation fromJson(Map<String, dynamic> json) {
    return Conversation(
      id: json['id'] as String,
      title: json['title'] as String,
      modelId: json['modelId'] as String,
      originQuarkId: json['originQuarkId'] as String?,
      messages: (json['messages'] as List)
          .map((m) => ChatMessage.fromJson(Map<String, dynamic>.from(m as Map)))
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}

/// Lightweight projection of a [Conversation] used in the sidebar list — avoids
/// loading every message file on app startup.
class ConversationSummary {
  final String id;
  final String title;
  final String modelId;
  final String? originQuarkId;
  final DateTime updatedAt;

  const ConversationSummary({
    required this.id,
    required this.title,
    required this.modelId,
    required this.updatedAt,
    this.originQuarkId,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'modelId': modelId,
        if (originQuarkId != null) 'originQuarkId': originQuarkId,
        'updatedAt': updatedAt.toIso8601String(),
      };

  static ConversationSummary fromJson(Map<String, dynamic> json) {
    return ConversationSummary(
      id: json['id'] as String,
      title: json['title'] as String,
      modelId: json['modelId'] as String,
      originQuarkId: json['originQuarkId'] as String?,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  static ConversationSummary fromConversation(Conversation c) =>
      ConversationSummary(
        id: c.id,
        title: c.title,
        modelId: c.modelId,
        originQuarkId: c.originQuarkId,
        updatedAt: c.updatedAt,
      );
}
