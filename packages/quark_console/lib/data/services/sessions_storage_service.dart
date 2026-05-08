import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../domain/entities/shell_session.dart';

class SessionsStorageService {
  static const _dirName = 'console';
  static const _fileName = 'sessions.json';

  Future<Directory> _rootDir() async {
    if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
      return File(Platform.resolvedExecutable).parent;
    }
    return getApplicationDocumentsDirectory();
  }

  Future<File> _file() async {
    final root = await _rootDir();
    final dir = Directory(p.join(root.path, _dirName));
    if (!await dir.exists()) await dir.create(recursive: true);
    return File(p.join(dir.path, _fileName));
  }

  Future<List<ShellSession>> load() async {
    final file = await _file();
    if (!await file.exists()) return const [];
    try {
      final content = await file.readAsString();
      if (content.trim().isEmpty) return const [];
      final list = jsonDecode(content) as List<dynamic>;
      return list
          .map((e) => ShellSession.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> save(List<ShellSession> sessions) async {
    final file = await _file();
    final json = jsonEncode(sessions.map((s) => s.toJson()).toList());
    await file.writeAsString(json);
  }
}
