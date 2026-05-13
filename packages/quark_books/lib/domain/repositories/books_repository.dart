import '../entities/book.dart';
import '../entities/folder.dart';

abstract class BooksRepository {
  /// Scans the Books/ folder, reconciles each book.json with its .md files,
  /// and returns the current state.
  Future<List<Book>> getBooks();

  /// Reads a chapter's markdown content from disk.
  Future<String> readChapter(Book book, String chapterId);

  /// Writes a chapter's markdown content and bumps the book's updatedAt.
  Future<void> writeChapter(Book book, String chapterId, String content);

  /// Creates a new book (folder + book.json + first empty chapter).
  Future<Book> createBook(String title);

  /// Renames a book (= renames its folder on disk + updates book.json title).
  Future<Book> renameBook(Book book, String newTitle);

  /// Deletes a book and all its chapters (recursive folder delete).
  Future<void> deleteBook(Book book);

  /// Creates a new empty chapter inside the book.
  Future<Book> createChapter(Book book, String title);

  /// Renames a chapter (= renames its .md file + updates book.json entry).
  Future<Book> renameChapter(Book book, String chapterId, String newTitle);

  /// Deletes a chapter (removes the .md + entry in book.json).
  Future<Book> deleteChapter(Book book, String chapterId);

  /// Reorders chapters within the same book (e.g. drag&drop).
  Future<Book> reorderChapters(Book book, List<String> newOrderIds);

  /// Moves a chapter from one book to another, optionally placing it inside
  /// a folder of the destination. Returns the updated [source, destination]
  /// pair.
  Future<(Book, Book)> moveChapter(
    Book source,
    String chapterId,
    Book destination, {
    String? destFolderId,
  });

  /// Assigns/clears the folder a chapter belongs to within its own book.
  Future<Book> setChapterFolder(
    Book book,
    String chapterId,
    String? folderId,
  );

  /// Creates a new (logical) folder inside the book.
  Future<(Book, Folder)> createFolder(Book book, String name);

  /// Renames a folder.
  Future<Book> renameFolder(Book book, String folderId, String newName);

  /// Deletes a folder. Its chapters are moved back to the book root (their
  /// files stay where they are — folders are purely organisational).
  Future<Book> deleteFolder(Book book, String folderId);
}
