import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../domain/entities/book.dart';
import '../../domain/entities/chapter.dart';

class BooksStorageService {
  static const _booksDirName = 'Books';
  static const _manifestFileName = 'book.json';

  Future<Directory> _rootDir() async {
    if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
      return File(Platform.resolvedExecutable).parent;
    }
    return getApplicationDocumentsDirectory();
  }

  Future<Directory> get booksDir async {
    final root = await _rootDir();
    final dir = Directory(p.join(root.path, _booksDirName));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  static String safeName(String name) {
    final sanitized = name.replaceAll(RegExp(r'[<>:"/\\|?*\x00-\x1F]'), '_').trim();
    if (sanitized.isEmpty) return 'sin-nombre';
    return sanitized.length > 100 ? sanitized.substring(0, 100) : sanitized;
  }

  Directory bookFolder(Directory root, String folderName) {
    return Directory(p.join(root.path, folderName));
  }

  /// Reads, reconciles, and re-writes book.json if needed. Reconciliation:
  /// - .md files in the folder not listed in `chapters` → append at end.
  /// - Entries whose `file` no longer exists → drop.
  /// Returns null if the folder has no recoverable manifest AND no .md files.
  Future<Book?> loadBook(Directory folder) async {
    if (!await folder.exists()) return null;
    final folderName = p.basename(folder.path);
    final manifestFile = File(p.join(folder.path, _manifestFileName));

    Book? book;
    if (await manifestFile.exists()) {
      try {
        final raw = await manifestFile.readAsString();
        final json = jsonDecode(raw) as Map<String, dynamic>;
        book = Book.fromJson(json, folderName: folderName);
      } catch (_) {
        // Malformed — fall through to rebuild from disk.
      }
    }

    final mdFiles = <String>[];
    await for (final entity in folder.list()) {
      if (entity is! File) continue;
      if (!entity.path.toLowerCase().endsWith('.md')) continue;
      mdFiles.add(p.basename(entity.path));
    }
    mdFiles.sort();

    if (book == null) {
      if (mdFiles.isEmpty) return null;
      final now = DateTime.now();
      final chapters = mdFiles
          .map((f) => Chapter(
                id: Chapter.generateId(),
                title: p.basenameWithoutExtension(f),
                file: f,
              ))
          .toList();
      book = Book(
        id: Book.generateId(),
        title: folderName,
        chapters: chapters,
        createdAt: now,
        updatedAt: now,
        folderName: folderName,
      );
      await saveManifest(book);
      return book;
    }

    final knownFiles = book.chapters.map((c) => c.file).toSet();
    final existing = book.chapters
        .where((c) => mdFiles.contains(c.file))
        .toList();
    final orphans = mdFiles.where((f) => !knownFiles.contains(f)).toList();
    final reconciledChapters = [
      ...existing,
      for (final f in orphans)
        Chapter(
          id: Chapter.generateId(),
          title: p.basenameWithoutExtension(f),
          file: f,
        ),
    ];

    final changed = existing.length != book.chapters.length || orphans.isNotEmpty;
    if (changed) {
      book = book.copyWith(
        chapters: reconciledChapters,
        updatedAt: DateTime.now(),
      );
      await saveManifest(book);
    }
    return book;
  }

  Future<List<Book>> loadAllBooks() async {
    final root = await booksDir;
    final books = <Book>[];
    await for (final entity in root.list()) {
      if (entity is! Directory) continue;
      final book = await loadBook(entity);
      if (book != null) books.add(book);
    }
    books.sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
    return books;
  }

  /// Atomic write: tmp file + rename.
  Future<void> saveManifest(Book book) async {
    final root = await booksDir;
    final folder = bookFolder(root, book.folderName);
    if (!await folder.exists()) await folder.create(recursive: true);
    final manifest = File(p.join(folder.path, _manifestFileName));
    final tmp = File('${manifest.path}.tmp');
    await tmp.writeAsString(jsonEncode(book.toJson()));
    if (await manifest.exists()) await manifest.delete();
    await tmp.rename(manifest.path);
  }

  Future<String> readChapter(Book book, String chapterId) async {
    final chapter = book.chapters.firstWhere((c) => c.id == chapterId);
    final root = await booksDir;
    final file = File(p.join(root.path, book.folderName, chapter.file));
    if (!await file.exists()) return '';
    return file.readAsString();
  }

  Future<void> writeChapter(Book book, String chapterId, String content) async {
    final chapter = book.chapters.firstWhere((c) => c.id == chapterId);
    final root = await booksDir;
    final file = File(p.join(root.path, book.folderName, chapter.file));
    final tmp = File('${file.path}.tmp');
    await tmp.writeAsString(content);
    if (await file.exists()) await file.delete();
    await tmp.rename(file.path);
  }

  Future<Directory> createBookFolder(String title) async {
    final root = await booksDir;
    final base = safeName(title);
    var name = base;
    var i = 2;
    while (await Directory(p.join(root.path, name)).exists()) {
      name = '$base ($i)';
      i++;
    }
    final folder = Directory(p.join(root.path, name));
    await folder.create(recursive: true);
    return folder;
  }

  Future<Directory> renameBookFolder(Book book, String newTitle) async {
    final root = await booksDir;
    final oldFolder = bookFolder(root, book.folderName);
    final base = safeName(newTitle);
    if (base == book.folderName) return oldFolder;
    var name = base;
    var i = 2;
    while (await Directory(p.join(root.path, name)).exists()) {
      name = '$base ($i)';
      i++;
    }
    return Directory(oldFolder.path).rename(p.join(root.path, name));
  }

  Future<void> deleteBookFolder(Book book) async {
    final root = await booksDir;
    final folder = bookFolder(root, book.folderName);
    if (await folder.exists()) await folder.delete(recursive: true);
  }

  /// Returns the new chapter file name (already unique within the folder).
  Future<String> createChapterFile(Book book, String title) async {
    final root = await booksDir;
    final folder = bookFolder(root, book.folderName);
    final base = safeName(title);
    var name = '$base.md';
    var i = 2;
    while (await File(p.join(folder.path, name)).exists()) {
      name = '$base ($i).md';
      i++;
    }
    final file = File(p.join(folder.path, name));
    await file.writeAsString('');
    return name;
  }

  Future<String> renameChapterFile(
    Book book,
    String oldFile,
    String newTitle,
  ) async {
    final root = await booksDir;
    final folder = bookFolder(root, book.folderName);
    final source = File(p.join(folder.path, oldFile));
    final base = safeName(newTitle);
    var name = '$base.md';
    var i = 2;
    while (await File(p.join(folder.path, name)).exists() && name != oldFile) {
      name = '$base ($i).md';
      i++;
    }
    if (name == oldFile) return oldFile;
    final renamed = await source.rename(p.join(folder.path, name));
    return p.basename(renamed.path);
  }

  Future<void> deleteChapterFile(Book book, String fileName) async {
    final root = await booksDir;
    final file = File(p.join(root.path, book.folderName, fileName));
    if (await file.exists()) await file.delete();
  }

  /// Moves a chapter file across book folders, returning its new file name in
  /// the destination (renamed to avoid collisions).
  Future<String> moveChapterFile(
    Book source,
    String fileName,
    Book destination,
  ) async {
    final root = await booksDir;
    final src = File(p.join(root.path, source.folderName, fileName));
    final destFolder = bookFolder(root, destination.folderName);
    final base = p.basenameWithoutExtension(fileName);
    var name = '$base.md';
    var i = 2;
    while (await File(p.join(destFolder.path, name)).exists()) {
      name = '$base ($i).md';
      i++;
    }
    final dest = await src.rename(p.join(destFolder.path, name));
    return p.basename(dest.path);
  }
}
