import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/services/playlist_storage_service.dart';
import '../../domain/entities/playlist.dart';
import '../../domain/entities/track.dart';
import '../../domain/repositories/music_repository.dart';
import 'library_state.dart';
import 'music_providers.dart';

final playlistStorageServiceProvider = Provider<PlaylistStorageService>((ref) {
  return PlaylistStorageService();
});

final libraryProvider =
    AsyncNotifierProvider<LibraryNotifier, LibraryState>(LibraryNotifier.new);

final searchQueryProvider = StateProvider<String>((ref) => '');

final visibleTracksProvider = Provider<List<Track>>((ref) {
  final library = ref.watch(libraryProvider);
  final query = ref.watch(searchQueryProvider).toLowerCase();
  final tracks = library.valueOrNull?.visibleTracks ?? [];
  if (query.isEmpty) return tracks;
  return tracks.where((t) => t.title.toLowerCase().contains(query)).toList();
});

class LibraryNotifier extends AsyncNotifier<LibraryState> {
  late final MusicRepository _repo;
  late final PlaylistStorageService _storage;

  @override
  Future<LibraryState> build() async {
    _repo = ref.read(musicRepositoryProvider);
    _storage = ref.read(playlistStorageServiceProvider);

    final data = await _storage.load();
    List<Track> tracks = [];
    if (data.lastFolder != null) {
      tracks = await _repo.scanFolder(data.lastFolder!);
    }

    return LibraryState(
      allTracks: tracks,
      playlists: data.playlists,
      scannedFolder: data.lastFolder,
    );
  }

  Future<void> pickAndScanFolder() async {
    final result = await FilePicker.platform.getDirectoryPath();
    if (result == null) return;

    final current = state.requireValue;
    state = AsyncData(current.copyWith(isScanning: true, scannedFolder: result));

    final tracks = await _repo.scanFolder(result);
    state = AsyncData(
      state.requireValue.copyWith(allTracks: tracks, isScanning: false),
    );
    await _persist();
  }

  void selectPlaylist(String id) {
    final current = state.requireValue;
    state = AsyncData(current.copyWith(selectedPlaylistId: id));
  }

  Future<void> createPlaylist(String name) async {
    final current = state.requireValue;
    final playlist = Playlist(
      id: Playlist.generateId(),
      name: name,
    );
    state = AsyncData(
      current.copyWith(playlists: [...current.playlists, playlist]),
    );
    await _persist();
  }

  Future<void> deletePlaylist(String id) async {
    final current = state.requireValue;
    final newPlaylists = current.playlists.where((p) => p.id != id).toList();
    final newSelectedId = current.selectedPlaylistId == id
        ? Playlist.allTracksId
        : current.selectedPlaylistId;
    state = AsyncData(
      current.copyWith(playlists: newPlaylists, selectedPlaylistId: newSelectedId),
    );
    await _persist();
  }

  Future<void> renamePlaylist(String id, String newName) async {
    final current = state.requireValue;
    final newPlaylists = current.playlists.map((p) {
      if (p.id == id) return p.copyWith(name: newName);
      return p;
    }).toList();
    state = AsyncData(current.copyWith(playlists: newPlaylists));
    await _persist();
  }

  Future<void> addTrackToPlaylist(String playlistId, Track track) async {
    final current = state.requireValue;
    final newPlaylists = current.playlists.map((p) {
      if (p.id == playlistId && !p.trackPaths.contains(track.path)) {
        return p.copyWith(trackPaths: [...p.trackPaths, track.path]);
      }
      return p;
    }).toList();
    state = AsyncData(current.copyWith(playlists: newPlaylists));
    await _persist();
  }

  Future<void> removeTrackFromPlaylist(String playlistId, String path) async {
    final current = state.requireValue;
    final newPlaylists = current.playlists.map((p) {
      if (p.id == playlistId) {
        return p.copyWith(
          trackPaths: p.trackPaths.where((t) => t != path).toList(),
        );
      }
      return p;
    }).toList();
    state = AsyncData(current.copyWith(playlists: newPlaylists));
    await _persist();
  }

  Future<void> rescanFolder() async {
    final current = state.requireValue;
    if (current.scannedFolder == null) return;

    state = AsyncData(current.copyWith(isScanning: true));
    final tracks = await _repo.scanFolder(current.scannedFolder!);
    state = AsyncData(
      state.requireValue.copyWith(allTracks: tracks, isScanning: false),
    );
  }

  Future<void> updateTrackPath(String oldPath, String newPath) async {
    final current = state.requireValue;
    final newTracks = current.allTracks.map((t) {
      if (t.path == oldPath) return Track.fromPath(newPath);
      return t;
    }).toList();
    final newPlaylists = current.playlists.map((p) {
      if (p.trackPaths.contains(oldPath)) {
        return p.copyWith(
          trackPaths: p.trackPaths.map((t) => t == oldPath ? newPath : t).toList(),
        );
      }
      return p;
    }).toList();
    state = AsyncData(current.copyWith(allTracks: newTracks, playlists: newPlaylists));
    await _persist();
  }

  Future<void> addTracksToPlaylist(String playlistId, List<String> trackPaths) async {
    final current = state.requireValue;
    final newPlaylists = current.playlists.map((p) {
      if (p.id == playlistId) {
        final existing = p.trackPaths.toSet();
        final toAdd = trackPaths.where((t) => !existing.contains(t)).toList();
        return p.copyWith(trackPaths: [...p.trackPaths, ...toAdd]);
      }
      return p;
    }).toList();
    state = AsyncData(current.copyWith(playlists: newPlaylists));
    await _persist();
  }

  Future<void> _persist() async {
    final s = state.requireValue;
    await _storage.save(s.playlists, s.scannedFolder);
  }
}
