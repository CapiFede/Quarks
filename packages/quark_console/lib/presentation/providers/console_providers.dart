import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

class ConsoleState {
  final List<LogEntry> entries;
  final bool paused;
  final Set<LogLevel> visibleLevels;

  const ConsoleState({
    this.entries = const [],
    this.paused = false,
    this.visibleLevels = const {
      LogLevel.debug,
      LogLevel.info,
      LogLevel.warn,
      LogLevel.error,
    },
  });

  ConsoleState copyWith({
    List<LogEntry>? entries,
    bool? paused,
    Set<LogLevel>? visibleLevels,
  }) {
    return ConsoleState(
      entries: entries ?? this.entries,
      paused: paused ?? this.paused,
      visibleLevels: visibleLevels ?? this.visibleLevels,
    );
  }

  List<LogEntry> get filteredEntries =>
      entries.where((e) => visibleLevels.contains(e.level)).toList();
}

final consoleProvider =
    NotifierProvider<ConsoleNotifier, ConsoleState>(ConsoleNotifier.new);

class ConsoleNotifier extends Notifier<ConsoleState> {
  StreamSubscription<LogEntry>? _sub;

  @override
  ConsoleState build() {
    state = ConsoleState(entries: List.of(LogService.instance.entries));
    _sub = LogService.instance.stream.listen(_onLogEntry);
    ref.onDispose(() {
      _sub?.cancel();
    });
    return state;
  }

  void _onLogEntry(LogEntry entry) {
    if (state.paused) return;
    state = state.copyWith(entries: [...state.entries, entry]);
  }

  void clear() {
    LogService.instance.clear();
    state = state.copyWith(entries: const []);
  }

  void togglePause() {
    state = state.copyWith(paused: !state.paused);
    if (!state.paused) {
      // Re-sync when resuming so we don't drop entries that arrived while paused.
      state = state.copyWith(entries: List.of(LogService.instance.entries));
    }
  }

  void toggleLevel(LogLevel level) {
    final next = state.visibleLevels.toSet();
    if (!next.add(level)) next.remove(level);
    if (next.isEmpty) return; // never let the user filter everything out
    state = state.copyWith(visibleLevels: next);
  }
}
