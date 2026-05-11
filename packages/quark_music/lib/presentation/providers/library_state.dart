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
  // Only meaningful while All Tracks is selected; restricts the visible list
  // to tracks that aren't in any user playlist.
  final bool showUnassignedOnly;
  // Whether the All Tracks chip is forcibly kept in the chip bar. When no
  // categories exist the chip is always shown regardless; this flag covers
  // the "user opted in via the gear menu after categories existed" case.
  final bool allTracksChipPinned;

  const LibraryState({
    this.allTracks = const [],
    this.playlists = const [],
    this.categories = const [],
    this.selectedPlaylistId = Playlist.allTracksId,
    this.selectedCategoryId = PlaylistCategory.defaultId,
    this.isScanning = false,
    this.scannedFolder,
    this.showUnassignedOnly = false,
    this.allTracksChipPinned = false,
  });

  List<Track> get visibleTracks {
    if (selectedPlaylistId == Playlist.allTracksId) {
      if (!showUnassignedOnly) return allTracks;
      final assigned = <String>{};
      for (final p in playlists) {
        for (final path in p.trackPaths) {
          assigned.add(path.replaceAll('\\', '/'));
        }
      }
      return allTracks
          .where((t) => !assigned.contains(t.path.replaceAll('\\', '/')))
          .toList();
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
    bool? showUnassignedOnly,
    bool? allTracksChipPinned,
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
      showUnassignedOnly: showUnassignedOnly ?? this.showUnassignedOnly,
      allTracksChipPinned:
          allTracksChipPinned ?? this.allTracksChipPinned,
    );
  }
}
