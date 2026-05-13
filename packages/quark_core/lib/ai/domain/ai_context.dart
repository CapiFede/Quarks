import 'package:flutter/widgets.dart';

import 'ai_attachment.dart';
import 'tool_definition.dart';

/// Lazy-built attachment offered as a toggle chip in the input bar.
/// The build only runs when the user activates the chip — keeps AiContext cheap.
class AiAttachmentSuggestion {
  final String id;
  final String label;
  final IconData icon;
  final Future<AiAttachment?> Function() build;

  const AiAttachmentSuggestion({
    required this.id,
    required this.label,
    required this.icon,
    required this.build,
  });
}

typedef ToolHandler = Future<String> Function(
    String name, Map<String, dynamic> args);

/// Everything a Quark contributes to the AI drawer while it is the active tab.
/// All fields are optional — the drawer treats a null AiContext the same as
/// an AiContext where everything is null/empty.
class AiContext {
  final String quarkId;
  final String? systemPromptAddition;
  final List<AiAttachment> defaultAttachments;
  final List<AiAttachmentSuggestion> suggestions;
  final List<ToolDefinition> tools;
  final ToolHandler? toolHandler;
  final void Function(String text)? onInsertText;
  final String? contextLabel;

  /// Currently-highlighted text in the active Quark, if any. The drawer
  /// automatically prepends a "the user is referring to this paragraph"
  /// prefix to the next user message when this is non-empty. Skipped if
  /// the user explicitly toggled a 'selection' attachment chip — that
  /// path renders the same content via [AiAttachment.renderForPrompt].
  final String? currentSelectionText;

  const AiContext({
    required this.quarkId,
    this.systemPromptAddition,
    this.defaultAttachments = const [],
    this.suggestions = const [],
    this.tools = const [],
    this.toolHandler,
    this.onInsertText,
    this.contextLabel,
    this.currentSelectionText,
  });
}
