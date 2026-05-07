import 'dart:async';
import 'dart:collection';

import 'package:flutter/foundation.dart';

enum LogLevel { debug, info, warn, error }

class LogEntry {
  final DateTime timestamp;
  final LogLevel level;
  final String source;
  final String message;

  LogEntry({
    required this.timestamp,
    required this.level,
    required this.source,
    required this.message,
  });
}

/// In-memory, session-only log buffer shared across the app. Quarks call
/// `LogService.instance.info/warn/error(...)` and the Quark Console widget
/// listens to the stream to display them in real time.
class LogService {
  LogService._();
  static final LogService instance = LogService._();

  static const int _maxEntries = 1000;

  final Queue<LogEntry> _entries = Queue<LogEntry>();
  final StreamController<LogEntry> _controller =
      StreamController<LogEntry>.broadcast();

  Stream<LogEntry> get stream => _controller.stream;

  List<LogEntry> get entries => List.unmodifiable(_entries);

  void log(LogLevel level, String source, String message) {
    final entry = LogEntry(
      timestamp: DateTime.now(),
      level: level,
      source: source,
      message: message,
    );
    _entries.addLast(entry);
    while (_entries.length > _maxEntries) {
      _entries.removeFirst();
    }
    _controller.add(entry);
    if (kDebugMode) {
      debugPrint('[${entry.source}/${entry.level.name}] ${entry.message}');
    }
  }

  void debug(String source, String message) =>
      log(LogLevel.debug, source, message);
  void info(String source, String message) =>
      log(LogLevel.info, source, message);
  void warn(String source, String message) =>
      log(LogLevel.warn, source, message);
  void error(String source, String message) =>
      log(LogLevel.error, source, message);

  void clear() {
    _entries.clear();
    _controller.add(LogEntry(
      timestamp: DateTime.now(),
      level: LogLevel.info,
      source: 'log',
      message: '— logs cleared —',
    ));
  }
}
