import '../../domain/entities/playlist.dart';
import '../../domain/entities/playlist_category.dart';
import '../../domain/entities/track.dart';

const Object _sentinel = Object();

class LibraryState {
  final List<Track> allTracks;
  final List<Playlist> playlists;
  final List<PlaylistCategory> categories;
  final String selectedPlaylistId;
  final String selectedCategoryId;
  final bool isScanning;
  final String? scannedFolder;

  const LibraryState({
    this.allTracks = const [],
    this.playlists = const [],
    this.categories = const [],
    this.selectedPlaylistId = Playlist.allTracksId,
    this.selectedCategoryId = PlaylistCategory.defaultId,
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

    final pathSet = playlist.trackPaths
        .map((p) => p.replaceAll('\\', '/'))
        .toSet();
    return allTracks
        .where((t) => pathSet.contains(t.path.replaceAll('\\', '/')))
        .toList();
  }

  Playlist? get selectedPlaylist =>
      playlists.where((p) => p.id == selectedPlaylistId).firstOrNull;

  /// Playlists that belong to the currently-selected category. Playlists with
  /// `categoryId == null` are treated as belonging to the default category.
  List<Playlist> get playlistsInSelectedCategory {
    if (selectedCategoryId == PlaylistCategory.defaultId) {
      return playlists.where((p) => p.categoryId == null).toList();
    }
    return playlists.where((p) => p.categoryId == selectedCategoryId).toList();
  }

  LibraryState copyWith({
    List<Track>? allTracks,
    List<Playlist>? playlists,
    List<PlaylistCategory>? categories,
    String? selectedPlaylistId,
    String? selectedCategoryId,
    bool? isScanning,
    Object? scannedFolder = _sentinel,
  }) {
    return LibraryState(
      allTracks: allTracks ?? this.allTracks,
      playlists: playlists ?? this.playlists,
      categories: categories ?? this.categories,
      selectedPlaylistId: selectedPlaylistId ?? this.selectedPlaylistId,
      selectedCategoryId: selectedCategoryId ?? this.selectedCategoryId,
      isScanning: isScanning ?? this.isScanning,
      scannedFolder: identical(scannedFolder, _sentinel)
          ? this.scannedFolder
          : scannedFolder as String?,
    );
  }
}
