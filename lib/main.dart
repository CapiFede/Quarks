import 'package:auto_updater/auto_updater.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_music/quark_music.dart';
import 'package:quark_core/quark_core.dart';
import 'package:window_manager/window_manager.dart';

import 'quarks_registry.dart';
import 'presentation/quarks_shell.dart';
import 'quarks_providers.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  const feedURL =
      'https://raw.githubusercontent.com/CapiFede/Quarks/main/appcast.xml';
  await autoUpdater.setFeedURL(feedURL);
  await autoUpdater.checkForUpdates(inBackground: true);

  await windowManager.ensureInitialized();
  const windowOptions = WindowOptions(
    size: Size(900, 600),
    minimumSize: Size(500, 400),
    titleBarStyle: TitleBarStyle.hidden,
  );
  await windowManager.waitUntilReadyToShow(windowOptions, () async {
    await windowManager.show();
    await windowManager.focus();
  });

  final registry = QuarkRegistry();
  registry.register(MusicModule());
  await registry.initializeAll();

  runApp(
    ProviderScope(
      overrides: [
        quarkRegistryProvider.overrideWithValue(registry),
      ],
      child: const QuarksApp(),
    ),
  );
}

class QuarksApp extends ConsumerWidget {
  const QuarksApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp(
      title: 'Quarks',
      debugShowCheckedModeBanner: false,
      theme: QuarksTheme.theme,
      darkTheme: QuarksTheme.darkTheme,
      themeMode: themeMode,
      home: const QuarksShell(),
    );
  }
}
