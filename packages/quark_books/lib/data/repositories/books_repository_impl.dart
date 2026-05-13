import 'package:path/path.dart' as p;

import '../../domain/entities/book.dart';
import '../../domain/entities/chapter.dart';
import '../../domain/entities/folder.dart';
import '../../domain/repositories/books_repository.dart';
import '../services/books_storage_service.dart';

class BooksRepositoryImpl implements BooksRepository {
  BooksRepositoryImpl(this._storage);

  final BooksStorageService _storage;

  @override
  Future<List<Book>> getBooks() => _storage.loadAllBooks();

  @override
  Future<String> readChapter(Book book, String chapterId) =>
      _storage.readChapter(book, chapterId);

  @override
  Future<void> writeChapter(Book book, String chapterId, String content) async {
    await _storage.writeChapter(book, chapterId, content);
    final updated = book.copyWith(updatedAt: DateTime.now());
    await _storage.saveManifest(updated);
  }

  @override
  Future<Book> createBook(String title) async {
    final folder = await _storage.createBookFolder(title);
    final folderName = p.basename(folder.path);
    final now = DateTime.now();
    final shellBook = Book(
      id: Book.generateId(),
      title: title.trim().isEmpty ? folderName : title.trim(),
      chapters: const [],
      createdAt: now,
      updatedAt: now,
      folderName: folderName,
    );
    final chapterFileName =
        await _storage.createChapterFile(shellBook, 'Capítulo 1');
    final chapter = Chapter(
      id: Chapter.generateId(),
      title: p.basenameWithoutExtension(chapterFileName),
      file: chapterFileName,
    );
    final book = shellBook.copyWith(chapters: [chapter]);
    await _storage.saveManifest(book);
    return book;
  }

  @override
  Future<Book> renameBook(Book book, String newTitle) async {
    final trimmed = newTitle.trim();
    if (trimmed.isEmpty || trimmed == book.title) return book;
    final newFolder = await _storage.renameBookFolder(book, trimmed);
    final updated = book.copyWith(
      title: trimmed,
      folderName: p.basename(newFolder.path),
      updatedAt: DateTime.now(),
    );
    await _storage.saveManifest(updated);
    return updated;
  }

  @override
  Future<void> deleteBook(Book book) async {
    await _storage.deleteBookFolder(book);
  }

  @override
  Future<Book> createChapter(Book book, String title) async {
    final fileName = await _storage.createChapterFile(book, title);
    final chapter = Chapter(
      id: Chapter.generateId(),
      title: p.basenameWithoutExtension(fileName),
      file: fileName,
    );
    final updated = book.copyWith(
      chapters: [...book.chapters, chapter],
      updatedAt: DateTime.now(),
    );
    await _storage.saveManifest(updated);
    return updated;
  }

  @override
  Future<Book> renameChapter(
    Book book,
    String chapterId,
    String newTitle,
  ) async {
    final trimmed = newTitle.trim();
    if (trimmed.isEmpty) return book;
    final chapter = book.chapters.firstWhere((c) => c.id == chapterId);
    final newFile = await _storage.renameChapterFile(
      book,
      chapter.file,
      trimmed,
    );
    final chapters = book.chapters
        .map((c) => c.id == chapterId
            ? c.copyWith(title: trimmed, file: newFile)
            : c)
        .toList();
    final updated = book.copyWith(
      chapters: chapters,
      updatedAt: DateTime.now(),
    );
    await _storage.saveManifest(updated);
    return updated;
  }

  @override
  Future<Book> deleteChapter(Book book, String chapterId) async {
    final chapter = book.chapters.firstWhere((c) => c.id == chapterId);
    await _storage.deleteChapterFile(book, chapter.file);
    final chapters =
        book.chapters.where((c) => c.id != chapterId).toList();
    final updated = book.copyWith(
      chapters: chapters,
      updatedAt: DateTime.now(),
    );
    await _storage.saveManifest(updated);
    return updated;
  }

  @override
  Future<Book> reorderChapters(Book book, List<String> newOrderIds) async {
    final byId = {for (final c in book.chapters) c.id: c};
    final reordered = <Chapter>[];
    for (final id in newOrderIds) {
      final c = byId.remove(id);
      if (c != null) reordered.add(c);
    }
    reordered.addAll(byId.values); // trailing leftovers stay at end
    final updated = book.copyWith(
      chapters: reordered,
      updatedAt: DateTime.now(),
    );
    await _storage.saveManifest(updated);
    return updated;
  }

  @override
  Future<(Book, Book)> moveChapter(
    Book source,
    String chapterId,
    Book destination, {
    String? destFolderId,
  }) async {
    final chapter = source.chapters.firstWhere((c) => c.id == chapterId);
    final newFile = await _storage.moveChapterFile(
      source,
      chapter.file,
      destination,
    );
    final sourceChapters =
        source.chapters.where((c) => c.id != chapterId).toList();
    final destChapters = [
      ...destination.chapters,
      chapter.copyWith(file: newFile, folderId: destFolderId),
    ];
    final now = DateTime.now();
    final updatedSource =
        source.copyWith(chapters: sourceChapters, updatedAt: now);
    final updatedDest =
        destination.copyWith(chapters: destChapters, updatedAt: now);
    await _storage.saveManifest(updatedSource);
    await _storage.saveManifest(updatedDest);
    return (updatedSource, updatedDest);
  }

  @override
  Future<Book> setChapterFolder(
    Book book,
    String chapterId,
    String? folderId,
  ) async {
    if (folderId != null &&
        !book.folders.any((f) => f.id == folderId)) {
      return book; // ignore stale target
    }
    final chapters = book.chapters
        .map((c) => c.id == chapterId ? c.copyWith(folderId: folderId) : c)
        .toList();
    final updated = book.copyWith(
      chapters: chapters,
      updatedAt: DateTime.now(),
    );
    await _storage.saveManifest(updated);
    return updated;
  }

  @override
  Future<(Book, Folder)> createFolder(Book book, String name) async {
    final folder = Folder(id: Folder.generateId(), name: name.trim());
    final updated = book.copyWith(
      folders: [...book.folders, folder],
      updatedAt: DateTime.now(),
    );
    await _storage.saveManifest(updated);
    return (updated, folder);
  }

  @override
  Future<Book> renameFolder(
    Book book,
    String folderId,
    String newName,
  ) async {
    final trimmed = newName.trim();
    if (trimmed.isEmpty) return book;
    final folders = book.folders
        .map((f) => f.id == folderId ? f.copyWith(name: trimmed) : f)
        .toList();
    final updated = book.copyWith(
      folders: folders,
      updatedAt: DateTime.now(),
    );
    await _storage.saveManifest(updated);
    return updated;
  }

  @override
  Future<Book> deleteFolder(Book book, String folderId) async {
    final folders = book.folders.where((f) => f.id != folderId).toList();
    final chapters = book.chapters
        .map((c) =>
            c.folderId == folderId ? c.copyWith(folderId: null) : c)
        .toList();
    final updated = book.copyWith(
      folders: folders,
      chapters: chapters,
      updatedAt: DateTime.now(),
    );
    await _storage.saveManifest(updated);
    return updated;
  }
}
