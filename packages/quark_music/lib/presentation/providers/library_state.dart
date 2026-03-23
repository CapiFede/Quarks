import '../../domain/entities/playlist.dart';
import '../../domain/entities/track.dart';

class LibraryState {
  final List<Track> allTracks;
  final List<Playlist> playlists;
  final String selectedPlaylistId;
  final bool isScanning;
  final String? scannedFolder;

  const LibraryState({
    this.allTracks = const [],
    this.playlists = const [],
    this.selectedPlaylistId = Playlist.allTracksId,
    this.isScanning = false,
    this.scannedFolder,
  });

  List<Track> get visibleTracks {
    if (selectedPlaylistId == Playlist.allTracksId) {
      return allTracks;
    }
    final playlist = playlists
        .where((p) => p.id == selectedPlaylistId)
        .firstOrNull;
    if (playlist == null) return allTracks;

    final pathSet = playlist.trackPaths.toSet();
    return allTracks.where((t) => pathSet.contains(t.path)).toList();
  }

  Playlist? get selectedPlaylist =>
      playlists.where((p) => p.id == selectedPlaylistId).firstOrNull;

  LibraryState copyWith({
    List<Track>? allTracks,
    List<Playlist>? playlists,
    String? selectedPlaylistId,
    bool? isScanning,
    String? scannedFolder,
  }) {
    return LibraryState(
      allTracks: allTracks ?? this.allTracks,
      playlists: playlists ?? this.playlists,
      selectedPlaylistId: selectedPlaylistId ?? this.selectedPlaylistId,
      isScanning: isScanning ?? this.isScanning,
      scannedFolder: scannedFolder ?? this.scannedFolder,
    );
  }
}
