import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/shell_session.dart';
import '../providers/sessions_providers.dart';
import 'shell_terminal_view.dart';

class ShellTabsView extends ConsumerStatefulWidget {
  const ShellTabsView({super.key});

  @override
  ConsumerState<ShellTabsView> createState() => _ShellTabsViewState();
}

class _ShellTabsViewState extends ConsumerState<ShellTabsView> {
  bool _seeded = false;

  @override
  Widget build(BuildContext context) {
    if (!Platform.isWindows && !Platform.isMacOS && !Platform.isLinux) {
      return const _DesktopOnlyMessage();
    }

    final asyncState = ref.watch(sessionsProvider);

    return asyncState.when(
      loading: () => const Center(
        child: SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(strokeWidth: 1.5),
        ),
      ),
      error: (e, st) => Center(
        child: Text('Error: $e',
            style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
      ),
      data: (state) {
        if (!_seeded && state.sessions.isEmpty) {
          _seeded = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            ref.read(sessionsProvider.notifier).createSession();
          });
          return const SizedBox.shrink();
        }

        final active = state.sessions
            .where((s) => s.id == state.activeId)
            .firstOrNull;

        return Column(
          children: [
            _TabStrip(
              sessions: state.sessions,
              activeId: state.activeId,
              onSelect: (id) =>
                  ref.read(sessionsProvider.notifier).setActive(id),
              onClose: (id) =>
                  ref.read(sessionsProvider.notifier).closeSession(id),
              onAdd: () =>
                  ref.read(sessionsProvider.notifier).createSession(),
            ),
            Expanded(
              child: active == null
                  ? const Center(
                      child: Text(
                        'No shells open',
                        style: TextStyle(
                          color: Color(0xFF6B7280),
                          fontFamily: 'monospace',
                          fontSize: 12,
                        ),
                      ),
                    )
                  : _StackedTerminals(
                      sessions: state.sessions,
                      activeId: active.id,
                    ),
            ),
          ],
        );
      },
    );
  }
}

/// Mounts only the active terminal. PTYs and scrollback for inactive tabs
/// survive in [PtyRunnerCache] — switching tabs just rebuilds the
/// TerminalView around the same underlying Terminal instance.
///
/// We do NOT keep inactive TerminalViews mounted under Offstage: every
/// TerminalView registers a Flutter TextInputClient on focus, and an
/// off-screen one fails with "view ID is null" which corrupts text input
/// for the whole app.
class _StackedTerminals extends StatelessWidget {
  final List<ShellSession> sessions;
  final String activeId;

  const _StackedTerminals({required this.sessions, required this.activeId});

  @override
  Widget build(BuildContext context) {
    final active = sessions.where((s) => s.id == activeId).firstOrNull;
    if (active == null) return const SizedBox.shrink();
    return ShellTerminalView(key: ValueKey(active.id), session: active);
  }
}

class _TabStrip extends StatelessWidget {
  final List<ShellSession> sessions;
  final String? activeId;
  final void Function(String id) onSelect;
  final void Function(String id) onClose;
  final VoidCallback onAdd;

  const _TabStrip({
    required this.sessions,
    required this.activeId,
    required this.onSelect,
    required this.onClose,
    required this.onAdd,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final labels = _buildLabels(sessions);

    return Container(
      height: 28,
      decoration: BoxDecoration(
        color: const Color(0xFF14151A),
        border: Border(bottom: BorderSide(color: colors.borderDark, width: 1)),
      ),
      child: Row(
        children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final s in sessions)
                    _TabChip(
                      label: labels[s.id]!,
                      tooltip: s.cwd,
                      active: s.id == activeId,
                      onTap: () => onSelect(s.id),
                      onClose: () => onClose(s.id),
                    ),
                ],
              ),
            ),
          ),
          _AddButton(onTap: onAdd),
        ],
      ),
    );
  }

  static Map<String, String> _buildLabels(List<ShellSession> sessions) {
    final counts = <String, int>{};
    final result = <String, String>{};
    for (final s in sessions) {
      final base = _baseName(s.cwd);
      final count = counts.update(base, (v) => v + 1, ifAbsent: () => 1);
      result[s.id] = count == 1 ? base : '$base ($count)';
    }
    return result;
  }

  static String _baseName(String path) {
    final clean = path.replaceAll(RegExp(r'[\\/]+$'), '');
    if (clean.isEmpty) return '/';
    final base = p.basename(clean);
    if (base.isEmpty) return clean;
    return base;
  }
}

class _TabChip extends StatefulWidget {
  final String label;
  final String tooltip;
  final bool active;
  final VoidCallback onTap;
  final VoidCallback onClose;

  const _TabChip({
    required this.label,
    required this.tooltip,
    required this.active,
    required this.onTap,
    required this.onClose,
  });

  @override
  State<_TabChip> createState() => _TabChipState();
}

class _TabChipState extends State<_TabChip> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final bg = widget.active
        ? const Color(0xFF1A1B20)
        : (_hovering ? const Color(0xFF1F2026) : Colors.transparent);
    final fg = widget.active
        ? colors.primary
        : (_hovering ? colors.textPrimary : colors.textSecondary);

    return Tooltip(
      message: widget.tooltip,
      waitDuration: const Duration(milliseconds: 600),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          child: Container(
            height: 28,
            padding: const EdgeInsets.only(left: 10, right: 4),
            decoration: BoxDecoration(
              color: bg,
              border: widget.active
                  ? Border(
                      top: BorderSide(color: colors.primary, width: 2),
                    )
                  : null,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.label,
                  style: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: fg,
                    fontWeight:
                        widget.active ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
                const SizedBox(width: 6),
                _CloseButton(onTap: widget.onClose),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CloseButton extends StatefulWidget {
  final VoidCallback onTap;
  const _CloseButton({required this.onTap});

  @override
  State<_CloseButton> createState() => _CloseButtonState();
}

class _CloseButtonState extends State<_CloseButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        child: Container(
          width: 18,
          height: 18,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: _hovering ? const Color(0xFF3A2A2A) : Colors.transparent,
            borderRadius: BorderRadius.circular(3),
          ),
          child: Icon(
            Icons.close,
            size: 11,
            color: _hovering
                ? const Color(0xFFE87878)
                : const Color(0xFF6B7280),
          ),
        ),
      ),
    );
  }
}

class _AddButton extends StatefulWidget {
  final VoidCallback onTap;
  const _AddButton({required this.onTap});

  @override
  State<_AddButton> createState() => _AddButtonState();
}

class _AddButtonState extends State<_AddButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Tooltip(
      message: 'New shell',
      waitDuration: const Duration(milliseconds: 500),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          child: Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            color: _hovering ? const Color(0xFF1F2026) : Colors.transparent,
            child: Icon(
              Icons.add,
              size: 14,
              color: _hovering ? colors.primary : colors.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}

class _DesktopOnlyMessage extends StatelessWidget {
  const _DesktopOnlyMessage();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF14151A),
      child: const Center(
        child: Text(
          'Shells are available on desktop only.',
          style: TextStyle(
            color: Color(0xFF6B7280),
            fontFamily: 'monospace',
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}
