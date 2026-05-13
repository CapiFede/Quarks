import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/book.dart';
import '../../domain/entities/chapter.dart';
import '../../domain/entities/folder.dart';
import '../providers/books_providers.dart';
import 'text_prompt_dialog.dart';

class BooksTreeView extends ConsumerStatefulWidget {
  const BooksTreeView({super.key});

  @override
  ConsumerState<BooksTreeView> createState() => _BooksTreeViewState();
}

class _BooksTreeViewState extends ConsumerState<BooksTreeView> {
  final Set<String> _expandedBooks = <String>{};
  final Set<String> _expandedFolders = <String>{}; // values: '<bookId>/<folderId>'

  String _folderKey(String bookId, String folderId) => '$bookId/$folderId';

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final state = ref.watch(booksProvider);

    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        border: Border(
          right: BorderSide(color: colors.border, width: 1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _TreeHeader(onCreate: _promptCreateBook),
          Expanded(
            child: state.when(
              loading: () => Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.primary,
                  ),
                ),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  'Error: $e',
                  style: TextStyle(fontSize: 11, color: colors.error),
                ),
              ),
              data: (data) {
                if (data.books.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      'No hay libros. Creá uno con el + de arriba.',
                      style:
                          TextStyle(fontSize: 11, color: colors.textLight),
                    ),
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  itemCount: data.books.length,
                  itemBuilder: (ctx, i) {
                    final book = data.books[i];
                    return _BookNode(
                      book: book,
                      expanded: _expandedBooks.contains(book.id),
                      isFolderExpanded: (folderId) =>
                          _expandedFolders.contains(_folderKey(book.id, folderId)),
                      onToggle: () => setState(() {
                        if (!_expandedBooks.add(book.id)) {
                          _expandedBooks.remove(book.id);
                        }
                      }),
                      onToggleFolder: (folderId) => setState(() {
                        final key = _folderKey(book.id, folderId);
                        if (!_expandedFolders.add(key)) {
                          _expandedFolders.remove(key);
                        }
                      }),
                      onRename: () => _promptRenameBook(book),
                      onDelete: () => _confirmDeleteBook(book),
                      onCreateChapter: () => _promptCreateChapter(book),
                      onCreateChapterInFolder: (folderId) =>
                          _promptCreateChapter(book, folderId: folderId),
                      onCreateFolder: () => _promptCreateFolder(book),
                      onChapterDropped: (payload, folderId) {
                        ref.read(booksProvider.notifier).moveChapter(
                              payload.bookId,
                              payload.chapterId,
                              book.id,
                              destFolderId: folderId,
                            );
                      },
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _promptCreateBook() async {
    final name = await _promptText(
      title: 'Nuevo libro',
      hint: 'Título del libro',
    );
    if (name == null || name.trim().isEmpty) return;
    final book = await ref.read(booksProvider.notifier).createBook(name.trim());
    if (!mounted) return;
    setState(() => _expandedBooks.add(book.id));
    ref.read(activeBookIdProvider.notifier).state = book.id;
    if (book.chapters.isNotEmpty) {
      ref.read(activeChapterIdProvider.notifier).state =
          book.chapters.first.id;
    }
  }

  Future<void> _promptRenameBook(Book book) async {
    final name = await _promptText(
      title: 'Renombrar libro',
      hint: 'Nuevo título',
      initial: book.title,
    );
    if (name == null || name.trim().isEmpty) return;
    await ref
        .read(booksProvider.notifier)
        .renameBook(book.id, name.trim());
  }

  Future<void> _confirmDeleteBook(Book book) async {
    final colors = context.quarksColors;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text(
          'Eliminar libro',
          style: TextStyle(color: colors.textPrimary, fontSize: 14),
        ),
        content: Text(
          '¿Borrar "${book.title}" y todos sus capítulos? Esta acción no se puede deshacer.',
          style: TextStyle(color: colors.textSecondary, fontSize: 12),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancelar',
                style: TextStyle(color: colors.textSecondary, fontSize: 12)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Eliminar',
                style: TextStyle(color: colors.error, fontSize: 12)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final activeId = ref.read(activeBookIdProvider);
    await ref.read(booksProvider.notifier).deleteBook(book.id);
    if (activeId == book.id) {
      ref.read(activeBookIdProvider.notifier).state = null;
      ref.read(activeChapterIdProvider.notifier).state = null;
    }
  }

  Future<void> _promptCreateChapter(Book book, {String? folderId}) async {
    final name = await _promptText(
      title: 'Nuevo capítulo',
      hint: 'Título del capítulo',
    );
    if (name == null || name.trim().isEmpty) return;
    final chapterId = await ref
        .read(booksProvider.notifier)
        .createChapter(book.id, name.trim(), folderId: folderId);
    if (!mounted) return;
    setState(() {
      _expandedBooks.add(book.id);
      if (folderId != null) _expandedFolders.add(_folderKey(book.id, folderId));
    });
    ref.read(activeBookIdProvider.notifier).state = book.id;
    ref.read(activeChapterIdProvider.notifier).state = chapterId;
  }

  Future<void> _promptCreateFolder(Book book) async {
    final name = await _promptText(
      title: 'Nueva carpeta',
      hint: 'Nombre de la carpeta',
    );
    if (name == null || name.trim().isEmpty) return;
    final folder =
        await ref.read(booksProvider.notifier).createFolder(book.id, name.trim());
    if (!mounted) return;
    setState(() {
      _expandedBooks.add(book.id);
      _expandedFolders.add(_folderKey(book.id, folder.id));
    });
  }

  Future<String?> _promptText({
    required String title,
    required String hint,
    String? initial,
  }) {
    return showTextPromptDialog(
      context,
      title: title,
      hint: hint,
      initial: initial,
    );
  }
}

class _TreeHeader extends StatelessWidget {
  final VoidCallback onCreate;
  const _TreeHeader({required this.onCreate});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Container(
      height: 32,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(
          bottom: BorderSide(color: colors.border, width: 1),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.menu_book_outlined, size: 13, color: colors.textSecondary),
          const SizedBox(width: 6),
          Text(
            'Libros',
            style: TextStyle(
              fontSize: 12,
              color: colors.textPrimary,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          _IconAction(
            icon: Icons.add,
            onTap: onCreate,
            tooltip: 'Nuevo libro',
          ),
        ],
      ),
    );
  }
}

class _BookNode extends ConsumerWidget {
  final Book book;
  final bool expanded;
  final bool Function(String folderId) isFolderExpanded;
  final VoidCallback onToggle;
  final void Function(String folderId) onToggleFolder;
  final VoidCallback onRename;
  final VoidCallback onDelete;
  final VoidCallback onCreateChapter;
  final void Function(String folderId) onCreateChapterInFolder;
  final VoidCallback onCreateFolder;
  // Called when a chapter is dropped somewhere inside this book. folderId is
  // the destination folder (null = book root).
  final void Function(_ChapterDragPayload payload, String? folderId)
      onChapterDropped;

  const _BookNode({
    required this.book,
    required this.expanded,
    required this.isFolderExpanded,
    required this.onToggle,
    required this.onToggleFolder,
    required this.onRename,
    required this.onDelete,
    required this.onCreateChapter,
    required this.onCreateChapterInFolder,
    required this.onCreateFolder,
    required this.onChapterDropped,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final isActive = ref.watch(activeBookIdProvider) == book.id;

    final validFolderIds = book.folders.map((f) => f.id).toSet();
    final rootChapters = book.chapters
        .where((c) =>
            c.folderId == null || !validFolderIds.contains(c.folderId))
        .toList();
    final chaptersByFolder = <String, List<Chapter>>{
      for (final f in book.folders) f.id: [],
    };
    for (final c in book.chapters) {
      if (c.folderId != null && validFolderIds.contains(c.folderId)) {
        chaptersByFolder[c.folderId!]!.add(c);
      }
    }

    return DragTarget<_ChapterDragPayload>(
      onWillAcceptWithDetails: (details) {
        // Reject if it's already in this book at the root.
        if (details.data.bookId == book.id && details.data.folderId == null) {
          return false;
        }
        return true;
      },
      onAcceptWithDetails: (details) {
        onChapterDropped(details.data, null);
      },
      builder: (ctx, candidates, _) {
        final highlight = candidates.isNotEmpty;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onSecondaryTapDown: (d) =>
                  _showBookMenu(context, d.globalPosition, colors),
              onTap: () {
                ref.read(activeBookIdProvider.notifier).state = book.id;
                onToggle();
                if (book.chapters.isNotEmpty) {
                  ref.read(activeChapterIdProvider.notifier).state =
                      ref.read(activeChapterIdProvider) ??
                          book.chapters.first.id;
                }
              },
              child: MouseRegion(
                cursor: SystemMouseCursors.click,
                child: Container(
                  height: 26,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  decoration: BoxDecoration(
                    color: highlight
                        ? colors.cardHover
                        : isActive
                            ? colors.cardHover
                            : Colors.transparent,
                  ),
                  child: Row(
                    children: [
                      Icon(
                        expanded
                            ? Icons.keyboard_arrow_down
                            : Icons.keyboard_arrow_right,
                        size: 14,
                        color: colors.textSecondary,
                      ),
                      const SizedBox(width: 2),
                      Icon(
                        Icons.book_outlined,
                        size: 12,
                        color: colors.primary,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          book.title,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            color: colors.textPrimary,
                            fontWeight: isActive
                                ? FontWeight.w600
                                : FontWeight.normal,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (expanded) ...[
              for (final folder in book.folders)
                _FolderNode(
                  book: book,
                  folder: folder,
                  expanded: isFolderExpanded(folder.id),
                  onToggle: () => onToggleFolder(folder.id),
                  chapters: chaptersByFolder[folder.id]!,
                  onChapterDropped: (payload) =>
                      onChapterDropped(payload, folder.id),
                  onCreateChapter: () => onCreateChapterInFolder(folder.id),
                  onCreateFolder: onCreateFolder,
                ),
              for (final chapter in rootChapters)
                _ChapterNode(
                  book: book,
                  chapter: chapter,
                  indent: 28,
                ),
              _NewChapterRow(onTap: onCreateChapter),
            ],
          ],
        );
      },
    );
  }

  void _showBookMenu(
      BuildContext context, Offset position, QuarksColorExtension colors) {
    final overlay =
        Navigator.of(context).overlay!.context.findRenderObject() as RenderBox;
    showMenu<String>(
      context: context,
      position: RelativeRect.fromRect(
        position & const Size(40, 40),
        Offset.zero & overlay.size,
      ),
      elevation: 0,
      color: colors.surface,
      shape: Border.all(color: colors.borderDark, width: 1),
      items: [
        _menuItem('new_chapter', 'Nuevo capítulo', Icons.add, colors),
        _menuItem(
            'new_folder', 'Nueva carpeta', Icons.create_new_folder_outlined, colors),
        _menuItem('rename', 'Renombrar', Icons.edit, colors),
        _menuItem('delete', 'Eliminar', Icons.delete_outline, colors,
            destructive: true),
      ],
    ).then((value) {
      switch (value) {
        case 'new_chapter':
          onCreateChapter();
          break;
        case 'new_folder':
          onCreateFolder();
          break;
        case 'rename':
          onRename();
          break;
        case 'delete':
          onDelete();
          break;
      }
    });
  }
}

class _FolderNode extends ConsumerWidget {
  final Book book;
  final Folder folder;
  final bool expanded;
  final VoidCallback onToggle;
  final List<Chapter> chapters;
  final void Function(_ChapterDragPayload payload) onChapterDropped;
  final VoidCallback onCreateChapter;
  final VoidCallback onCreateFolder;

  const _FolderNode({
    required this.book,
    required this.folder,
    required this.expanded,
    required this.onToggle,
    required this.chapters,
    required this.onChapterDropped,
    required this.onCreateChapter,
    required this.onCreateFolder,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;

    return DragTarget<_ChapterDragPayload>(
      onWillAcceptWithDetails: (details) {
        // Already here? skip.
        if (details.data.bookId == book.id &&
            details.data.folderId == folder.id) {
          return false;
        }
        return true;
      },
      onAcceptWithDetails: (details) => onChapterDropped(details.data),
      builder: (ctx, candidates, _) {
        final highlight = candidates.isNotEmpty;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GestureDetector(
              onSecondaryTapDown: (d) =>
                  _showFolderMenu(context, ref, d.globalPosition, colors),
              child: MouseRegion(
                cursor: SystemMouseCursors.click,
                child: Container(
                  height: 24,
                  padding: const EdgeInsets.only(left: 24, right: 8),
                  color: highlight ? colors.cardHover : null,
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: onToggle,
                        child: Icon(
                          expanded
                              ? Icons.keyboard_arrow_down
                              : Icons.keyboard_arrow_right,
                          size: 13,
                          color: colors.textSecondary,
                        ),
                      ),
                      const SizedBox(width: 2),
                      Icon(
                        expanded ? Icons.folder_open : Icons.folder,
                        size: 12,
                        color: colors.textSecondary,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: GestureDetector(
                          onTap: onToggle,
                          child: Text(
                            folder.name,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              color: colors.textPrimary,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (expanded)
              for (final chapter in chapters)
                _ChapterNode(
                  book: book,
                  chapter: chapter,
                  indent: 48,
                ),
          ],
        );
      },
    );
  }

  void _showFolderMenu(
    BuildContext context,
    WidgetRef ref,
    Offset position,
    QuarksColorExtension colors,
  ) {
    final overlay =
        Navigator.of(context).overlay!.context.findRenderObject() as RenderBox;
    showMenu<String>(
      context: context,
      position: RelativeRect.fromRect(
        position & const Size(40, 40),
        Offset.zero & overlay.size,
      ),
      elevation: 0,
      color: colors.surface,
      shape: Border.all(color: colors.borderDark, width: 1),
      items: [
        _menuItem('new_chapter', 'Nuevo capítulo', Icons.add, colors),
        _menuItem('new_folder', 'Nueva carpeta',
            Icons.create_new_folder_outlined, colors),
        _menuItem('rename', 'Renombrar', Icons.edit, colors),
        _menuItem('delete', 'Eliminar', Icons.delete_outline, colors,
            destructive: true),
      ],
    ).then((value) async {
      if (!context.mounted) return;
      switch (value) {
        case 'new_chapter':
          onCreateChapter();
          break;
        case 'new_folder':
          onCreateFolder();
          break;
        case 'rename':
          await _promptRename(context, ref);
          break;
        case 'delete':
          await _confirmDelete(context, ref);
          break;
      }
    });
  }

  Future<void> _promptRename(BuildContext context, WidgetRef ref) async {
    final result = await showTextPromptDialog(
      context,
      title: 'Renombrar carpeta',
      hint: 'Nuevo nombre',
      initial: folder.name,
    );
    if (result == null || result.trim().isEmpty) return;
    await ref
        .read(booksProvider.notifier)
        .renameFolder(book.id, folder.id, result.trim());
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final colors = context.quarksColors;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text(
          'Eliminar carpeta',
          style: TextStyle(color: colors.textPrimary, fontSize: 14),
        ),
        content: Text(
          '¿Borrar la carpeta "${folder.name}"? Los capítulos que contiene vuelven al libro.',
          style: TextStyle(color: colors.textSecondary, fontSize: 12),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancelar',
                style: TextStyle(color: colors.textSecondary, fontSize: 12)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Eliminar',
                style: TextStyle(color: colors.error, fontSize: 12)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await ref
        .read(booksProvider.notifier)
        .deleteFolder(book.id, folder.id);
  }
}

class _ChapterNode extends ConsumerWidget {
  final Book book;
  final Chapter chapter;
  final double indent;

  const _ChapterNode({
    required this.book,
    required this.chapter,
    required this.indent,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final activeBookId = ref.watch(activeBookIdProvider);
    final activeChapterId = ref.watch(activeChapterIdProvider);
    final isActive =
        activeBookId == book.id && activeChapterId == chapter.id;

    final tile = MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: () {
          ref.read(activeBookIdProvider.notifier).state = book.id;
          ref.read(activeChapterIdProvider.notifier).state = chapter.id;
        },
        onSecondaryTapDown: (d) =>
            _showChapterMenu(context, ref, d.globalPosition),
        child: Container(
          height: 24,
          padding: EdgeInsets.only(left: indent, right: 8),
          color: isActive ? colors.primary.withValues(alpha: 0.15) : null,
          child: Row(
            children: [
              Icon(
                Icons.description_outlined,
                size: 12,
                color: isActive ? colors.primary : colors.textLight,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  chapter.title,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: isActive ? colors.primary : colors.textSecondary,
                    fontWeight:
                        isActive ? FontWeight.w600 : FontWeight.normal,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    return LongPressDraggable<_ChapterDragPayload>(
      data: _ChapterDragPayload(
        bookId: book.id,
        chapterId: chapter.id,
        folderId: chapter.folderId,
      ),
      delay: const Duration(milliseconds: 250),
      feedback: Material(
        color: Colors.transparent,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: colors.surface,
            border: Border.all(color: colors.primary, width: 1),
          ),
          child: Text(
            chapter.title,
            style: TextStyle(fontSize: 11, color: colors.textPrimary),
          ),
        ),
      ),
      childWhenDragging: Opacity(opacity: 0.4, child: tile),
      child: tile,
    );
  }

  void _showChapterMenu(BuildContext context, WidgetRef ref, Offset position) {
    final colors = context.quarksColors;
    final overlay =
        Navigator.of(context).overlay!.context.findRenderObject() as RenderBox;
    showMenu<String>(
      context: context,
      position: RelativeRect.fromRect(
        position & const Size(40, 40),
        Offset.zero & overlay.size,
      ),
      elevation: 0,
      color: colors.surface,
      shape: Border.all(color: colors.borderDark, width: 1),
      items: [
        _menuItem('rename', 'Renombrar', Icons.edit, colors),
        _menuItem('delete', 'Eliminar', Icons.delete_outline, colors,
            destructive: true),
      ],
    ).then((value) async {
      if (!context.mounted) return;
      switch (value) {
        case 'rename':
          await _promptRename(context, ref);
          break;
        case 'delete':
          await _confirmDelete(context, ref);
          break;
      }
    });
  }

  Future<void> _promptRename(BuildContext context, WidgetRef ref) async {
    final result = await showTextPromptDialog(
      context,
      title: 'Renombrar capítulo',
      hint: 'Nuevo título',
      initial: chapter.title,
    );
    if (result == null || result.trim().isEmpty) return;
    await ref
        .read(booksProvider.notifier)
        .renameChapter(book.id, chapter.id, result.trim());
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final colors = context.quarksColors;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text(
          'Eliminar capítulo',
          style: TextStyle(color: colors.textPrimary, fontSize: 14),
        ),
        content: Text(
          '¿Borrar "${chapter.title}"? Esta acción no se puede deshacer.',
          style: TextStyle(color: colors.textSecondary, fontSize: 12),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancelar',
                style: TextStyle(color: colors.textSecondary, fontSize: 12)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Eliminar',
                style: TextStyle(color: colors.error, fontSize: 12)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final activeChapter = ref.read(activeChapterIdProvider);
    await ref
        .read(booksProvider.notifier)
        .deleteChapter(book.id, chapter.id);
    if (activeChapter == chapter.id) {
      ref.read(activeChapterIdProvider.notifier).state = null;
    }
  }
}

class _NewChapterRow extends StatelessWidget {
  final VoidCallback onTap;
  const _NewChapterRow({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 22,
          padding: const EdgeInsets.only(left: 28, right: 8),
          child: Row(
            children: [
              Icon(Icons.add, size: 12, color: colors.textLight),
              const SizedBox(width: 6),
              Text(
                'Nuevo capítulo',
                style: TextStyle(fontSize: 12, color: colors.textLight),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _IconAction extends StatefulWidget {
  final IconData icon;
  final VoidCallback onTap;
  final String? tooltip;

  const _IconAction({required this.icon, required this.onTap, this.tooltip});

  @override
  State<_IconAction> createState() => _IconActionState();
}

class _IconActionState extends State<_IconAction> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Tooltip(
      message: widget.tooltip ?? '',
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: Container(
            width: 22,
            height: 22,
            alignment: Alignment.center,
            color: _hover ? colors.cardHover : Colors.transparent,
            child: Icon(widget.icon, size: 14, color: colors.textSecondary),
          ),
        ),
      ),
    );
  }
}

PopupMenuItem<String> _menuItem(
  String value,
  String label,
  IconData icon,
  QuarksColorExtension colors, {
  bool destructive = false,
}) {
  final color = destructive ? colors.error : colors.textPrimary;
  return PopupMenuItem<String>(
    value: value,
    height: 30,
    padding: const EdgeInsets.symmetric(horizontal: 10),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 8),
        Text(label, style: TextStyle(fontSize: 12, color: color)),
      ],
    ),
  );
}

class _ChapterDragPayload {
  final String bookId;
  final String chapterId;
  final String? folderId;
  const _ChapterDragPayload({
    required this.bookId,
    required this.chapterId,
    this.folderId,
  });
}
