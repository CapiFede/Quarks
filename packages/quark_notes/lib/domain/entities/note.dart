class Note {
  final String id;
  final String? name;
  final String content; // Quill delta JSON string
  final int colorValue;
  final String? categoryId;
  final DateTime createdAt;

  const Note({
    required this.id,
    this.name,
    this.content = '[]',
    required this.colorValue,
    this.categoryId,
    required this.createdAt,
  });

  Note copyWith({
    String? id,
    Object? name = _sentinel,
    String? content,
    int? colorValue,
    Object? categoryId = _sentinel,
    DateTime? createdAt,
  }) {
    return Note(
      id: id ?? this.id,
      name: name == _sentinel ? this.name : name as String?,
      content: content ?? this.content,
      colorValue: colorValue ?? this.colorValue,
      categoryId: categoryId == _sentinel ? this.categoryId : categoryId as String?,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'content': content,
        'colorValue': colorValue,
        'categoryId': categoryId,
        'createdAt': createdAt.toIso8601String(),
      };

  factory Note.fromJson(Map<String, dynamic> json) => Note(
        id: json['id'] as String,
        name: json['name'] as String?,
        content: json['content'] as String? ?? '[]',
        colorValue: json['colorValue'] as int,
        categoryId: json['categoryId'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  static String generateId() =>
      DateTime.now().millisecondsSinceEpoch.toRadixString(36);
}

const _sentinel = Object();
