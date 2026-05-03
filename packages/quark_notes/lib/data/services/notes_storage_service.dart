import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../domain/entities/category.dart';
import '../../domain/entities/note.dart';

class NotesStorageService {
  static const _notesDirName = 'Notes';
  static const _categoriesFileName = 'categories.json';

  Future<Directory> _rootDir() async {
    if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
      return File(Platform.resolvedExecutable).parent;
    }
    return getApplicationDocumentsDirectory();
  }

  Future<Directory> get _notesDir async {
    final root = await _rootDir();
    final dir = Directory(p.join(root.path, _notesDirName));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  /// Sanitizes a note name into a safe filename (without extension).
  static String _safeFilename(String name) {
    final sanitized = name
        .replaceAll(RegExp(r'[<>:"/\\|?*\x00-\x1F]'), '_')
        .trim();
    if (sanitized.isEmpty) return 'nota';
    return sanitized.length > 100 ? sanitized.substring(0, 100) : sanitized;
  }

  /// Returns the file that currently stores a given note id.
  Future<File?> _findNoteFile(Directory dir, String id) async {
    final entities = await dir.list().toList();
    for (final entity in entities) {
      if (entity is! File) continue;
      if (!entity.path.endsWith('.json')) continue;
      if (p.basename(entity.path) == _categoriesFileName) continue;
      try {
        final content = await entity.readAsString();
        final json = jsonDecode(content) as Map<String, dynamic>;
        if (json['id'] == id) return entity;
      } catch (_) {
        // Skip malformed files.
      }
    }
    return null;
  }

  Future<List<Note>> loadNotes() async {
    final dir = await _notesDir;
    final entities = await dir.list().toList();
    final notes = <Note>[];
    for (final entity in entities) {
      if (entity is! File) continue;
      if (!entity.path.endsWith('.json')) continue;
      if (p.basename(entity.path) == _categoriesFileName) continue;
      try {
        final content = await entity.readAsString();
        final json = jsonDecode(content) as Map<String, dynamic>;
        notes.add(Note.fromJson(json));
      } catch (_) {
        // Skip malformed files.
      }
    }
    return notes;
  }

  Future<void> saveNote(Note note) async {
    final dir = await _notesDir;
    final targetName = _safeFilename(
      note.name != null && note.name!.isNotEmpty ? note.name! : note.id,
    );
    final targetFile = File(p.join(dir.path, '$targetName.json'));

    // If the note exists under a different filename, delete the old one.
    final existing = await _findNoteFile(dir, note.id);
    if (existing != null && existing.path != targetFile.path) {
      await existing.delete();
    }

    await targetFile.writeAsString(jsonEncode(note.toJson()));
  }

  Future<void> deleteNote(String id) async {
    final dir = await _notesDir;
    final file = await _findNoteFile(dir, id);
    if (file != null && await file.exists()) {
      await file.delete();
    }
  }

  Future<List<Category>> loadCategories() async {
    final dir = await _notesDir;
    final file = File(p.join(dir.path, _categoriesFileName));
    if (!await file.exists()) return [];
    final content = await file.readAsString();
    final list = jsonDecode(content) as List<dynamic>;
    return list
        .cast<Map<String, dynamic>>()
        .map(Category.fromJson)
        .toList();
  }

  Future<void> saveCategories(List<Category> categories) async {
    final dir = await _notesDir;
    final file = File(p.join(dir.path, _categoriesFileName));
    await file.writeAsString(
        jsonEncode(categories.map((c) => c.toJson()).toList()));
  }
}
