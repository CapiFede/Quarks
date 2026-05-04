import 'package:flutter/material.dart';

import '../theme/quarks_color_extension.dart';

const quarkPastelColors = [
  Color(0xFFFAF8F3), // Marfil (default)
  Color(0xFFFFF5C2), // Vainilla
  Color(0xFFFFD6D6), // Rosa
  Color(0xFFFFE0C4), // Durazno
  Color(0xFFE6D9FF), // Lavanda
  Color(0xFFC9E8FF), // Cielo
  Color(0xFFC8F0E0), // Menta
  Color(0xFFD6EAE2), // Sage
  Color(0xFFFDDDE6), // Rubor
  Color(0xFFD8DCE8), // Pizarra
];

const quarkPastelColorNames = [
  'Marfil',
  'Vainilla',
  'Rosa',
  'Durazno',
  'Lavanda',
  'Cielo',
  'Menta',
  'Sage',
  'Rubor',
  'Pizarra',
];

class QuarkColorPicker extends StatelessWidget {
  final int selectedColorValue;
  final ValueChanged<int> onColorSelected;

  const QuarkColorPicker({
    super.key,
    required this.selectedColorValue,
    required this.onColorSelected,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (int i = 0; i < quarkPastelColors.length; i++)
          _ColorSwatch(
            color: quarkPastelColors[i],
            isSelected: quarkPastelColors[i].toARGB32() == selectedColorValue,
            tooltip: quarkPastelColorNames[i],
            borderColor: colors.borderDark,
            primaryColor: colors.primary,
            onTap: () => onColorSelected(quarkPastelColors[i].toARGB32()),
          ),
      ],
    );
  }
}

class _ColorSwatch extends StatefulWidget {
  final Color color;
  final bool isSelected;
  final String tooltip;
  final Color borderColor;
  final Color primaryColor;
  final VoidCallback onTap;

  const _ColorSwatch({
    required this.color,
    required this.isSelected,
    required this.tooltip,
    required this.borderColor,
    required this.primaryColor,
    required this.onTap,
  });

  @override
  State<_ColorSwatch> createState() => _ColorSwatchState();
}

class _ColorSwatchState extends State<_ColorSwatch> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 4),
      child: Tooltip(
        message: widget.tooltip,
        child: MouseRegion(
          cursor: SystemMouseCursors.click,
          onEnter: (_) => setState(() => _hovering = true),
          onExit: (_) => setState(() => _hovering = false),
          child: GestureDetector(
            onTap: widget.onTap,
            child: Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                color: widget.color,
                border: Border.all(
                  color: widget.isSelected
                      ? widget.primaryColor
                      : _hovering
                          ? widget.borderColor
                          : widget.borderColor.withAlpha(128),
                  width: widget.isSelected ? 2 : 1,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
