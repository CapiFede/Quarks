import 'package:flutter/material.dart';
import 'package:quark_core/quark_core.dart';

class DrawerTitleBar extends StatelessWidget {
  final String title;
  final VoidCallback onClose;

  const DrawerTitleBar({super.key, required this.title, required this.onClose});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: textTheme.titleSmall?.copyWith(color: colors.textPrimary),
        ),
        MouseRegion(
          cursor: SystemMouseCursors.click,
          child: GestureDetector(
            onTap: onClose,
            child: Icon(Icons.close, size: 16, color: colors.textSecondary),
          ),
        ),
      ],
    );
  }
}

class SmallButton extends StatefulWidget {
  final String label;
  final VoidCallback? onTap;

  const SmallButton({super.key, required this.label, this.onTap});

  @override
  State<SmallButton> createState() => _SmallButtonState();
}

class _SmallButtonState extends State<SmallButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final enabled = widget.onTap != null;

    final Color borderColor =
        _hovering && enabled ? colors.primary : colors.border;
    final Color bg = _hovering && enabled
        ? colors.primary.withValues(alpha: 0.1)
        : Colors.transparent;
    final Color textColor = !enabled
        ? colors.textLight
        : _hovering
            ? colors.primary
            : colors.textSecondary;

    return MouseRegion(
      onEnter: (_) => enabled ? setState(() => _hovering = true) : null,
      onExit: (_) => setState(() => _hovering = false),
      cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: bg,
            border: Border.all(color: borderColor, width: 1),
          ),
          child: Opacity(
            opacity: enabled ? 1 : 0.5,
            child: Text(
              widget.label,
              style: textTheme.labelMedium?.copyWith(color: textColor),
            ),
          ),
        ),
      ),
    );
  }
}

class PlaylistCheckbox extends StatefulWidget {
  final String name;
  final bool checked;
  final VoidCallback? onChanged;

  const PlaylistCheckbox({
    super.key,
    required this.name,
    required this.checked,
    this.onChanged,
  });

  @override
  State<PlaylistCheckbox> createState() => _PlaylistCheckboxState();
}

class _PlaylistCheckboxState extends State<PlaylistCheckbox> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: widget.onChanged != null ? SystemMouseCursors.click : SystemMouseCursors.basic,
      child: GestureDetector(
        onTap: widget.onChanged,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
          color: _hovering ? colors.cardHover : Colors.transparent,
          child: Row(
            children: [
              Icon(
                widget.checked ? Icons.check_box : Icons.check_box_outline_blank,
                size: 16,
                color: widget.checked ? colors.primary : colors.textLight,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  widget.name,
                  style: textTheme.bodySmall?.copyWith(color: colors.textPrimary),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class PixelProgressBar extends StatelessWidget {
  final double value;

  const PixelProgressBar({super.key, required this.value});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    return PixelBorder(
      inset: true,
      padding: EdgeInsets.zero,
      borderWidth: 1.5,
      backgroundColor: colors.surfaceAlt,
      child: SizedBox(
        height: 12,
        child: FractionallySizedBox(
          alignment: Alignment.centerLeft,
          widthFactor: value.clamp(0, 1),
          child: Container(color: colors.primary),
        ),
      ),
    );
  }
}

class ActionButton extends StatefulWidget {
  final String label;
  final VoidCallback? onTap;
  final bool isDestructive;

  const ActionButton({
    super.key,
    required this.label,
    this.onTap,
    this.isDestructive = false,
  });

  @override
  State<ActionButton> createState() => _ActionButtonState();
}

class _ActionButtonState extends State<ActionButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final enabled = widget.onTap != null;
    final accent = widget.isDestructive ? colors.error : colors.primary;

    final Color bg = !enabled
        ? Colors.transparent
        : _hovering
            ? accent.withValues(alpha: 0.1)
            : Colors.transparent;
    final Color borderColor = !enabled
        ? colors.border
        : _hovering
            ? accent
            : colors.border;
    final Color textColor = !enabled
        ? colors.textLight
        : widget.isDestructive
            ? colors.error
            : _hovering
                ? colors.primary
                : colors.textPrimary;

    return MouseRegion(
      onEnter: (_) => enabled ? setState(() => _hovering = true) : null,
      onExit: (_) => setState(() => _hovering = false),
      cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: bg,
            border: Border.all(color: borderColor, width: 1),
          ),
          child: Opacity(
            opacity: enabled ? 1 : 0.5,
            child: Center(
              child: Text(
                widget.label,
                style: textTheme.labelMedium?.copyWith(color: textColor),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
