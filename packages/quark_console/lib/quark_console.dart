import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import 'presentation/pages/console_page.dart';
import 'presentation/providers/app_logs_providers.dart';
import 'presentation/providers/sessions_providers.dart';
import 'presentation/widgets/app_logs_panel.dart';

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
    final visible = ref.watch(appLogsVisibleProvider);
    return [
      QuarkSettingOption(
        id: 'app_logs',
        label: visible ? '✓ App Logs' : '  App Logs',
        icon: Icons.receipt_long,
        onTap: () => ref.read(appLogsVisibleProvider.notifier).state = !visible,
      ),
    ];
  }

  @override
  Widget? buildOverlay(BuildContext context, WidgetRef ref) {
    final visible = ref.watch(appLogsVisibleProvider);
    if (!visible) return null;
    return const AppLogsPanel();
  }

  @override
  bool onEscape(WidgetRef ref) {
    if (ref.read(appLogsVisibleProvider)) {
      ref.read(appLogsVisibleProvider.notifier).state = false;
      return true;
    }
    return false;
  }

  @override
  Future<void> initialize() async {
    LogService.instance.info('quark_console', 'Console initialized');
  }

  @override
  void dispose() {
    PtyRunnerCache.instance.disposeAll();
  }
}
