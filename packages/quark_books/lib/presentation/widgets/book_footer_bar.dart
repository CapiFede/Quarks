import 'package:flutter/material.dart';
import 'package:quark_core/quark_core.dart';

import '../../data/services/pagination_service.dart';

enum SaveStatus { saved, dirty, saving }

class BookFooterBar extends StatelessWidget {
  final BookMetrics metrics;
  final SaveStatus saveStatus;
  final DateTime? lastSavedAt;
  final int currentPage;
  final bool showPageIndicator;

  const BookFooterBar({
    super.key,
    required this.metrics,
    required this.saveStatus,
    this.lastSavedAt,
    this.currentPage = 0,
    this.showPageIndicator = false,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final totalPages = metrics.pageCount;
    final clampedCurrent =
        totalPages == 0 ? 0 : currentPage.clamp(0, totalPages - 1);

    return Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        border: Border(
          top: BorderSide(color: colors.border, width: 1),
        ),
      ),
      // Three-section layout: save indicator anchored left, current-page
      // indicator centered, stats anchored right inside a reverse-scrolling
      // SCV so they collapse from the left when the window is narrow.
      child: Stack(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: _SaveIndicator(status: saveStatus, lastSavedAt: lastSavedAt),
          ),
          if (showPageIndicator && totalPages > 0)
            Align(
              alignment: Alignment.center,
              child: Text(
                'Página ${clampedCurrent + 1} de $totalPages',
                style: TextStyle(
                  fontSize: 11,
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          Align(
            alignment: Alignment.centerRight,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              reverse: true,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _Stat(
                    label: 'Páginas',
                    value: _formatNumber(metrics.pageCount),
                    color: colors.textPrimary,
                  ),
                  _Separator(color: colors.border),
                  _Stat(
                    label: 'Palabras',
                    value: _formatNumber(metrics.wordCount),
                    color: colors.textPrimary,
                  ),
                  _Separator(color: colors.border),
                  _Stat(
                    label: 'Caracteres',
                    value: _formatNumber(metrics.charCount),
                    color: colors.textPrimary,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _formatNumber(int n) {
    final s = n.toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
      buf.write(s[i]);
    }
    return buf.toString();
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _Stat({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '$label:',
          style: TextStyle(fontSize: 11, color: colors.textLight),
        ),
        const SizedBox(width: 4),
        Text(
          value,
          style: TextStyle(
            fontSize: 11,
            color: color,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _Separator extends StatelessWidget {
  final Color color;
  const _Separator({required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Container(width: 1, height: 12, color: color),
    );
  }
}

class _SaveIndicator extends StatelessWidget {
  final SaveStatus status;
  final DateTime? lastSavedAt;

  const _SaveIndicator({required this.status, this.lastSavedAt});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    Color dotColor;
    String label;
    switch (status) {
      case SaveStatus.saved:
        dotColor = colors.success;
        label = lastSavedAt != null
            ? 'Guardado a las ${_formatTime(lastSavedAt!)}'
            : 'Guardado';
        break;
      case SaveStatus.dirty:
        dotColor = const Color(0xFFD8B96E);
        label = 'Sin guardar';
        break;
      case SaveStatus.saving:
        dotColor = colors.primary;
        label = 'Guardando…';
        break;
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(
            color: dotColor,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(fontSize: 11, color: colors.textLight),
        ),
      ],
    );
  }

  static String _formatTime(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}
