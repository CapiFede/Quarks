import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class BookFormat {
  // Hardcover ≈ 168 × 243 mm, with margins per the plan (averaged 22mm).
  static const double pageWidthMm = 168;
  static const double pageHeightMm = 243;
  static const double marginMm = 22;
  static const double topMarginMm = 19;

  // CSS reference: 96 dpi → 1mm = 96/25.4 logical pixels.
  static const double mmToPx = 96 / 25.4;

  static double get pageWidthPx => pageWidthMm * mmToPx;
  static double get pageHeightPx => pageHeightMm * mmToPx;
  static double get pageInnerWidthPx => (pageWidthMm - marginMm * 2) * mmToPx;
  static double get pageInnerHeightPx => (pageHeightMm - topMarginMm * 2) * mmToPx;

  // 11.5pt at the reference 96dpi: 1pt = 96/72 px → 11.5 * 1.333 ≈ 15.33.
  static const double fontSize = 15.33;
  static const double lineHeight = 1.22;

  static TextStyle bookTextStyle(Color color) {
    // Set fontWeight/letterSpacing/wordSpacing explicitly so Material's
    // TextField doesn't merge in theme defaults (e.g. titleMedium's 0.15
    // letterSpacing) — otherwise the highlight overlay's TextPainter, which
    // does not see that merge, lays out at different widths than the
    // EditableText and the rectangles drift away from the actual glyphs.
    return GoogleFonts.lora(
      fontSize: fontSize,
      height: lineHeight,
      color: color,
      fontWeight: FontWeight.w400,
      letterSpacing: 0,
      wordSpacing: 0,
    );
  }
}

class BookMetrics {
  final int pageCount;
  // Char offsets within the source text where each page begins. Always starts
  // with 0; length == pageCount.
  final List<int> pageBreakOffsets;
  final int charCount;
  final int wordCount;

  const BookMetrics({
    required this.pageCount,
    required this.pageBreakOffsets,
    required this.charCount,
    required this.wordCount,
  });

  static const empty = BookMetrics(
    pageCount: 1,
    pageBreakOffsets: [0],
    charCount: 0,
    wordCount: 0,
  );
}

class PaginationService {
  static int countWords(String text) {
    if (text.isEmpty) return 0;
    return RegExp(r'\S+').allMatches(text).length;
  }

  /// Lays out the chapter text with the book's [style] inside a page-sized
  /// box and returns the metrics. Runs on the main isolate via TextPainter.
  static BookMetrics paginate(String text, TextStyle style) {
    if (text.isEmpty) {
      return BookMetrics.empty;
    }
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
      textScaler: TextScaler.noScaling,
      maxLines: null,
    )..layout(maxWidth: BookFormat.pageInnerWidthPx);

    final lineMetrics = painter.computeLineMetrics();
    if (lineMetrics.isEmpty) {
      return BookMetrics(
        pageCount: 1,
        pageBreakOffsets: const [0],
        charCount: text.length,
        wordCount: countWords(text),
      );
    }

    final pageInnerHeight = BookFormat.pageInnerHeightPx;
    final breaks = <int>[0];
    double accumulated = 0;
    for (final line in lineMetrics) {
      final lineHeightPx = line.height;
      if (accumulated + lineHeightPx > pageInnerHeight && accumulated > 0) {
        // This line starts on a new page — compute the char offset at the top
        // of the new page (= start of this line).
        final pos = painter.getPositionForOffset(
          Offset(0, line.baseline - line.ascent + 0.5),
        );
        breaks.add(pos.offset);
        accumulated = lineHeightPx;
      } else {
        accumulated += lineHeightPx;
      }
    }

    painter.dispose();

    return BookMetrics(
      pageCount: breaks.length,
      pageBreakOffsets: breaks,
      charCount: text.length,
      wordCount: countWords(text),
    );
  }
}
