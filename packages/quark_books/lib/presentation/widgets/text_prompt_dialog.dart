import 'package:flutter/material.dart';
import 'package:quark_core/quark_core.dart';

Future<String?> showTextPromptDialog(
  BuildContext context, {
  required String title,
  required String hint,
  String? initial,
  String confirmLabel = 'OK',
}) {
  return showDialog<String>(
    context: context,
    builder: (_) => _TextPromptDialog(
      title: title,
      hint: hint,
      initial: initial,
      confirmLabel: confirmLabel,
    ),
  );
}

class _TextPromptDialog extends StatefulWidget {
  final String title;
  final String hint;
  final String? initial;
  final String confirmLabel;

  const _TextPromptDialog({
    required this.title,
    required this.hint,
    this.initial,
    required this.confirmLabel,
  });

  @override
  State<_TextPromptDialog> createState() => _TextPromptDialogState();
}

class _TextPromptDialogState extends State<_TextPromptDialog> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initial ?? '');

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return AlertDialog(
      backgroundColor: colors.surface,
      title: Text(
        widget.title,
        style: TextStyle(color: colors.textPrimary, fontSize: 14),
      ),
      content: TextField(
        controller: _controller,
        autofocus: true,
        style: TextStyle(color: colors.textPrimary, fontSize: 13),
        decoration: InputDecoration(
          hintText: widget.hint,
          hintStyle: TextStyle(color: colors.textLight, fontSize: 12),
          isDense: true,
          border: OutlineInputBorder(
            borderSide: BorderSide(color: colors.border),
          ),
        ),
        onSubmitted: (v) => Navigator.pop(context, v),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('Cancelar',
              style: TextStyle(color: colors.textSecondary, fontSize: 12)),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, _controller.text),
          child: Text(widget.confirmLabel,
              style: TextStyle(color: colors.primary, fontSize: 12)),
        ),
      ],
    );
  }
}
