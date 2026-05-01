import 'dart:io';

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

    final musicDir = await _storage.musicDirPath;
    final playlists = await _storage.load();
    final tracks = await _repo.scanFolder(musicDir);

    return LibraryState(
      allTracks: tracks,
      playlists: playlists,
      scannedFolder: musicDir,
    );
  }

  Future<void> rescanMusicFolder() async {
    final current = state.requireValue;
    state = AsyncData(current.copyWith(isScanning: true));

    final tracks = await _repo.scanFolder(current.scannedFolder!);
    state = AsyncData(
      state.requireValue.copyWith(allTracks: tracks, isScanning: false),
    );
  }

  Future<void> openMusicFolder() async {
    final musicDir = await _storage.musicDirPath;
    if (Platform.isWindows) {
      await Process.run('explorer', [musicDir.replaceAll('/', '\\')]);
    } else if (Platform.isMacOS) {
      await Process.run('open', [musicDir]);
    } else if (Platform.isLinux) {
      await Process.run('xdg-open', [musicDir]);
    }
    // Android/iOS: no user-facing file manager hook; skip silently.
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


  Future<void> deleteTrack(String path) async {
    final current = state.requireValue;
    final newTracks = current.allTracks.where((t) => t.path != path).toList();
    final newPlaylists = current.playlists.map((p) {
      if (p.trackPaths.contains(path)) {
        return p.copyWith(
          trackPaths: p.trackPaths.where((t) => t != path).toList(),
        );
      }
      return p;
    }).toList();
    state = AsyncData(current.copyWith(allTracks: newTracks, playlists: newPlaylists));
    await _persist();
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();
    } catch (_) {}
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
    await _storage.save(state.requireValue.playlists);
  }
}
