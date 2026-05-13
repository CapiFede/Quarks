class Chapter {
  final String id;
  final String title;
  final String file;
  // null = chapter lives at the book root; non-null = inside that folder.
  // Folders are an organisational concept only; chapter files stay flat in
  // the book's directory regardless of folder membership.
  final String? folderId;

  const Chapter({
    required this.id,
    required this.title,
    required this.file,
    this.folderId,
  });

  Chapter copyWith({
    String? title,
    String? file,
    Object? folderId = _sentinel,
  }) {
    return Chapter(
      id: id,
      title: title ?? this.title,
      file: file ?? this.file,
      folderId: identical(folderId, _sentinel)
          ? this.folderId
          : folderId as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'file': file,
        if (folderId != null) 'folderId': folderId,
      };

  factory Chapter.fromJson(Map<String, dynamic> json) => Chapter(
        id: json['id'] as String,
        title: json['title'] as String,
        file: json['file'] as String,
        folderId: json['folderId'] as String?,
      );

  static String generateId() =>
      DateTime.now().microsecondsSinceEpoch.toRadixString(36);
}

const Object _sentinel = Object();
