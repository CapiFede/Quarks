import 'dart:convert';
import 'dart:io';

import '../../domain/entities/playlist.dart';

class PlaylistStorageService {
  static const _fileName = 'quark_music_data.json';

  Future<File> get _file async {
    final exeDir = File(Platform.resolvedExecutable).parent;
    return File('${exeDir.path}/$_fileName');
  }

  Future<({List<Playlist> playlists, String? lastFolder})> load() async {
    final file = await _file;
    if (!await file.exists()) {
      return (playlists: <Playlist>[], lastFolder: null);
    }

    final content = await file.readAsString();
    final json = jsonDecode(content) as Map<String, dynamic>;
    final playlists = (json['playlists'] as List?)
            ?.map((e) => Playlist.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    final lastFolder = json['lastFolder'] as String?;

    return (playlists: playlists, lastFolder: lastFolder);
  }

  Future<void> save(List<Playlist> playlists, String? lastFolder) async {
    final file = await _file;
    final json = {
      'lastFolder': lastFolder,
      'playlists': playlists.map((p) => p.toJson()).toList(),
    };
    await file.writeAsString(jsonEncode(json));
  }
}
