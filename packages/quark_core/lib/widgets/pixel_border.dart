import 'package:flutter/material.dart';

import '../theme/quarks_color_extension.dart';

class PixelBorder extends StatelessWidget {
  final Widget child;
  final Color? borderColor;
  final Color? backgroundColor;
  final double borderWidth;
  final EdgeInsetsGeometry padding;
  final bool inset;

  const PixelBorder({
    super.key,
    required this.child,
    this.borderColor,
    this.backgroundColor,
    this.borderWidth = 2,
    this.padding = const EdgeInsets.all(12),
    this.inset = false,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final bg = backgroundColor ?? colors.surface;

    Color topLeftColor;
    Color bottomRightColor;

    if (borderColor != null) {
      topLeftColor = inset
          ? Color.lerp(borderColor, Colors.black, 0.15)!
          : Color.lerp(borderColor, Colors.white, 0.4)!;
      bottomRightColor = inset
          ? Color.lerp(borderColor, Colors.white, 0.4)!
          : Color.lerp(borderColor, Colors.black, 0.15)!;
    } else {
      topLeftColor = inset ? colors.borderDark : colors.borderLight;
      bottomRightColor = inset ? colors.borderLight : colors.borderDark;
    }

    return Container(
      decoration: BoxDecoration(
        color: bg,
        border: Border(
          top: BorderSide(color: topLeftColor, width: borderWidth),
          left: BorderSide(color: topLeftColor, width: borderWidth),
          bottom: BorderSide(color: bottomRightColor, width: borderWidth),
          right: BorderSide(color: bottomRightColor, width: borderWidth),
        ),
        boxShadow: inset
            ? []
            : [
                BoxShadow(
                  color: colors.cardShadow,
                  offset: const Offset(3, 3),
                  blurRadius: 0,
                ),
              ],
      ),
      padding: padding,
      child: child,
    );
  }
}
