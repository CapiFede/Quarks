import 'chapter.dart';
import 'folder.dart';

class Book {
  static const int currentSchemaVersion = 2;

  final String id;
  final String title;
  final String author;
  final List<Chapter> chapters;
  final List<Folder> folders;
  final DateTime createdAt;
  final DateTime updatedAt;
  // Folder name on disk (relative to Books/). Source of truth for locating
  // chapter files; renames go through the repository to keep this in sync.
  final String folderName;

  const Book({
    required this.id,
    required this.title,
    this.author = '',
    this.chapters = const [],
    this.folders = const [],
    required this.createdAt,
    required this.updatedAt,
    required this.folderName,
  });

  Book copyWith({
    String? title,
    String? author,
    List<Chapter>? chapters,
    List<Folder>? folders,
    DateTime? updatedAt,
    String? folderName,
  }) {
    return Book(
      id: id,
      title: title ?? this.title,
      author: author ?? this.author,
      chapters: chapters ?? this.chapters,
      folders: folders ?? this.folders,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      folderName: folderName ?? this.folderName,
    );
  }

  Map<String, dynamic> toJson() => {
        'version': currentSchemaVersion,
        'id': id,
        'title': title,
        'author': author,
        'chapters': chapters.map((c) => c.toJson()).toList(),
        'folders': folders.map((f) => f.toJson()).toList(),
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  factory Book.fromJson(
    Map<String, dynamic> json, {
    required String folderName,
  }) {
    return Book(
      id: json['id'] as String,
      title: json['title'] as String? ?? folderName,
      author: json['author'] as String? ?? '',
      chapters: (json['chapters'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>()
          .map(Chapter.fromJson)
          .toList(),
      folders: (json['folders'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>()
          .map(Folder.fromJson)
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      folderName: folderName,
    );
  }

  static String generateId() =>
      DateTime.now().microsecondsSinceEpoch.toRadixString(36);
}
