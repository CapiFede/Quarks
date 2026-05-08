import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/services/pty_shell_runner.dart';
import '../../data/services/sessions_storage_service.dart';
import '../../domain/entities/shell_session.dart';

class SessionsState {
  final List<ShellSession> sessions;
  final String? activeId;

  const SessionsState({this.sessions = const [], this.activeId});

  SessionsState copyWith({List<ShellSession>? sessions, String? activeId}) =>
      SessionsState(
        sessions: sessions ?? this.sessions,
        activeId: activeId ?? this.activeId,
      );
}

final sessionsProvider =
    AsyncNotifierProvider<SessionsNotifier, SessionsState>(
        SessionsNotifier.new);

class SessionsNotifier extends AsyncNotifier<SessionsState> {
  final _storage = SessionsStorageService();

  @override
  Future<SessionsState> build() async {
    final saved = await _storage.load();
    final active = saved.isNotEmpty ? saved.first.id : null;
    return SessionsState(sessions: saved, activeId: active);
  }

  Future<void> _persist(List<ShellSession> sessions) async {
    await _storage.save(sessions);
  }

  String _newId() =>
      DateTime.now().microsecondsSinceEpoch.toRadixString(36);

  String _defaultCwd() {
    final current = state.valueOrNull;
    if (current != null && current.activeId != null) {
      final active = current.sessions
          .where((s) => s.id == current.activeId)
          .firstOrNull;
      if (active != null) return active.cwd;
    }
    if (Platform.isWindows) {
      return Platform.environment['USERPROFILE'] ??
          File(Platform.resolvedExecutable).parent.path;
    }
    return Platform.environment['HOME'] ?? '/';
  }

  Future<ShellSession> createSession({String? cwd}) async {
    final session = ShellSession(id: _newId(), cwd: cwd ?? _defaultCwd());
    final current = state.valueOrNull ?? const SessionsState();
    final next = [...current.sessions, session];
    state = AsyncData(SessionsState(sessions: next, activeId: session.id));
    await _persist(next);
    return session;
  }

  Future<void> closeSession(String id) async {
    final current = state.valueOrNull;
    if (current == null) return;
    final remaining = current.sessions.where((s) => s.id != id).toList();
    String? newActive = current.activeId;
    if (current.activeId == id) {
      newActive = remaining.isNotEmpty ? remaining.last.id : null;
    }
    state = AsyncData(SessionsState(sessions: remaining, activeId: newActive));
    PtyRunnerCache.instance.dispose(id);
    await _persist(remaining);
  }

  void setActive(String id) {
    final current = state.valueOrNull;
    if (current == null) return;
    if (current.activeId == id) return;
    state = AsyncData(current.copyWith(activeId: id));
  }

  Future<void> updateCwd(String id, String cwd) async {
    final current = state.valueOrNull;
    if (current == null) return;
    final idx = current.sessions.indexWhere((s) => s.id == id);
    if (idx < 0) return;
    if (current.sessions[idx].cwd == cwd) return;
    final next = [...current.sessions];
    next[idx] = next[idx].copyWith(cwd: cwd);
    state = AsyncData(current.copyWith(sessions: next));
    await _persist(next);
  }
}

/// Holds live PTY runners keyed by session id so they survive tab switches
/// and aren't recreated when the sessions list rebuilds. Lifecycle is
/// driven explicitly by [SessionsNotifier.closeSession] and app shutdown.
class PtyRunnerCache {
  PtyRunnerCache._();
  static final PtyRunnerCache instance = PtyRunnerCache._();

  final Map<String, PtyShellRunner> _runners = {};

  PtyShellRunner getOrCreate(
    String id, {
    required String cwd,
    required void Function(String) onCwdChanged,
  }) {
    return _runners.putIfAbsent(id, () {
      final shell = ShellLauncher.resolveShell();
      return PtyShellRunner(
        shell: shell,
        arguments: ShellLauncher.argsFor(shell),
        workingDirectory: cwd,
        onCwdChanged: onCwdChanged,
      );
    });
  }

  void dispose(String id) {
    _runners.remove(id)?.dispose();
  }

  void disposeAll() {
    for (final r in _runners.values) {
      r.dispose();
    }
    _runners.clear();
  }
}
