class Category {
  final String id;
  final String name;
  final DateTime createdAt;

  const Category({
    required this.id,
    required this.name,
    required this.createdAt,
  });

  Category copyWith({String? name}) {
    return Category(
      id: id,
      name: name ?? this.name,
      createdAt: createdAt,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'createdAt': createdAt.toIso8601String(),
      };

  factory Category.fromJson(Map<String, dynamic> json) => Category(
        id: json['id'] as String,
        name: json['name'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  static String generateId() =>
      DateTime.now().millisecondsSinceEpoch.toRadixString(36);
}
