import 'dart:io';

import 'package:auto_updater/auto_updater.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_quill/flutter_quill.dart' show FlutterQuillLocalizations;
import 'package:launch_at_startup/launch_at_startup.dart';
import 'package:quark_calendar/quark_calendar.dart';
import 'package:quark_console/quark_console.dart';
import 'package:quark_music/quark_music.dart';
import 'package:quark_notes/quark_notes.dart';
import 'package:quark_core/quark_core.dart';
import 'package:window_manager/window_manager.dart';

import 'preferences.dart';
import 'quarks_registry.dart';
import 'presentation/quarks_shell.dart';
import 'quarks_providers.dart';

bool get _isDesktop => Platform.isWindows || Platform.isMacOS || Platform.isLinux;

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final prefsStorage = PreferencesStorageService();
  final loadedPrefs = await prefsStorage.load();

  if (_isDesktop) {
    // launch_at_startup needs the resolved exe path to write the OS hook.
    // Setup is idempotent and cheap; we run it on every launch so toggling
    // works even when the binary moved between runs.
    launchAtStartup.setup(
      appName: 'Quarks',
      appPath: Platform.resolvedExecutable,
    );
    // Reconcile OS state with our persisted preference: if the user enabled
    // it before but the registry entry is stale (e.g. binary path changed),
    // re-applying enable() refreshes the entry. Conversely if it was disabled
    // we leave the OS alone — the user may have toggled it externally.
    if (loadedPrefs.launchAtStartup) {
      await launchAtStartup.enable();
    }

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
  }

  final registry = QuarkRegistry();
  registry.register(MusicModule());
  registry.register(NotesModule());
  registry.register(CalendarModule());
  registry.register(ConsoleModule());
  await registry.initializeAll();

  runApp(
    ProviderScope(
      overrides: [
        quarkRegistryProvider.overrideWithValue(registry),
        preferencesStorageProvider.overrideWithValue(prefsStorage),
        appPreferencesProvider.overrideWith(
          () => _SeededPreferencesNotifier(loadedPrefs),
        ),
      ],
      child: const QuarksApp(),
    ),
  );
}

class _SeededPreferencesNotifier extends AppPreferencesNotifier {
  _SeededPreferencesNotifier(this._initial);

  final AppPreferences _initial;

  @override
  AppPreferences build() => _initial;
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
      localizationsDelegates: const [
        FlutterQuillLocalizations.delegate,
      ],
      home: const QuarksShell(),
    );
  }
}
