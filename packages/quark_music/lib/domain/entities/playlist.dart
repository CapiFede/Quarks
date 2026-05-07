class Playlist {
  final String id;
  final String name;
  final List<String> trackPaths;

  /// `null` (and the special sentinel `__default__`) mean "no category".
  final String? categoryId;

  const Playlist({
    required this.id,
    required this.name,
    this.trackPaths = const [],
    this.categoryId,
  });

  static const allTracksId = '__all_tracks__';

  factory Playlist.allTracks() => const Playlist(
        id: allTracksId,
        name: 'All Tracks',
      );

  bool get isAllTracks => id == allTracksId;

  Playlist copyWith({
    String? name,
    List<String>? trackPaths,
    Object? categoryId = _sentinel,
  }) {
    return Playlist(
      id: id,
      name: name ?? this.name,
      trackPaths: trackPaths ?? this.trackPaths,
      categoryId: identical(categoryId, _sentinel)
          ? this.categoryId
          : categoryId as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'trackPaths': trackPaths,
        if (categoryId != null) 'categoryId': categoryId,
      };

  factory Playlist.fromJson(Map<String, dynamic> json) => Playlist(
        id: json['id'] as String,
        name: json['name'] as String,
        trackPaths: (json['trackPaths'] as List).cast<String>(),
        categoryId: json['categoryId'] as String?,
      );

  static String generateId() =>
      DateTime.now().millisecondsSinceEpoch.toRadixString(36);
}

const Object _sentinel = Object();
