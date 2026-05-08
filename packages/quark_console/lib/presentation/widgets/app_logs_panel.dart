import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/app_logs_providers.dart';
import '../providers/console_providers.dart';
import 'log_view.dart';

class AppLogsPanel extends ConsumerWidget {
  const AppLogsPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final state = ref.watch(consoleProvider);

    return Container(
      color: const Color(0xFF14151A),
      child: Column(
        children: [
          Container(
            height: 28,
            decoration: BoxDecoration(
              color: const Color(0xFF1A1B20),
              border: Border(
                bottom: BorderSide(color: colors.borderDark, width: 1),
              ),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(
              children: [
                const Text(
                  'APP LOGS',
                  style: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: Color(0xFF8B95A1),
                    letterSpacing: 1,
                  ),
                ),
                const SizedBox(width: 12),
                for (final level in LogLevel.values)
                  _LevelToggle(
                    level: level,
                    enabled: state.visibleLevels.contains(level),
                    onTap: () => ref
                        .read(consoleProvider.notifier)
                        .toggleLevel(level),
                  ),
                const Spacer(),
                _IconAction(
                  icon: state.paused ? Icons.play_arrow : Icons.pause,
                  tooltip: state.paused ? 'Resume stream' : 'Pause stream',
                  onTap: () =>
                      ref.read(consoleProvider.notifier).togglePause(),
                ),
                _IconAction(
                  icon: Icons.clear_all,
                  tooltip: 'Clear logs',
                  onTap: () => ref.read(consoleProvider.notifier).clear(),
                ),
                _IconAction(
                  icon: Icons.close,
                  tooltip: 'Close',
                  onTap: () =>
                      ref.read(appLogsVisibleProvider.notifier).state = false,
                ),
              ],
            ),
          ),
          const Expanded(child: LogView()),
        ],
      ),
    );
  }
}

class _LevelToggle extends StatelessWidget {
  final LogLevel level;
  final bool enabled;
  final VoidCallback onTap;

  const _LevelToggle({
    required this.level,
    required this.enabled,
    required this.onTap,
  });

  Color _color(LogLevel l) {
    switch (l) {
      case LogLevel.debug:
        return const Color(0xFF6B7280);
      case LogLevel.info:
        return const Color(0xFFB8C5D1);
      case LogLevel.warn:
        return const Color(0xFFD9A85F);
      case LogLevel.error:
        return const Color(0xFFE87878);
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _color(level);
    return Tooltip(
      message: '${enabled ? 'Hide' : 'Show'} ${level.name.toUpperCase()}',
      waitDuration: const Duration(milliseconds: 500),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 2),
            padding:
                const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
            decoration: BoxDecoration(
              color: enabled
                  ? color.withValues(alpha: 0.15)
                  : Colors.transparent,
              border: Border.all(
                color: enabled ? color : const Color(0xFF2A2C33),
                width: 1,
              ),
              borderRadius: BorderRadius.circular(2),
            ),
            child: Text(
              level.name.toUpperCase(),
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: enabled ? color : const Color(0xFF4A4D55),
                letterSpacing: 0.8,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _IconAction extends StatefulWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _IconAction({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  @override
  State<_IconAction> createState() => _IconActionState();
}

class _IconActionState extends State<_IconAction> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: widget.tooltip,
      waitDuration: const Duration(milliseconds: 500),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          child: Container(
            width: 22,
            height: 22,
            margin: const EdgeInsets.symmetric(horizontal: 1),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: _hovering
                  ? const Color(0xFF2A2C33)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(3),
            ),
            child: Icon(
              widget.icon,
              size: 13,
              color: _hovering
                  ? const Color(0xFFB8C5D1)
                  : const Color(0xFF8B95A1),
            ),
          ),
        ),
      ),
    );
  }
}
