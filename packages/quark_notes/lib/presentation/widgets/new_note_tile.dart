import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/notes_providers.dart';

class NewNoteTile extends ConsumerStatefulWidget {
  const NewNoteTile({super.key});

  @override
  ConsumerState<NewNoteTile> createState() => _NewNoteTileState();
}

class _NewNoteTileState extends ConsumerState<NewNoteTile> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final borderColor = _hovering ? colors.textSecondary : colors.textLight;
    final iconColor = _hovering ? colors.textPrimary : colors.textLight;

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onTap: () =>
            ref.read(activeNoteIdProvider.notifier).state = 'new',
        child: CustomPaint(
          painter: _DashedBorderPainter(color: borderColor),
          child: Center(
            child: Icon(Icons.add, size: 36, color: iconColor),
          ),
        ),
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  final Color color;

  _DashedBorderPainter({required this.color});

  static const double _strokeWidth = 2;
  static const double _dashLength = 6;
  static const double _gapLength = 4;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = _strokeWidth
      ..style = PaintingStyle.stroke;

    final rect = Offset.zero & size;
    final path = Path()..addRect(rect);
    const stride = _dashLength + _gapLength;
    for (final metric in path.computeMetrics()) {
      double distance = 0;
      while (distance < metric.length) {
        final end = (distance + _dashLength).clamp(0, metric.length).toDouble();
        canvas.drawPath(metric.extractPath(distance, end), paint);
        distance += stride;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color;
}
