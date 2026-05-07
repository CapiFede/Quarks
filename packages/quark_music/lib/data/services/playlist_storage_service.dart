import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../domain/entities/playlist.dart';
import '../../domain/entities/playlist_category.dart';

class PlaylistStorageService {
  static const _musicDirName = 'music';
  static const _playlistsDirName = 'playlists';
  static const _categoriesFileName = 'categories.json';

  Future<Directory> _rootDir() async {
    // Desktop: keep sibling folders next to the exe so portable installs work.
    // Mobile: the exe-dir concept doesn't exist, use the app documents directory.
    if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
      return File(Platform.resolvedExecutable).parent;
    }
    return getApplicationDocumentsDirectory();
  }

  Future<String> get musicDirPath async {
    final root = await _rootDir();
    final dir = Directory(p.join(root.path, _musicDirName));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir.path;
  }

  Future<String> get playlistsDirPath async {
    final dir = await _playlistsDir;
    return dir.path;
  }

  Future<Directory> get _playlistsDir async {
    final root = await _rootDir();
    final dir = Directory(p.join(root.path, _playlistsDirName));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  Future<List<Playlist>> load() async {
    final musicDir = await musicDirPath;
    final normalizedDir = musicDir.replaceAll('\\', '/');
    final dir = await _playlistsDir;

    final files = await dir
        .list()
        .where((e) =>
            e is File &&
            e.path.endsWith('.json') &&
            p.basename(e.path) != _categoriesFileName)
        .cast<File>()
        .toList();

    final playlists = <Playlist>[];
    for (final file in files) {
      final content = await file.readAsString();
      final json = jsonDecode(content) as Map<String, dynamic>;
      final playlist = Playlist.fromJson(json);
      playlists.add(playlist.copyWith(
        trackPaths:
            playlist.trackPaths.map((rel) => '$normalizedDir/$rel').toList(),
      ));
    }
    return playlists;
  }

  Future<void> save(List<Playlist> playlists) async {
    final musicDir = await musicDirPath;
    final normalizedDir = musicDir.replaceAll('\\', '/');
    final dir = await _playlistsDir;

    final expectedFilenames = <String>{};

    for (final playlist in playlists) {
      final filename = '${_sanitizeFilename(playlist.name)}.json';
      expectedFilenames.add(filename);

      final relativePaths = playlist.trackPaths.map((absolute) {
        final normalized = absolute.replaceAll('\\', '/');
        if (normalized.startsWith(normalizedDir)) {
          return normalized
              .substring(normalizedDir.length)
              .replaceFirst(RegExp(r'^/'), '');
        }
        return absolute;
      }).toList();

      await File(p.join(dir.path, filename)).writeAsString(jsonEncode({
        'id': playlist.id,
        'name': playlist.name,
        'trackPaths': relativePaths,
        if (playlist.categoryId != null) 'categoryId': playlist.categoryId,
      }));
    }

    // Delete files for playlists that no longer exist. The shared
    // categories.json lives in the same directory, so don't touch it here.
    final existingFiles = await dir
        .list()
        .where((e) => e is File && e.path.endsWith('.json'))
        .cast<File>()
        .toList();
    for (final file in existingFiles) {
      final filename = p.basename(file.path);
      if (filename == _categoriesFileName) continue;
      if (!expectedFilenames.contains(filename)) {
        await file.delete();
      }
    }
  }

  Future<List<PlaylistCategory>> loadCategories() async {
    final dir = await _playlistsDir;
    final file = File(p.join(dir.path, _categoriesFileName));
    if (!await file.exists()) return [];
    try {
      final content = await file.readAsString();
      final decoded = jsonDecode(content) as List;
      return decoded
          .map((e) => PlaylistCategory.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> saveCategories(List<PlaylistCategory> categories) async {
    final dir = await _playlistsDir;
    final file = File(p.join(dir.path, _categoriesFileName));
    await file.writeAsString(
        jsonEncode(categories.map((c) => c.toJson()).toList()));
  }

  String _sanitizeFilename(String name) {
    return name.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_').trim();
  }
}
