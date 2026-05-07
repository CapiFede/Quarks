class PlaylistCategory {
  final String id;
  final String name;
  final DateTime createdAt;

  const PlaylistCategory({
    required this.id,
    required this.name,
    required this.createdAt,
  });

  /// Special, immutable "default" category that holds playlists without an
  /// explicit assignment. Always present, never persisted.
  static const defaultId = '__default__';
  static const allTracksOnlyId = '__all_tracks_only__';

  factory PlaylistCategory.defaultCategory() => PlaylistCategory(
        id: defaultId,
        name: 'Sin categoría',
        createdAt: DateTime.fromMillisecondsSinceEpoch(0),
      );

  bool get isDefault => id == defaultId;

  PlaylistCategory copyWith({String? name}) => PlaylistCategory(
        id: id,
        name: name ?? this.name,
        createdAt: createdAt,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'createdAt': createdAt.toIso8601String(),
      };

  factory PlaylistCategory.fromJson(Map<String, dynamic> json) =>
      PlaylistCategory(
        id: json['id'] as String,
        name: json['name'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  static String generateId() =>
      DateTime.now().millisecondsSinceEpoch.toRadixString(36);
}
