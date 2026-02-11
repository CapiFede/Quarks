import 'track.dart';

class Playlist {
  final String name;
  final List<Track> tracks;

  const Playlist({
    required this.name,
    this.tracks = const [],
  });

  Playlist copyWith({String? name, List<Track>? tracks}) {
    return Playlist(
      name: name ?? this.name,
      tracks: tracks ?? this.tracks,
    );
  }
}
