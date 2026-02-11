import 'package:flutter/material.dart';

import '../theme/quarks_colors.dart';

class PixelBorder extends StatelessWidget {
  final Widget child;
  final Color? borderColor;
  final Color? backgroundColor;
  final double borderWidth;
  final EdgeInsetsGeometry padding;

  const PixelBorder({
    super.key,
    required this.child,
    this.borderColor,
    this.backgroundColor,
    this.borderWidth = 2,
    this.padding = const EdgeInsets.all(12),
  });

  @override
  Widget build(BuildContext context) {
    final border = borderColor ?? QuarksColors.border;
    final bg = backgroundColor ?? QuarksColors.surface;

    return Container(
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border, width: borderWidth),
        boxShadow: [
          BoxShadow(
            color: QuarksColors.cardShadow,
            offset: const Offset(3, 3),
            blurRadius: 0,
          ),
        ],
      ),
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(
            color: border.withValues(alpha: 0.3),
            width: 1,
          ),
        ),
        padding: padding,
        child: child,
      ),
    );
  }
}
