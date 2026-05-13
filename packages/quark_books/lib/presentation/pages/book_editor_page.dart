import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../data/services/pagination_service.dart';
import '../../domain/entities/book.dart';
import '../providers/books_providers.dart';
import '../widgets/book_editor_canvas.dart';
import '../widgets/book_footer_bar.dart';
import '../widgets/books_tree_view.dart';
import '../widgets/search_panel.dart';

class BookEditorPage extends ConsumerStatefulWidget {
  const BookEditorPage({super.key});

  @override
  ConsumerState<BookEditorPage> createState() => _BookEditorPageState();
}

class _BookEditorPageState extends ConsumerState<BookEditorPage> {
  static const Duration _saveDebounce = Duration(milliseconds: 800);
  static const Duration _paginationDebounce = Duration(milliseconds: 400);

  late TextEditingController _controller;
  Timer? _saveTimer;
  Timer? _paginationTimer;

  // Tracks which (bookId, chapterId) is currently loaded into _controller.
  String? _loadedBookId;
  String? _loadedChapterId;
  // Set while loading, ignored by the listener to avoid marking-dirty on load.
  bool _loadingContent = false;

  BookMetrics _metrics = BookMetrics.empty;
  SaveStatus _saveStatus = SaveStatus.saved;
  DateTime? _lastSavedAt;
  // Snapshot of the controller's text the last time _onContentChanged saw
  // it. Used to ignore selection-only notifications (which the canvas now
  // emits when propagating per-page selection up to the master).
  String _lastObservedText = '';

  TextStyle? _paginationStyle;

  BookViewMode _viewMode = BookViewMode.scroll;
  int _currentPage = 0;

  // --- Search state ---
  bool _searchOpen = false;
  final TextEditingController _searchCtrl = TextEditingController();
  final TextEditingController _replaceCtrl = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  bool _wholeWord = false;
  List<TextMatch> _matches = const [];
  int _currentMatch = 0;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _controller.addListener(_onContentChanged);
    _controller.addListener(_onSelectionChanged);
    _searchCtrl.addListener(_onSearchTermChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(bookEditorControllerProvider.notifier).state = _controller;
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final colors = context.quarksColors;
    _paginationStyle = BookFormat.bookTextStyle(colors.textPrimary);
  }

  @override
  void dispose() {
    _saveTimer?.cancel();
    _paginationTimer?.cancel();
    _flushSaveSync();
    _controller.removeListener(_onContentChanged);
    _controller.removeListener(_onSelectionChanged);
    ref.read(bookEditorControllerProvider.notifier).state = null;
    ref.read(bookEditorSelectionProvider.notifier).state = null;
    _controller.dispose();
    _searchCtrl.removeListener(_onSearchTermChanged);
    _searchCtrl.dispose();
    _replaceCtrl.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  void _flushSaveSync() {
    if (_saveStatus != SaveStatus.dirty) return;
    final bookId = _loadedBookId;
    final chapterId = _loadedChapterId;
    if (bookId == null || chapterId == null) return;
    final content = _controller.text;
    // ignore: discarded_futures
    ref
        .read(booksProvider.notifier)
        .saveChapterContent(bookId, chapterId, content);
  }

  void _onContentChanged() {
    if (_loadingContent) return;
    if (_loadedBookId == null || _loadedChapterId == null) return;
    final current = _controller.text;
    if (current == _lastObservedText) return; // selection-only change
    _lastObservedText = current;
    if (_saveStatus != SaveStatus.dirty) {
      setState(() => _saveStatus = SaveStatus.dirty);
    }
    _saveTimer?.cancel();
    _saveTimer = Timer(_saveDebounce, _save);
    _paginationTimer?.cancel();
    _paginationTimer = Timer(_paginationDebounce, _recalculateMetrics);
    if (_searchOpen) _recomputeMatches();
  }

  void _onSelectionChanged() {
    if (_loadingContent) return;
    if (_loadedBookId == null || _loadedChapterId == null) return;
    final sel = _controller.selection;
    ref.read(bookEditorSelectionProvider.notifier).state =
        sel.isValid && !sel.isCollapsed ? sel : null;
  }

  void _onSearchTermChanged() {
    _recomputeMatches(resetCurrent: true);
  }

  void _recomputeMatches({bool resetCurrent = false}) {
    final query = _searchCtrl.text;
    if (query.isEmpty) {
      if (_matches.isNotEmpty || _currentMatch != 0) {
        setState(() {
          _matches = const [];
          _currentMatch = 0;
        });
      }
      return;
    }
    final text = _controller.text;
    final found = <TextMatch>[];
    if (_wholeWord) {
      final pattern = RegExp(
        r'\b' + RegExp.escape(query) + r'\b',
        caseSensitive: false,
        unicode: true,
      );
      for (final m in pattern.allMatches(text)) {
        if (m.end > m.start) found.add(TextMatch(m.start, m.end));
      }
    } else {
      final lowerText = text.toLowerCase();
      final lowerQuery = query.toLowerCase();
      var idx = 0;
      while (true) {
        final i = lowerText.indexOf(lowerQuery, idx);
        if (i < 0) break;
        found.add(TextMatch(i, i + lowerQuery.length));
        idx = i + lowerQuery.length;
      }
    }
    setState(() {
      _matches = found;
      _currentMatch = resetCurrent || _currentMatch >= found.length
          ? 0
          : _currentMatch;
    });
  }

  void _openSearch() {
    if (_loadedChapterId == null) return;
    setState(() => _searchOpen = true);
    _recomputeMatches();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _searchFocusNode.requestFocus();
      _searchCtrl.selection = TextSelection(
        baseOffset: 0,
        extentOffset: _searchCtrl.text.length,
      );
    });
  }

  void _closeSearch() {
    setState(() {
      _searchOpen = false;
      _matches = const [];
      _currentMatch = 0;
    });
  }

  void _toggleWholeWord() {
    setState(() => _wholeWord = !_wholeWord);
    _recomputeMatches(resetCurrent: true);
  }

  void _jumpToCurrentMatch() {
    if (_matches.isEmpty) return;
    final match = _matches[_currentMatch];
    final breaks = _metrics.pageBreakOffsets;
    if (breaks.isEmpty) return;
    var page = 0;
    for (var i = 0; i < breaks.length; i++) {
      final end =
          (i + 1 < breaks.length) ? breaks[i + 1] : _controller.text.length;
      if (match.start < end) {
        page = i;
        break;
      }
    }
    if (page != _currentPage) {
      setState(() => _currentPage = page);
    }
  }

  void _nextMatch() {
    if (_matches.isEmpty) return;
    setState(() {
      _currentMatch = (_currentMatch + 1) % _matches.length;
    });
    _jumpToCurrentMatch();
  }

  void _prevMatch() {
    if (_matches.isEmpty) return;
    setState(() {
      _currentMatch =
          (_currentMatch - 1 + _matches.length) % _matches.length;
    });
    _jumpToCurrentMatch();
  }

  void _replaceCurrent() {
    if (_matches.isEmpty) return;
    final match = _matches[_currentMatch];
    final replacement = _replaceCtrl.text;
    final text = _controller.text;
    final newText =
        text.substring(0, match.start) + replacement + text.substring(match.end);
    _controller.value = TextEditingValue(
      text: newText,
      selection:
          TextSelection.collapsed(offset: match.start + replacement.length),
    );
    // Force pagination right away so per-page TextFields reflect the new
    // text before the debounced re-pagination would otherwise run.
    _paginationTimer?.cancel();
    _recalculateMetrics();
    _recomputeMatches();
  }

  void _replaceAll() {
    if (_matches.isEmpty) return;
    final replacement = _replaceCtrl.text;
    final text = _controller.text;
    final buf = StringBuffer();
    var cursor = 0;
    for (final m in _matches) {
      buf.write(text.substring(cursor, m.start));
      buf.write(replacement);
      cursor = m.end;
    }
    buf.write(text.substring(cursor));
    _controller.value = TextEditingValue(
      text: buf.toString(),
      selection: const TextSelection.collapsed(offset: 0),
    );
    _paginationTimer?.cancel();
    _recalculateMetrics();
    _recomputeMatches(resetCurrent: true);
  }

  Future<void> _save() async {
    final bookId = _loadedBookId;
    final chapterId = _loadedChapterId;
    if (bookId == null || chapterId == null) return;
    final content = _controller.text;
    if (!mounted) return;
    setState(() => _saveStatus = SaveStatus.saving);
    try {
      await ref
          .read(booksProvider.notifier)
          .saveChapterContent(bookId, chapterId, content);
      if (!mounted) return;
      setState(() {
        _saveStatus = SaveStatus.saved;
        _lastSavedAt = DateTime.now();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _saveStatus = SaveStatus.dirty);
    }
  }

  void _recalculateMetrics() {
    final style = _paginationStyle;
    if (style == null) return;
    final metrics = PaginationService.paginate(_controller.text, style);
    if (!mounted) return;
    setState(() {
      _metrics = metrics;
      if (_currentPage >= metrics.pageCount) {
        _currentPage = (metrics.pageCount - 1).clamp(0, metrics.pageCount - 1);
      }
    });
  }

  void _toggleViewMode() {
    setState(() {
      _viewMode = _viewMode == BookViewMode.scroll
          ? BookViewMode.paginated
          : BookViewMode.scroll;
    });
  }

  Future<void> _loadChapter(Book book, String chapterId) async {
    // Flush previous chapter before swapping content.
    if (_loadedBookId != null &&
        _loadedChapterId != null &&
        _saveStatus == SaveStatus.dirty) {
      _saveTimer?.cancel();
      await _save();
    }
    _loadingContent = true;
    _saveTimer?.cancel();
    _paginationTimer?.cancel();
    try {
      final content = await ref
          .read(booksProvider.notifier)
          .readChapterContent(book.id, chapterId);
      if (!mounted) return;
      _controller.text = content;
      _lastObservedText = content;
      _loadedBookId = book.id;
      _loadedChapterId = chapterId;
      ref.read(bookEditorSelectionProvider.notifier).state = null;
      setState(() {
        _saveStatus = SaveStatus.saved;
        _lastSavedAt = null;
        _metrics = BookMetrics.empty;
        _currentPage = 0;
      });
      _recalculateMetrics();
    } finally {
      _loadingContent = false;
    }
  }

  void _clearLoadedChapter() {
    _loadingContent = true;
    _controller.text = '';
    _lastObservedText = '';
    _loadedBookId = null;
    _loadedChapterId = null;
    _saveTimer?.cancel();
    _paginationTimer?.cancel();
    ref.read(bookEditorSelectionProvider.notifier).state = null;
    if (mounted) {
      setState(() {
        _saveStatus = SaveStatus.saved;
        _metrics = BookMetrics.empty;
        _lastSavedAt = null;
      });
    }
    _loadingContent = false;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final book = ref.watch(activeBookProvider);
    final chapterId = ref.watch(activeChapterIdProvider);

    // Detect (book, chapter) changes coming from the provider and trigger
    // a reload. didChangeDependencies isn't enough because providers update
    // outside the InheritedWidget lifecycle.
    final desiredBookId = book?.id;
    final desiredChapterId = chapterId;
    final hasDesired = desiredBookId != null && desiredChapterId != null;
    final hasLoaded = _loadedBookId != null && _loadedChapterId != null;

    if (hasDesired &&
        (_loadedBookId != desiredBookId ||
            _loadedChapterId != desiredChapterId)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final stillBook = ref.read(activeBookProvider);
        final stillChapter = ref.read(activeChapterIdProvider);
        if (stillBook?.id == desiredBookId &&
            stillChapter == desiredChapterId) {
          _loadChapter(stillBook!, stillChapter!);
        }
      });
    } else if (!hasDesired && hasLoaded) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _clearLoadedChapter();
      });
    }

    final chapter = book != null && chapterId != null
        ? book.chapters.where((c) => c.id == chapterId).firstOrNull
        : null;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(width: 240, child: BooksTreeView()),
        Expanded(
          child: Focus(
            autofocus: false,
            onKeyEvent: _onPageKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (book != null)
                  _ChapterHeader(
                    bookTitle: book.title,
                    chapterTitle: chapter?.title ?? 'Sin capítulo',
                    viewMode: _viewMode,
                    showToggle: chapter != null,
                    onToggleMode: _toggleViewMode,
                    showSearch: chapter != null,
                    onOpenSearch: _openSearch,
                  ),
                Expanded(
                  child: chapter == null
                      ? Container(
                          color: colors.background,
                          alignment: Alignment.center,
                          child: Padding(
                            padding: const EdgeInsets.all(32),
                            child: Text(
                              book == null
                                  ? 'Seleccioná un libro a la izquierda.'
                                  : 'Seleccioná un capítulo del libro\no creá uno con el +.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 13,
                                color: colors.textSecondary,
                                height: 1.5,
                              ),
                            ),
                          ),
                        )
                      : Stack(
                          children: [
                            BookEditorCanvas(
                              controller: _controller,
                              pageBreakOffsets: _metrics.pageBreakOffsets,
                              mode: _viewMode,
                              currentPage: _currentPage,
                              onCurrentPageChanged: (p) =>
                                  setState(() => _currentPage = p),
                              matches: _matches,
                              currentMatchIndex:
                                  _searchOpen ? _currentMatch : -1,
                            ),
                            if (_searchOpen)
                              Positioned(
                                top: 8,
                                right: 16,
                                child: SearchPanel(
                                  searchCtrl: _searchCtrl,
                                  replaceCtrl: _replaceCtrl,
                                  searchFocusNode: _searchFocusNode,
                                  wholeWord: _wholeWord,
                                  matchCount: _matches.length,
                                  currentMatch: _currentMatch,
                                  onToggleWholeWord: _toggleWholeWord,
                                  onNext: _nextMatch,
                                  onPrev: _prevMatch,
                                  onReplaceOne: _replaceCurrent,
                                  onReplaceAll: _replaceAll,
                                  onClose: _closeSearch,
                                ),
                              ),
                          ],
                        ),
                ),
                BookFooterBar(
                  metrics: _metrics,
                  saveStatus: _saveStatus,
                  lastSavedAt: _lastSavedAt,
                  currentPage: _currentPage,
                  showPageIndicator: chapter != null,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  KeyEventResult _onPageKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final isCtrl = HardwareKeyboard.instance.isControlPressed ||
        HardwareKeyboard.instance.isMetaPressed;
    if (isCtrl && event.logicalKey == LogicalKeyboardKey.keyF) {
      _openSearch();
      return KeyEventResult.handled;
    }
    if (_searchOpen && event.logicalKey == LogicalKeyboardKey.escape) {
      _closeSearch();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }
}

class _ChapterHeader extends StatelessWidget {
  final String bookTitle;
  final String chapterTitle;
  final BookViewMode viewMode;
  final bool showToggle;
  final VoidCallback onToggleMode;
  final bool showSearch;
  final VoidCallback onOpenSearch;

  const _ChapterHeader({
    required this.bookTitle,
    required this.chapterTitle,
    required this.viewMode,
    required this.showToggle,
    required this.onToggleMode,
    required this.showSearch,
    required this.onOpenSearch,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Container(
      height: 30,
      padding: const EdgeInsets.only(left: 12, right: 4),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(
          bottom: BorderSide(color: colors.border, width: 1),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: RichText(
              overflow: TextOverflow.ellipsis,
              text: TextSpan(
                style: TextStyle(fontSize: 12, color: colors.textLight),
                children: [
                  TextSpan(text: bookTitle),
                  const TextSpan(text: '  ›  '),
                  TextSpan(
                    text: chapterTitle,
                    style: TextStyle(
                      color: colors.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (showToggle)
            _ViewModeToggle(mode: viewMode, onTap: onToggleMode),
          if (showSearch) _HeaderIcon(
            icon: Icons.settings_outlined,
            tooltip: 'Buscar y reemplazar (Ctrl+F)',
            onTap: onOpenSearch,
          ),
        ],
      ),
    );
  }
}

class _HeaderIcon extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _HeaderIcon({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Tooltip(
      message: tooltip,
      waitDuration: const Duration(milliseconds: 400),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(2),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Icon(icon, size: 16, color: colors.textSecondary),
        ),
      ),
    );
  }
}

class _ViewModeToggle extends StatelessWidget {
  final BookViewMode mode;
  final VoidCallback onTap;

  const _ViewModeToggle({required this.mode, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final isScroll = mode == BookViewMode.scroll;
    return Tooltip(
      message: isScroll
          ? 'Cambiar a vista paginada'
          : 'Cambiar a vista de scroll',
      waitDuration: const Duration(milliseconds: 400),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(2),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Icon(
            isScroll ? Icons.view_stream_outlined : Icons.menu_book_outlined,
            size: 16,
            color: colors.textSecondary,
          ),
        ),
      ),
    );
  }
}
