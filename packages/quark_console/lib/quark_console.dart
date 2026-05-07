import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import 'presentation/pages/console_page.dart';
import 'presentation/providers/console_providers.dart';

class ConsoleModule extends Quark {
  @override
  String get id => 'quark_console';

  @override
  String get name => 'Quark Console';

  @override
  IconData get icon => Icons.terminal;

  @override
  Widget buildPage() => const ConsolePage();

  @override
  List<QuarkSettingOption> buildSettings(
      BuildContext context, WidgetRef ref) {
    final state = ref.watch(consoleProvider);
    return [
      QuarkSettingOption(
        id: 'clear_logs',
        label: 'Clear logs',
        icon: Icons.clear_all,
        onTap: () => ref.read(consoleProvider.notifier).clear(),
      ),
      QuarkSettingOption(
        id: 'pause_resume',
        label: state.paused ? 'Resume stream' : 'Pause stream',
        icon: state.paused ? Icons.play_arrow : Icons.pause,
        onTap: () => ref.read(consoleProvider.notifier).togglePause(),
      ),
      for (final level in LogLevel.values)
        QuarkSettingOption(
          id: 'filter_${level.name}',
          label:
              '${state.visibleLevels.contains(level) ? '✓ ' : '  '}${level.name.toUpperCase()}',
          icon: Icons.filter_list,
          onTap: () => ref.read(consoleProvider.notifier).toggleLevel(level),
        ),
    ];
  }

  @override
  Future<void> initialize() async {
    LogService.instance.info('quark_console', 'Console initialized');
  }

  @override
  void dispose() {}
}
