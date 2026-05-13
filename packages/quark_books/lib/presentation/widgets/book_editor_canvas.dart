import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:quark_core/quark_core.dart';

import '../../data/services/pagination_service.dart';

/// A match in the master text — half-open range [start, end).
class TextMatch {
  final int start;
  final int end;
  const TextMatch(this.start, this.end);
}

/// A page-local match used by [_HighlightingController] to decorate its
/// rendered TextSpan with a background color on the matched range.
class _LocalMatch {
  final int start;
  final int end;
  final bool isCurrent;
  const _LocalMatch(this.start, this.end, {this.isCurrent = false});
}

/// Whether the canvas renders all pages stacked vertically (scroll) or one
/// page at a time with prev/next navigation buttons (paginated).
enum BookViewMode { scroll, paginated }

/// Canvas that renders a chapter as one or more page sheets. Each page is its
/// own white container with top/bottom margins (so margins are visible on
/// every page, not just the first one). The vertical scrollbar lives outside
/// the page sheets, in the surrounding background area.
///
/// Editing model: the parent owns the canonical text in [controller]. The
/// canvas creates one sub-controller per page slice and keeps both directions
/// in sync — user edits flow up to the master controller, and re-pagination
/// (driven by the parent updating [pageBreakOffsets]) re-distributes slices.
///
/// Search highlights live in the per-page controllers: each one is a
/// [_HighlightingController] that overrides `buildTextSpan` to inject a
/// `backgroundColor` style onto matched ranges. Doing it through the same
/// TextSpan the EditableText uses (instead of a parallel TextPainter overlay)
/// guarantees that the highlight rectangles always align with the glyphs.
class BookEditorCanvas extends StatefulWidget {
  final TextEditingController controller;
  final List<int> pageBreakOffsets;
  final BookViewMode mode;
  final int currentPage;
  final ValueChanged<int>? onCurrentPageChanged;
  final List<TextMatch> matches;
  final int currentMatchIndex;

  const BookEditorCanvas({
    super.key,
    required this.controller,
    required this.pageBreakOffsets,
    required this.mode,
    required this.currentPage,
    this.onCurrentPageChanged,
    this.matches = const [],
    this.currentMatchIndex = -1,
  });

  @override
  State<BookEditorCanvas> createState() => _BookEditorCanvasState();
}

class _BookEditorCanvasState extends State<BookEditorCanvas> {
  final List<_HighlightingController> _pageControllers = [];
  final List<FocusNode> _pageFocusNodes = [];
  final ScrollController _vScrollCtrl = ScrollController();
  // Set while we are pushing data between master and per-page controllers, so
  // listeners on either side don't bounce the change back and create a loop.
  bool _syncing = false;

  @override
  void initState() {
    super.initState();
    _ensurePageCount();
    _distributeSlices();
    widget.controller.addListener(_onMasterChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Safe to read InheritedWidgets here (Theme / quarksColors) — `context`
    // is fully attached. Pushes the current highlight color + matches into
    // every per-page controller; also re-runs if the theme changes.
    _applyMatchesToControllers();
  }

  @override
  void didUpdateWidget(BookEditorCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onMasterChanged);
      widget.controller.addListener(_onMasterChanged);
    }
    // Redistribute when pagination changed (page boundaries moved) OR when
    // the master text diverged from the per-page slices (e.g. replace-all
    // modified the master directly while per-page controllers still hold
    // the old text). Skipping both keeps keystroke flow flicker-free since
    // _onPageEdited propagated the user's edit upward already, so master
    // and join are equal in that path.
    final breaksChanged =
        !listEquals(oldWidget.pageBreakOffsets, widget.pageBreakOffsets);
    final masterDiverged =
        _pageControllers.map((c) => c.text).join() != widget.controller.text;
    if (breaksChanged || masterDiverged) {
      _ensurePageCount();
      _distributeSlices();
    }
    _applyMatchesToControllers();
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onMasterChanged);
    for (final c in _pageControllers) {
      c.removeListener(_onPageEdited);
      c.dispose();
    }
    for (final f in _pageFocusNodes) {
      f.dispose();
    }
    _vScrollCtrl.dispose();
    super.dispose();
  }

  int get _pageCount {
    final n = widget.pageBreakOffsets.length;
    return n == 0 ? 1 : n;
  }

  void _ensurePageCount() {
    while (_pageControllers.length < _pageCount) {
      final c = _HighlightingController();
      c.addListener(_onPageEdited);
      _pageControllers.add(c);
      _pageFocusNodes.add(FocusNode());
    }
    while (_pageControllers.length > _pageCount) {
      final c = _pageControllers.removeLast();
      c.removeListener(_onPageEdited);
      c.dispose();
      _pageFocusNodes.removeLast().dispose();
    }
  }

  void _distributeSlices() {
    final breaks = widget.pageBreakOffsets.isEmpty
        ? const <int>[0]
        : widget.pageBreakOffsets;
    final text = widget.controller.text;

    // Capture the focused caret as a master-text offset so we can re-anchor
    // it after the slices shift around.
    int? focusedMasterOffset;
    for (var i = 0; i < _pageControllers.length; i++) {
      if (_pageFocusNodes[i].hasFocus) {
        final pageStart = i < breaks.length ? breaks[i] : 0;
        final sel = _pageControllers[i].selection;
        if (sel.baseOffset >= 0) {
          focusedMasterOffset = pageStart + sel.baseOffset;
        }
        break;
      }
    }

    _syncing = true;
    for (var i = 0; i < _pageControllers.length; i++) {
      final start =
          (i < breaks.length ? breaks[i] : text.length).clamp(0, text.length);
      final end = ((i + 1 < breaks.length) ? breaks[i + 1] : text.length)
          .clamp(0, text.length);
      final slice = end > start ? text.substring(start, end) : '';
      if (_pageControllers[i].text != slice) {
        _pageControllers[i].value = TextEditingValue(text: slice);
      }
    }
    _syncing = false;

    if (focusedMasterOffset != null) {
      for (var i = 0; i < _pageControllers.length; i++) {
        final start = i < breaks.length ? breaks[i] : 0;
        final end =
            (i + 1 < breaks.length) ? breaks[i + 1] : text.length;
        if (focusedMasterOffset >= start && focusedMasterOffset <= end) {
          final pageText = _pageControllers[i].text;
          final offsetInPage =
              (focusedMasterOffset - start).clamp(0, pageText.length);
          _syncing = true;
          _pageControllers[i].selection =
              TextSelection.collapsed(offset: offsetInPage);
          _syncing = false;
          if (!_pageFocusNodes[i].hasFocus) {
            _pageFocusNodes[i].requestFocus();
          }
          break;
        }
      }
    }
  }

  void _onMasterChanged() {
    // Distribution is driven by didUpdateWidget when pageBreakOffsets changes
    // (which always happens after the parent re-paginates a master-text
    // change). Touching slices here would race against keystrokes — we'd
    // re-slice new text with stale breaks and visibly clobber the user's
    // last typed character.
  }

  void _onPageEdited() {
    if (_syncing) return;
    final newText = _pageControllers.map((c) => c.text).join();
    final masterSelection = _resolveMasterSelection();

    if (newText == widget.controller.text) {
      // Selection-only change (or no-op). Push the per-page selection up
      // to the master so consumers like bookEditorSelectionProvider see it.
      if (masterSelection != null &&
          masterSelection != widget.controller.selection) {
        _syncing = true;
        widget.controller.selection = masterSelection;
        _syncing = false;
      }
      return;
    }
    _syncing = true;
    widget.controller.value = TextEditingValue(
      text: newText,
      selection: masterSelection ?? widget.controller.selection,
    );
    _syncing = false;
  }

  /// Picks the focused page's selection (if any) and translates it into
  /// master-text offsets. Returns null when no page is focused — in that
  /// case the master selection is left as-is.
  TextSelection? _resolveMasterSelection() {
    final breaks = widget.pageBreakOffsets.isEmpty
        ? const <int>[0]
        : widget.pageBreakOffsets;
    for (var i = 0; i < _pageControllers.length; i++) {
      if (!_pageFocusNodes[i].hasFocus) continue;
      final sel = _pageControllers[i].selection;
      if (!sel.isValid) return null;
      final pageStart = i < breaks.length ? breaks[i] : 0;
      return TextSelection(
        baseOffset: pageStart + sel.baseOffset,
        extentOffset: pageStart + sel.extentOffset,
      );
    }
    return null;
  }

  /// Push per-page match lists and the highlight colors into the controllers.
  /// Each controller compares against its previous matches and only fires
  /// `notifyListeners` when something changed.
  void _applyMatchesToControllers() {
    final color = context.quarksColors.primary;
    final selectionColor =
        Theme.of(context).textSelectionTheme.selectionColor ??
            color.withValues(alpha: 0.4);
    for (var i = 0; i < _pageControllers.length; i++) {
      _pageControllers[i].highlightColor = color;
      _pageControllers[i].selectionHighlightColor = selectionColor;
      _pageControllers[i].matches = _matchesForPage(i);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final brightness = Theme.of(context).brightness;
    final pageColor = brightness == Brightness.dark
        ? const Color(0xFF2A2B2E)
        : Colors.white;
    final shadowColor = brightness == Brightness.dark
        ? const Color(0x80000000)
        : const Color(0x33000000);
    final style = BookFormat.bookTextStyle(colors.textPrimary);

    final Widget content = widget.mode == BookViewMode.scroll
        ? _buildScrollContent(colors, pageColor, shadowColor, style)
        : _buildPaginatedContent(colors, pageColor, shadowColor, style);

    return Container(
      color: colors.background,
      child: _wrapScrollable(content),
    );
  }

  /// Vertical scrollbar (in the gray surround), wrapping a vertical
  /// SingleChildScrollView. Inside, a horizontal SingleChildScrollView lets
  /// the page content scroll sideways when the window is narrower than the
  /// page; when the window is wider, a min-width ConstrainedBox stretches the
  /// row so the inner Center can centre the content.
  Widget _wrapScrollable(Widget content) {
    return Scrollbar(
      controller: _vScrollCtrl,
      child: SingleChildScrollView(
        controller: _vScrollCtrl,
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: ConstrainedBox(
                constraints: BoxConstraints(minWidth: constraints.maxWidth),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      vertical: 24, horizontal: 16),
                  child: Center(child: content),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildScrollContent(QuarksColorExtension colors, Color pageColor,
      Color shadowColor, TextStyle style) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < _pageCount; i++) ...[
          if (i > 0) const SizedBox(height: 24),
          _PageSheet(
            controller: _pageControllers[i],
            focusNode: _pageFocusNodes[i],
            pageColor: pageColor,
            shadowColor: shadowColor,
            style: style,
            hint: i == 0 ? 'Escribí acá. Tu texto se guarda solo.' : null,
            cursorColor: colors.primary,
            hintColor: colors.textLight,
          ),
        ],
      ],
    );
  }

  Widget _buildPaginatedContent(QuarksColorExtension colors, Color pageColor,
      Color shadowColor, TextStyle style) {
    final pageCount = _pageCount;
    final page = widget.currentPage.clamp(0, pageCount - 1);
    return IntrinsicHeight(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _NavButton(
            icon: Icons.chevron_left,
            enabled: page > 0,
            onTap: page > 0
                ? () => widget.onCurrentPageChanged?.call(page - 1)
                : null,
          ),
          const SizedBox(width: 12),
          _PageSheet(
            controller: _pageControllers[page],
            focusNode: _pageFocusNodes[page],
            pageColor: pageColor,
            shadowColor: shadowColor,
            style: style,
            hint:
                page == 0 ? 'Escribí acá. Tu texto se guarda solo.' : null,
            cursorColor: colors.primary,
            hintColor: colors.textLight,
          ),
          const SizedBox(width: 12),
          _NavButton(
            icon: Icons.chevron_right,
            enabled: page < pageCount - 1,
            onTap: page < pageCount - 1
                ? () => widget.onCurrentPageChanged?.call(page + 1)
                : null,
          ),
        ],
      ),
    );
  }

  /// Translate absolute matches into page-local _LocalMatch entries for page
  /// [i]. Handles matches that cross page boundaries by clamping to the slice.
  List<_LocalMatch> _matchesForPage(int i) {
    if (widget.matches.isEmpty) return const [];
    final breaks = widget.pageBreakOffsets;
    final textLen = widget.controller.text.length;
    final pageStart = i < breaks.length ? breaks[i] : 0;
    final pageEnd = (i + 1 < breaks.length) ? breaks[i + 1] : textLen;
    final out = <_LocalMatch>[];
    for (var idx = 0; idx < widget.matches.length; idx++) {
      final m = widget.matches[idx];
      final s = m.start > pageStart ? m.start : pageStart;
      final e = m.end < pageEnd ? m.end : pageEnd;
      if (s >= e) continue;
      out.add(_LocalMatch(
        s - pageStart,
        e - pageStart,
        isCurrent: idx == widget.currentMatchIndex,
      ));
    }
    return out;
  }
}

class _PageSheet extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final Color pageColor;
  final Color shadowColor;
  final TextStyle style;
  final String? hint;
  final Color cursorColor;
  final Color hintColor;

  const _PageSheet({
    required this.controller,
    required this.focusNode,
    required this.pageColor,
    required this.shadowColor,
    required this.style,
    required this.hint,
    required this.cursorColor,
    required this.hintColor,
  });

  @override
  Widget build(BuildContext context) {
    const horizMargin = BookFormat.marginMm * BookFormat.mmToPx;
    const vertMargin = BookFormat.topMarginMm * BookFormat.mmToPx;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        controller.selection =
            TextSelection.collapsed(offset: controller.text.length);
        focusNode.requestFocus();
      },
      child: Container(
        width: BookFormat.pageWidthPx,
        constraints: BoxConstraints(minHeight: BookFormat.pageHeightPx),
        decoration: BoxDecoration(
          color: pageColor,
          boxShadow: [
            BoxShadow(
              color: shadowColor,
              offset: const Offset(0, 2),
              blurRadius: 4,
            ),
          ],
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: horizMargin,
          vertical: vertMargin,
        ),
        // Suppress Flutter's native selection paint — the controller draws
        // its own highlight via buildTextSpan, hugged to the glyphs and
        // visible even when the field loses focus.
        child: TextSelectionTheme(
          data: const TextSelectionThemeData(
            selectionColor: Colors.transparent,
          ),
          child: TextField(
            controller: controller,
            focusNode: focusNode,
            style: style,
            cursorColor: cursorColor,
            cursorWidth: 1.2,
            maxLines: null,
            minLines: null,
            keyboardType: TextInputType.multiline,
            textInputAction: TextInputAction.newline,
            decoration: InputDecoration(
              isCollapsed: true,
              border: InputBorder.none,
              hintText: hint,
              hintStyle: style.copyWith(color: hintColor),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  final IconData icon;
  final bool enabled;
  final VoidCallback? onTap;

  const _NavButton({
    required this.icon,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final fg = enabled
        ? colors.textPrimary
        : colors.textLight.withValues(alpha: 0.4);
    final bg = enabled
        ? colors.surface
        : colors.surfaceAlt.withValues(alpha: 0.4);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: enabled ? onTap : null,
        child: Container(
          width: 64,
          decoration: BoxDecoration(
            color: bg,
            border: Border.all(color: colors.border, width: 1),
          ),
          child: Center(
            child: Icon(icon, size: 36, color: fg),
          ),
        ),
      ),
    );
  }
}

/// TextEditingController that paints both search highlights and the active
/// selection as background spans inside the EditableText's own TextSpan.
/// Doing it this way (instead of relying on Flutter's native selection
/// paint) gives us two things: the highlight stays visible after the
/// TextField loses focus (Flutter normally hides it on blur), and it
/// tightly hugs the glyphs — Flutter's native paint extends to the end
/// of each visual line, including trailing whitespace, which the user
/// finds noisy. We pair this with `TextSelectionTheme(selectionColor:
/// transparent)` on the TextField so the native highlight stays out of
/// the way.
class _HighlightingController extends TextEditingController {
  List<_LocalMatch> _matches = const [];
  Color highlightColor = Colors.transparent;
  Color selectionHighlightColor = Colors.transparent;

  set matches(List<_LocalMatch> value) {
    if (_listsEqual(_matches, value)) return;
    _matches = value;
    // Intentionally no notifyListeners(): the only state that changed is the
    // highlight set, which is read inside buildTextSpan during the next
    // EditableText build. The parent setState that triggered this setter
    // already schedules that build. Calling notifyListeners() here would
    // also wake up _onPageEdited, which assumes any notify implies a text
    // change and would then clobber the master controller by writing back
    // the (possibly stale) per-page join.
  }

  static bool _listsEqual(List<_LocalMatch> a, List<_LocalMatch> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].start != b[i].start ||
          a[i].end != b[i].end ||
          a[i].isCurrent != b[i].isCurrent) {
        return false;
      }
    }
    return true;
  }

  @override
  TextSpan buildTextSpan({
    required BuildContext context,
    TextStyle? style,
    required bool withComposing,
  }) {
    final t = text;
    final sel = selection;
    final hasSel = sel.isValid && !sel.isCollapsed;
    if ((_matches.isEmpty && !hasSel) || t.isEmpty) {
      return super.buildTextSpan(
        context: context,
        style: style,
        withComposing: withComposing,
      );
    }

    final base = highlightColor.withValues(alpha: 0.3);
    final current = highlightColor.withValues(alpha: 0.55);
    final selBg = selectionHighlightColor;

    final ranges = <_DecoratedRange>[];
    for (final m in _matches) {
      ranges.add(_DecoratedRange(
        m.start.clamp(0, t.length),
        m.end.clamp(0, t.length),
        m.isCurrent ? current : base,
      ));
    }
    if (hasSel) {
      ranges.add(_DecoratedRange(
        sel.start.clamp(0, t.length),
        sel.end.clamp(0, t.length),
        selBg,
      ));
    }
    ranges.sort((a, b) => a.start.compareTo(b.start));

    final children = <TextSpan>[];
    var cursor = 0;
    for (final r in ranges) {
      if (r.end <= cursor) continue;
      final s = r.start < cursor ? cursor : r.start;
      if (s > cursor) {
        children.add(TextSpan(text: t.substring(cursor, s)));
      }
      if (r.end > s) {
        children.add(TextSpan(
          text: t.substring(s, r.end),
          style: TextStyle(backgroundColor: r.color),
        ));
      }
      cursor = r.end;
    }
    if (cursor < t.length) {
      children.add(TextSpan(text: t.substring(cursor)));
    }
    return TextSpan(style: style, children: children);
  }
}

class _DecoratedRange {
  final int start;
  final int end;
  final Color color;
  const _DecoratedRange(this.start, this.end, this.color);
}
