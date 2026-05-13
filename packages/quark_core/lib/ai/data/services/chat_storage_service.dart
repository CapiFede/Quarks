import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../domain/conversation.dart';

/// Persists conversations globally (cross-Quark) next to the executable on
/// desktop, in `getApplicationDocumentsDirectory()` on mobile.
///
/// Layout:
///   `<root>/quarks_chats/index.json`  — list of ConversationSummary
///   `<root>/quarks_chats/<id>.json`   — full Conversation (lazy-loaded)
class ChatStorageService {
  static const _rootName = 'quarks_chats';
  static const _indexFile = 'index.json';

  Future<Directory> _rootDir() async {
    if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
      return File(Platform.resolvedExecutable).parent;
    }
    return getApplicationDocumentsDirectory();
  }

  Future<Directory> get _chatsDir async {
    final root = await _rootDir();
    final dir = Directory(p.join(root.path, _rootName));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  Future<File> _conversationFile(String id) async {
    final dir = await _chatsDir;
    return File(p.join(dir.path, '$id.json'));
  }

  Future<File> _indexFileHandle() async {
    final dir = await _chatsDir;
    return File(p.join(dir.path, _indexFile));
  }

  /// Reads the index. If missing or corrupt, rebuilds it from any
  /// `<id>.json` files in the folder — mirrors the reconciliation pattern
  /// `BooksStorageService.loadBook` uses for orphan .md files.
  Future<List<ConversationSummary>> listSummaries() async {
    final indexFile = await _indexFileHandle();
    if (await indexFile.exists()) {
      try {
        final raw = await indexFile.readAsString();
        final list = jsonDecode(raw) as List;
        final summaries = list
            .map((j) =>
                ConversationSummary.fromJson(Map<String, dynamic>.from(j as Map)))
            .toList();
        summaries.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
        return summaries;
      } catch (_) {
        // Fall through to rebuild from disk.
      }
    }

    return _rebuildIndexFromDisk();
  }

  Future<List<ConversationSummary>> _rebuildIndexFromDisk() async {
    final dir = await _chatsDir;
    final summaries = <ConversationSummary>[];
    await for (final entity in dir.list()) {
      if (entity is! File) continue;
      final name = p.basename(entity.path);
      if (name == _indexFile) continue;
      if (!name.endsWith('.json')) continue;
      try {
        final raw = await entity.readAsString();
        final json = jsonDecode(raw) as Map<String, dynamic>;
        final conv = Conversation.fromJson(json);
        summaries.add(ConversationSummary.fromConversation(conv));
      } catch (_) {
        // Skip corrupt files.
      }
    }
    summaries.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    await _writeIndex(summaries);
    return summaries;
  }

  Future<Conversation?> loadConversation(String id) async {
    final file = await _conversationFile(id);
    if (!await file.exists()) return null;
    try {
      final raw = await file.readAsString();
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return Conversation.fromJson(json);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveConversation(Conversation conv) async {
    final file = await _conversationFile(conv.id);
    final tmp = File('${file.path}.tmp');
    await tmp.writeAsString(jsonEncode(conv.toJson()));
    if (await file.exists()) await file.delete();
    await tmp.rename(file.path);
    await _upsertSummary(ConversationSummary.fromConversation(conv));
  }

  Future<void> deleteConversation(String id) async {
    final file = await _conversationFile(id);
    if (await file.exists()) await file.delete();
    final summaries = await listSummaries();
    summaries.removeWhere((s) => s.id == id);
    await _writeIndex(summaries);
  }

  Future<void> _upsertSummary(ConversationSummary summary) async {
    final summaries = await listSummaries();
    final idx = summaries.indexWhere((s) => s.id == summary.id);
    if (idx >= 0) {
      summaries[idx] = summary;
    } else {
      summaries.insert(0, summary);
    }
    summaries.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    await _writeIndex(summaries);
  }

  Future<void> _writeIndex(List<ConversationSummary> summaries) async {
    final indexFile = await _indexFileHandle();
    final tmp = File('${indexFile.path}.tmp');
    await tmp.writeAsString(jsonEncode(summaries.map((s) => s.toJson()).toList()));
    if (await indexFile.exists()) await indexFile.delete();
    await tmp.rename(indexFile.path);
  }
}
