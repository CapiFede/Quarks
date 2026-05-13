/// User-attached context for the next outgoing message. Rendered as a chip
/// in the input bar, expanded into the message body when sent.
sealed class AiAttachment {
  final String label;

  /// Matches the [AiAttachmentSuggestion.id] that produced this attachment.
  /// Used to prevent duplicates and to toggle items in suggestion groups.
  final String? suggestionId;

  const AiAttachment(this.label, {this.suggestionId});

  /// Plain-text representation that gets inlined into the prompt.
  String renderForPrompt();
}

class TextAttachment extends AiAttachment {
  final String content;
  final String? source;

  const TextAttachment({
    required String label,
    required this.content,
    this.source,
    String? suggestionId,
  }) : super(label, suggestionId: suggestionId);

  @override
  String renderForPrompt() {
    final attrs = source != null ? ' source="$source"' : '';
    return '<attachment label="$label"$attrs>\n$content\n</attachment>';
  }
}

class FileAttachment extends AiAttachment {
  final String path;
  final String content;

  const FileAttachment({
    required String label,
    required this.path,
    required this.content,
    String? suggestionId,
  }) : super(label, suggestionId: suggestionId);

  @override
  String renderForPrompt() {
    return '<file label="$label" path="$path">\n$content\n</file>';
  }
}
