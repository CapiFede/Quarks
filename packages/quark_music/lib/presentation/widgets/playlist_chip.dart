import 'package:flutter/material.dart';
import 'package:quark_core/quark_core.dart';

class PlaylistChip extends StatefulWidget {
  final String name;
  final bool isSelected;
  final VoidCallback onTap;
  final void Function(TapDownDetails details)? onSecondaryTap;
  final VoidCallback? onClose;

  const PlaylistChip({
    super.key,
    required this.name,
    required this.isSelected,
    required this.onTap,
    this.onSecondaryTap,
    this.onClose,
  });

  @override
  State<PlaylistChip> createState() => _PlaylistChipState();
}

class _PlaylistChipState extends State<PlaylistChip> {
  bool _hovering = false;
  bool _closeHover = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    final Color borderColor = widget.isSelected
        ? colors.primary
        : _hovering
            ? colors.borderDark
            : Colors.transparent;
    final Color textColor = widget.isSelected
        ? colors.primary
        : _hovering
            ? colors.textPrimary
            : colors.textSecondary;

    return Padding(
      padding: const EdgeInsets.only(right: 2),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          onTap: widget.onTap,
          onSecondaryTapDown: widget.onSecondaryTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 1),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: borderColor, width: 2),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.name,
                  style: textTheme.labelMedium?.copyWith(color: textColor),
                ),
                if (widget.onClose != null) ...[
                  const SizedBox(width: 4),
                  MouseRegion(
                    cursor: SystemMouseCursors.click,
                    onEnter: (_) => setState(() => _closeHover = true),
                    onExit: (_) => setState(() => _closeHover = false),
                    child: GestureDetector(
                      onTap: widget.onClose,
                      child: Icon(
                        Icons.close,
                        size: 11,
                        color: _closeHover
                            ? colors.error
                            : textColor.withValues(alpha: 0.7),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
