import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_music/quark_music.dart';
import 'package:quarks_core/quarks_core.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

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
      title: 'Quarks',
      debugShowCheckedModeBanner: false,
      theme: QuarksTheme.theme,
      home: const QuarksShell(),
    );
  }
}
