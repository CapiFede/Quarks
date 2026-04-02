import 'dart:convert';
import 'dart:io';

import '../../domain/entities/playlist.dart';

class PlaylistStorageService {
  static const _musicDirName = 'music';
  static const _playlistsDirName = 'playlists';

  Future<String> get musicDirPath async {
    final exeDir = File(Platform.resolvedExecutable).parent;
    final dir = Directory('${exeDir.path}\\$_musicDirName');
    if (!await dir.exists()) await dir.create();
    return dir.path;
  }

  Future<Directory> get _playlistsDir async {
    final exeDir = File(Platform.resolvedExecutable).parent;
    final dir = Directory('${exeDir.path}/$_playlistsDirName');
    if (!await dir.exists()) await dir.create();
    return dir;
  }

  Future<List<Playlist>> load() async {
    final musicDir = await musicDirPath;
    final normalizedDir = musicDir.replaceAll('\\', '/');
    final dir = await _playlistsDir;

    final files = await dir
        .list()
        .where((e) => e is File && e.path.endsWith('.json'))
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

      await File('${dir.path}/$filename').writeAsString(jsonEncode({
        'id': playlist.id,
        'name': playlist.name,
        'trackPaths': relativePaths,
      }));
    }

    // Delete files for playlists that no longer exist
    final existingFiles = await dir
        .list()
        .where((e) => e is File && e.path.endsWith('.json'))
        .cast<File>()
        .toList();
    for (final file in existingFiles) {
      final filename = file.path.split(RegExp(r'[/\\]')).last;
      if (!expectedFilenames.contains(filename)) {
        await file.delete();
      }
    }
  }

  String _sanitizeFilename(String name) {
    return name.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_').trim();
  }
}
