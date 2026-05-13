class Folder {
  final String id;
  final String name;

  const Folder({required this.id, required this.name});

  Folder copyWith({String? name}) =>
      Folder(id: id, name: name ?? this.name);

  Map<String, dynamic> toJson() => {'id': id, 'name': name};

  factory Folder.fromJson(Map<String, dynamic> json) => Folder(
        id: json['id'] as String,
        name: json['name'] as String,
      );

  static String generateId() =>
      'f${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}';
}
