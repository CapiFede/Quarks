class Playlist {
  final String id;
  final String name;
  final List<String> trackPaths;

  const Playlist({
    required this.id,
    required this.name,
    this.trackPaths = const [],
  });

  static const allTracksId = '__all_tracks__';

  factory Playlist.allTracks() => const Playlist(
        id: allTracksId,
        name: 'All Tracks',
      );

  bool get isAllTracks => id == allTracksId;

  Playlist copyWith({String? name, List<String>? trackPaths}) {
    return Playlist(
      id: id,
      name: name ?? this.name,
      trackPaths: trackPaths ?? this.trackPaths,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'trackPaths': trackPaths,
      };

  factory Playlist.fromJson(Map<String, dynamic> json) => Playlist(
        id: json['id'] as String,
        name: json['name'] as String,
        trackPaths: (json['trackPaths'] as List).cast<String>(),
      );

  static String generateId() =>
      DateTime.now().millisecondsSinceEpoch.toRadixString(36);
}
