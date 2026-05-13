import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/books_repository_impl.dart';
import '../../data/services/books_storage_service.dart';
import '../../data/services/pdf_export_service.dart';
import '../../domain/entities/book.dart';
import '../../domain/entities/folder.dart';
import '../../domain/repositories/books_repository.dart';

class BooksState {
  final List<Book> books;

  const BooksState({this.books = const []});

  BooksState copyWith({List<Book>? books}) =>
      BooksState(books: books ?? this.books);
}

final booksStorageServiceProvider = Provider<BooksStorageService>((ref) {
  return BooksStorageService();
});

final booksRepositoryProvider = Provider<BooksRepository>((ref) {
  return BooksRepositoryImpl(ref.read(booksStorageServiceProvider));
});

final pdfExportServiceProvider = Provider<PdfExportService>((ref) {
  return PdfExportService(ref.read(booksStorageServiceProvider));
});

final booksProvider =
    AsyncNotifierProvider<BooksNotifier, BooksState>(BooksNotifier.new);

/// null = library view (no book open). UUID = that book is open.
final activeBookIdProvider = StateProvider<String?>((ref) => null);

/// null = no chapter selected (book just opened). UUID = that chapter is being edited.
final activeChapterIdProvider = StateProvider<String?>((ref) => null);

/// The TextEditingController owned by BookEditorPage while a chapter is open.
/// Null when the page is unmounted or no chapter is loaded.
final bookEditorControllerProvider =
    StateProvider<TextEditingController?>((ref) => null);

/// Current non-collapsed text selection in the active chapter editor.
/// Null when nothing is selected or no chapter is loaded.
final bookEditorSelectionProvider =
    StateProvider<TextSelection?>((ref) => null);

final activeBookProvider = Provider<Book?>((ref) {
  final id = ref.watch(activeBookIdProvider);
  final state = ref.watch(booksProvider).valueOrNull;
  if (id == null || state == null) return null;
  for (final b in state.books) {
    if (b.id == id) return b;
  }
  return null;
});

class BooksNotifier extends AsyncNotifier<BooksState> {
  late final BooksRepository _repo;

  @override
  Future<BooksState> build() async {
    _repo = ref.read(booksRepositoryProvider);
    final books = await _repo.getBooks();
    return BooksState(books: books);
  }

  void _setBooks(List<Book> books) {
    state = AsyncData(BooksState(books: books));
  }

  Future<Book> createBook(String title) async {
    final book = await _repo.createBook(title);
    final current = state.requireValue;
    _setBooks([...current.books, book]);
    return book;
  }

  Future<void> renameBook(String bookId, String newTitle) async {
    final current = state.requireValue;
    final book = current.books.firstWhere((b) => b.id == bookId);
    final updated = await _repo.renameBook(book, newTitle);
    _setBooks(_replace(current.books, updated));
  }

  Future<void> deleteBook(String bookId) async {
    final current = state.requireValue;
    final book = current.books.firstWhere((b) => b.id == bookId);
    await _repo.deleteBook(book);
    _setBooks(current.books.where((b) => b.id != bookId).toList());
  }

  Future<String> createChapter(
    String bookId,
    String title, {
    String? folderId,
  }) async {
    final current = state.requireValue;
    final book = current.books.firstWhere((b) => b.id == bookId);
    var updated = await _repo.createChapter(book, title);
    final newChapterId = updated.chapters.last.id;
    if (folderId != null) {
      updated = await _repo.setChapterFolder(updated, newChapterId, folderId);
    }
    _setBooks(_replace(current.books, updated));
    return newChapterId;
  }

  Future<void> renameChapter(
    String bookId,
    String chapterId,
    String newTitle,
  ) async {
    final current = state.requireValue;
    final book = current.books.firstWhere((b) => b.id == bookId);
    final updated = await _repo.renameChapter(book, chapterId, newTitle);
    _setBooks(_replace(current.books, updated));
  }

  Future<void> deleteChapter(String bookId, String chapterId) async {
    final current = state.requireValue;
    final book = current.books.firstWhere((b) => b.id == bookId);
    final updated = await _repo.deleteChapter(book, chapterId);
    _setBooks(_replace(current.books, updated));
  }

  Future<void> reorderChapters(String bookId, List<String> ids) async {
    final current = state.requireValue;
    final book = current.books.firstWhere((b) => b.id == bookId);
    final updated = await _repo.reorderChapters(book, ids);
    _setBooks(_replace(current.books, updated));
  }

  Future<void> moveChapter(
    String sourceBookId,
    String chapterId,
    String destinationBookId, {
    String? destFolderId,
  }) async {
    final current = state.requireValue;
    final source = current.books.firstWhere((b) => b.id == sourceBookId);
    if (sourceBookId == destinationBookId) {
      // Same book — fold into setChapterFolder.
      final chapter = source.chapters.firstWhere((c) => c.id == chapterId);
      if (chapter.folderId == destFolderId) return;
      final updated =
          await _repo.setChapterFolder(source, chapterId, destFolderId);
      _setBooks(_replace(current.books, updated));
      return;
    }
    final dest = current.books.firstWhere((b) => b.id == destinationBookId);
    final (updatedSource, updatedDest) = await _repo.moveChapter(
      source,
      chapterId,
      dest,
      destFolderId: destFolderId,
    );
    var books = _replace(current.books, updatedSource);
    books = _replace(books, updatedDest);
    _setBooks(books);
  }

  Future<void> setChapterFolder(
    String bookId,
    String chapterId,
    String? folderId,
  ) async {
    final current = state.requireValue;
    final book = current.books.firstWhere((b) => b.id == bookId);
    final updated = await _repo.setChapterFolder(book, chapterId, folderId);
    _setBooks(_replace(current.books, updated));
  }

  Future<Folder> createFolder(String bookId, String name) async {
    final current = state.requireValue;
    final book = current.books.firstWhere((b) => b.id == bookId);
    final (updated, folder) = await _repo.createFolder(book, name);
    _setBooks(_replace(current.books, updated));
    return folder;
  }

  Future<void> renameFolder(
    String bookId,
    String folderId,
    String newName,
  ) async {
    final current = state.requireValue;
    final book = current.books.firstWhere((b) => b.id == bookId);
    final updated = await _repo.renameFolder(book, folderId, newName);
    _setBooks(_replace(current.books, updated));
  }

  Future<void> deleteFolder(String bookId, String folderId) async {
    final current = state.requireValue;
    final book = current.books.firstWhere((b) => b.id == bookId);
    final updated = await _repo.deleteFolder(book, folderId);
    _setBooks(_replace(current.books, updated));
  }

  Future<String> readChapterContent(String bookId, String chapterId) async {
    final current = state.requireValue;
    final book = current.books.firstWhere((b) => b.id == bookId);
    return _repo.readChapter(book, chapterId);
  }

  Future<void> saveChapterContent(
    String bookId,
    String chapterId,
    String content,
  ) async {
    final current = state.requireValue;
    final book = current.books.firstWhere((b) => b.id == bookId);
    await _repo.writeChapter(book, chapterId, content);
    final updated = book.copyWith(updatedAt: DateTime.now());
    _setBooks(_replace(current.books, updated));
  }

  Future<void> refresh() async {
    final books = await _repo.getBooks();
    _setBooks(books);
  }

  static List<Book> _replace(List<Book> books, Book book) {
    final copy = List<Book>.from(books);
    final index = copy.indexWhere((b) => b.id == book.id);
    if (index >= 0) {
      copy[index] = book;
    } else {
      copy.add(book);
    }
    return copy;
  }
}
