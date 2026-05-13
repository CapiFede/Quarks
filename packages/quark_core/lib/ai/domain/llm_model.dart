class LlmModel {
  final String id;
  final String providerId;
  final String displayName;
  final int contextWindow;
  final bool supportsTools;
  final bool supportsStreaming;

  const LlmModel({
    required this.id,
    required this.providerId,
    required this.displayName,
    required this.contextWindow,
    this.supportsTools = true,
    this.supportsStreaming = true,
  });

  /// Fully-qualified id used as a stable handle across persistence + UI.
  /// Example: `anthropic/claude-opus-4-7`.
  String get qualifiedId => '$providerId/$id';

  @override
  bool operator ==(Object other) =>
      other is LlmModel && other.qualifiedId == qualifiedId;

  @override
  int get hashCode => qualifiedId.hashCode;
}
