import 'dart:convert';

import 'package:quark_core/quark_core.dart';

import '../../domain/entities/book.dart';
import 'books_storage_service.dart';

const kBookTools = <ToolDefinition>[
  ToolDefinition(
    name: 'search_chapters',
    description:
        'Searches the active book\'s chapter titles and contents for a '
        'query string. Returns matching chapter ids, titles, and up to 3 '
        'short snippets per chapter (case-insensitive substring match).',
    inputSchema: {
      'type': 'object',
      'properties': {
        'query': {
          'type': 'string',
          'description': 'Substring to search for (case-insensitive).',
        },
      },
      'required': ['query'],
    },
  ),
  ToolDefinition(
    name: 'read_chapter',
    description:
        'Reads the full markdown content of a chapter by id. Use after '
        'search_chapters to fetch the complete text of a matching chapter.',
    inputSchema: {
      'type': 'object',
      'properties': {
        'chapter_id': {
          'type': 'string',
          'description': 'The chapter id returned by search_chapters.',
        },
      },
      'required': ['chapter_id'],
    },
  ),
];

class BookToolHandler {
  final Book book;
  final BooksStorageService storage;

  BookToolHandler({required this.book, required this.storage});

  Future<String> call(String name, Map<String, dynamic> args) async {
    switch (name) {
      case 'search_chapters':
        return _searchChapters(args['query'] as String? ?? '');
      case 'read_chapter':
        return _readChapter(args['chapter_id'] as String? ?? '');
      default:
        return jsonEncode({'error': 'Unknown tool: $name'});
    }
  }

  Future<String> _searchChapters(String query) async {
    final q = query.toLowerCase().trim();
    if (q.isEmpty) {
      return jsonEncode({'results': const <Map<String, dynamic>>[]});
    }
    final results = <Map<String, dynamic>>[];
    for (final ch in book.chapters) {
      final titleMatch = ch.title.toLowerCase().contains(q);
      final content = await storage.readChapter(book, ch.id);
      final lower = content.toLowerCase();
      final snippets = <String>[];
      var from = 0;
      while (snippets.length < 3) {
        final idx = lower.indexOf(q, from);
        if (idx < 0) break;
        final s = (idx - 60).clamp(0, content.length);
        final e = (idx + q.length + 60).clamp(0, content.length);
        snippets.add(content.substring(s, e).replaceAll('\n', ' '));
        from = idx + q.length;
      }
      if (titleMatch || snippets.isNotEmpty) {
        results.add({
          'chapter_id': ch.id,
          'title': ch.title,
          'snippets': snippets,
        });
        if (results.length >= 10) break;
      }
    }
    return jsonEncode({'results': results});
  }

  Future<String> _readChapter(String chapterId) async {
    final ch = book.chapters.where((c) => c.id == chapterId).firstOrNull;
    if (ch == null) {
      return jsonEncode({'error': 'Chapter not found: $chapterId'});
    }
    final content = await storage.readChapter(book, chapterId);
    return jsonEncode({
      'chapter_id': chapterId,
      'title': ch.title,
      'content': content,
    });
  }
}
