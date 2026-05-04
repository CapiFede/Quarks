import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../domain/entities/event.dart';

class CalendarStorageService {
  static const _calendarDirName = 'Calendar';
  static const _eventsFileName = 'events.json';

  Future<Directory> _rootDir() async {
    if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
      return File(Platform.resolvedExecutable).parent;
    }
    return getApplicationDocumentsDirectory();
  }

  Future<Directory> get _calendarDir async {
    final root = await _rootDir();
    final dir = Directory(p.join(root.path, _calendarDirName));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  Future<File> get _eventsFile async {
    final dir = await _calendarDir;
    return File(p.join(dir.path, _eventsFileName));
  }

  Future<List<Event>> loadEvents() async {
    final file = await _eventsFile;
    if (!await file.exists()) return [];
    try {
      final content = await file.readAsString();
      if (content.trim().isEmpty) return [];
      final list = jsonDecode(content) as List<dynamic>;
      return list
          .cast<Map<String, dynamic>>()
          .map(Event.fromJson)
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> saveEvents(List<Event> events) async {
    final file = await _eventsFile;
    await file.writeAsString(
      jsonEncode(events.map((e) => e.toJson()).toList()),
    );
  }
}
