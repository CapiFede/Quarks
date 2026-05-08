import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/services/playlist_storage_service.dart';
import '../../domain/entities/playlist.dart';
import '../../domain/entities/playlist_category.dart';
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
  StreamSubscription<FileSystemEvent>? _watcher;
  Timer? _watchDebounce;

  @override
  Future<LibraryState> build() async {
    _repo = ref.read(musicRepositoryProvider);
    _storage = ref.read(playlistStorageServiceProvider);

    final musicDir = await _storage.musicDirPath;
    final playlists = await _storage.load();
    final categories = await _storage.loadCategories();
    final tracks = await _repo.scanFolder(musicDir);

    _startWatcher(musicDir);
    ref.onDispose(_stopWatcher);

    return LibraryState(
      allTracks: tracks,
      playlists: playlists,
      categories: categories,
      scannedFolder: musicDir,
    );
  }

  /// Watch the music folder so songs added or removed externally (file
  /// explorer, drive sync, downloads from another tool) appear without the
  /// user having to hit a refresh button. Debounced to coalesce bursty events
  /// from things like multi-file copies or zip extraction.
  void _startWatcher(String musicDir) {
    if (!(Platform.isWindows || Platform.isMacOS || Platform.isLinux)) return;
    if (!FileSystemEntity.isWatchSupported) return;
    try {
      final dir = Directory(musicDir);
      _watcher = dir
          .watch(recursive: true, events: FileSystemEvent.all)
          .listen((_) {
        _watchDebounce?.cancel();
        _watchDebounce = Timer(const Duration(milliseconds: 800), () {
          // Skip if the notifier was disposed between debounce schedule
          // and fire — touching state then would throw.
          if (_watcher == null) return;
          rescanMusicFolder();
        });
      }, onError: (_) {});
    } catch (_) {
      // Watching is best-effort. If the platform/filesystem rejects the
      // request, we silently fall back to manual refresh on app restart.
    }
  }

  void _stopWatcher() {
    _watchDebounce?.cancel();
    _watchDebounce = null;
    _watcher?.cancel();
    _watcher = null;
  }

  Future<void> rescanMusicFolder() async {
    final current = state.valueOrNull;
    if (current == null || current.scannedFolder == null) return;
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
    // New playlists land in the currently-selected category so they appear
    // in the bar right away without an extra step.
    final initialCategoryId =
        current.selectedCategoryId == PlaylistCategory.defaultId
            ? null
            : current.selectedCategoryId;
    final playlist = Playlist(
      id: Playlist.generateId(),
      name: name,
      categoryId: initialCategoryId,
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

  void selectCategory(String categoryId) {
    final current = state.requireValue;
    state = AsyncData(current.copyWith(selectedCategoryId: categoryId));
  }

  Future<void> createCategory(String name) async {
    final current = state.requireValue;
    final category = PlaylistCategory(
      id: PlaylistCategory.generateId(),
      name: name,
      createdAt: DateTime.now(),
    );
    state = AsyncData(
      current.copyWith(categories: [...current.categories, category]),
    );
    await _storage.saveCategories(state.requireValue.categories);
  }

  Future<void> renameCategory(String id, String newName) async {
    final current = state.requireValue;
    final updated = current.categories
        .map((c) => c.id == id ? c.copyWith(name: newName) : c)
        .toList();
    state = AsyncData(current.copyWith(categories: updated));
    await _storage.saveCategories(updated);
  }

  Future<void> deleteCategory(String id) async {
    final current = state.requireValue;
    final updatedCategories =
        current.categories.where((c) => c.id != id).toList();
    final updatedPlaylists = current.playlists
        .map((p) =>
            p.categoryId == id ? p.copyWith(categoryId: null) : p)
        .toList();
    final newSelected = current.selectedCategoryId == id
        ? PlaylistCategory.defaultId
        : current.selectedCategoryId;
    state = AsyncData(current.copyWith(
      categories: updatedCategories,
      playlists: updatedPlaylists,
      selectedCategoryId: newSelected,
    ));
    await _storage.saveCategories(updatedCategories);
    await _persist();
  }

  Future<void> assignPlaylistToCategory(
      String playlistId, String? categoryId) async {
    final normalized =
        categoryId == PlaylistCategory.defaultId ? null : categoryId;
    final current = state.requireValue;
    final updated = current.playlists
        .map((p) =>
            p.id == playlistId ? p.copyWith(categoryId: normalized) : p)
        .toList();
    state = AsyncData(current.copyWith(playlists: updated));
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

  Future<void> renameTrackFile(String oldPath, String newName) async {
    final normalized = oldPath.replaceAll('\\', '/');
    final lastSlash = normalized.lastIndexOf('/');
    final dir = lastSlash >= 0 ? normalized.substring(0, lastSlash) : '';
    final oldFileName = normalized.substring(lastSlash + 1);
    final extMatch = RegExp(r'\.[^.]+$').firstMatch(oldFileName);
    final ext = extMatch?.group(0) ?? '';
    final sanitized = newName.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_').trim();
    if (sanitized.isEmpty) return;
    final newFileName = '$sanitized$ext';
    final newPath = dir.isEmpty ? newFileName : '$dir/$newFileName';
    if (newPath == normalized) return;

    try {
      final file = File(oldPath);
      if (await file.exists()) {
        await file.rename(newPath);
      }
    } catch (_) {
      return;
    }
    await updateTrackPath(oldPath, newPath);
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
