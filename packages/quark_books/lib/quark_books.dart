import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import 'data/services/book_tool_handler.dart';
import 'presentation/pages/book_editor_page.dart';
import 'presentation/providers/books_providers.dart';
import 'presentation/widgets/text_prompt_dialog.dart';

class BooksModule extends Quark {
  @override
  String get id => 'quark_books';

  @override
  String get name => 'Quark Books';

  @override
  IconData get icon => Icons.auto_stories_outlined;

  @override
  Widget buildPage() => const BookEditorPage();

  @override
  List<QuarkSettingOption> buildSettings(BuildContext context, WidgetRef ref) {
    final activeBook = ref.watch(activeBookProvider);
    return [
      QuarkSettingOption(
        id: 'new_book',
        label: 'Nuevo libro',
        icon: Icons.add,
        onTap: () => _promptCreateBook(context, ref),
      ),
      if (activeBook != null)
        QuarkSettingOption(
          id: 'export_pdf',
          label: 'Exportar a PDF',
          icon: Icons.picture_as_pdf_outlined,
          onTap: () => _exportPdf(context, ref),
        ),
    ];
  }

  Future<void> _promptCreateBook(BuildContext context, WidgetRef ref) async {
    final name = await showTextPromptDialog(
      context,
      title: 'Nuevo libro',
      hint: 'Título del libro',
      confirmLabel: 'Crear',
    );
    if (name == null || name.trim().isEmpty) return;
    final book = await ref
        .read(booksProvider.notifier)
        .createBook(name.trim());
    ref.read(activeBookIdProvider.notifier).state = book.id;
    if (book.chapters.isNotEmpty) {
      ref.read(activeChapterIdProvider.notifier).state =
          book.chapters.first.id;
    }
  }

  Future<void> _exportPdf(BuildContext context, WidgetRef ref) async {
    final book = ref.read(activeBookProvider);
    if (book == null) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(
      const SnackBar(
        content: Text('Exportando PDF…'),
        duration: Duration(seconds: 2),
      ),
    );
    try {
      final path = await ref
          .read(pdfExportServiceProvider)
          .exportBook(book);
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(
          content: Text('PDF generado: $path'),
          duration: const Duration(seconds: 6),
        ),
      );
    } catch (e) {
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(
          content: Text('Error al exportar PDF: $e'),
          duration: const Duration(seconds: 6),
        ),
      );
    }
  }

  @override
  AiContext? buildAiContext(BuildContext context, WidgetRef ref) {
    final book = ref.watch(activeBookProvider);
    if (book == null) return null;

    final chapterId = ref.watch(activeChapterIdProvider);
    final chapter = chapterId != null
        ? book.chapters.where((c) => c.id == chapterId).firstOrNull
        : null;

    final ctrl = ref.watch(bookEditorControllerProvider);
    final selection = ref.watch(bookEditorSelectionProvider);
    final hasSelection =
        selection != null && selection.isValid && !selection.isCollapsed;
    String? selectionText;
    if (hasSelection && ctrl != null) {
      final text = ctrl.text;
      final start = selection.start.clamp(0, text.length);
      final end = selection.end.clamp(0, text.length);
      if (end > start) selectionText = text.substring(start, end);
    }

    final storage = ref.read(booksStorageServiceProvider);
    final handler = BookToolHandler(book: book, storage: storage);

    return AiContext(
      quarkId: 'quark_books',
      systemPromptAddition:
          'You are assisting inside the user\'s book "${book.title}". '
          'Use search_chapters to find content across the book and '
          'read_chapter to fetch the full markdown of a chapter. '
          'Cite chapter titles when relevant.',
      tools: kBookTools,
      toolHandler: handler.call,
      currentSelectionText: selectionText,
      suggestions: [
        if (chapter != null && ctrl != null)
          AiAttachmentSuggestion(
            id: 'chapter_${chapter.id}',
            label: chapter.title,
            icon: Icons.description_outlined,
            build: () async => TextAttachment(
              suggestionId: 'chapter_${chapter.id}',
              label: chapter.title,
              content: ctrl.text,
              source: '${book.title} / ${chapter.title}',
            ),
          ),
        if (hasSelection && ctrl != null && chapter != null)
          AiAttachmentSuggestion(
            id: 'selection',
            label: 'Selección (${selection.end - selection.start} car.)',
            icon: Icons.text_fields,
            build: () async {
              final sel = ctrl.selection;
              if (!sel.isValid || sel.isCollapsed) return null;
              final text = ctrl.text;
              return TextAttachment(
                suggestionId: 'selection',
                label: 'Selección',
                content: text.substring(
                  sel.start.clamp(0, text.length),
                  sel.end.clamp(0, text.length),
                ),
                source: '${book.title} / ${chapter.title}',
              );
            },
          ),
      ],
      contextLabel: chapter != null
          ? '${book.title} · ${chapter.title}'
          : book.title,
    );
  }

  @override
  bool onEscape(WidgetRef ref) {
    final activeChapter = ref.read(activeChapterIdProvider);
    if (activeChapter != null) {
      ref.read(activeChapterIdProvider.notifier).state = null;
      return true;
    }
    final activeBook = ref.read(activeBookIdProvider);
    if (activeBook != null) {
      ref.read(activeBookIdProvider.notifier).state = null;
      return true;
    }
    return false;
  }

  @override
  Future<void> initialize() async {}

  @override
  void dispose() {}
}
