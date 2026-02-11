import 'package:flutter/material.dart';

import '../theme/quarks_colors.dart';
import 'pixel_border.dart';

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

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          transform: _hovering
              ? (Matrix4.identity()..translate(0.0, -2.0))
              : Matrix4.identity(),
          child: PixelBorder(
            backgroundColor:
                _hovering ? QuarksColors.cardHover : QuarksColors.surface,
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  widget.icon,
                  size: 48,
                  color: QuarksColors.primary,
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
      ),
    );
  }
}
