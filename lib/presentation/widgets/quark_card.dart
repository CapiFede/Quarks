import 'package:flutter/material.dart';
import 'package:quark_core/quark_core.dart';

class QuarkCard extends StatefulWidget {
  final String label;
  final IconData icon;
  final VoidCallback? onTap;

  const QuarkCard({
    super.key,
    required this.label,
    required this.icon,
    this.onTap,
  });

  @override
  State<QuarkCard> createState() => _QuarkCardState();
}

class _QuarkCardState extends State<QuarkCard> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.quarksColors;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: _hovering ? colors.cardHover : colors.surface,
            border: Border.all(color: colors.border, width: 1),
            boxShadow: _hovering
                ? const []
                : [
                    BoxShadow(
                      color: colors.cardShadow,
                      offset: const Offset(2, 2),
                      blurRadius: 0,
                    ),
                  ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                widget.icon,
                size: 48,
                color: colors.primary,
              ),
              const SizedBox(height: 12),
              Text(
                widget.label,
                style: theme.textTheme.labelLarge,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
