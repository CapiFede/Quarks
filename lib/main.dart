import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_music/quark_music.dart';
import 'package:quarks_core/quarks_core.dart';
import 'package:window_manager/window_manager.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

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

  final registry = ModuleRegistry();
  registry.register(MusicModule());
  await registry.initializeAll();

  runApp(
    ProviderScope(
      overrides: [
        moduleRegistryProvider.overrideWithValue(registry),
      ],
      child: const QuarksApp(),
    ),
  );
}

class QuarksApp extends StatelessWidget {
  const QuarksApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Quarks 2',
      debugShowCheckedModeBanner: false,
      theme: QuarksTheme.theme,
      home: const QuarksShell(),
    );
  }
}
