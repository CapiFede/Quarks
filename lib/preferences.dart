import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Single in-memory snapshot of all user preferences. Persisted as JSON next
/// to the executable on desktop and in app docs on mobile.
@immutable
class AppPreferences {
  final ThemeMode themeMode;
  final bool launchAtStartup;
  final List<String> openTabs;
  final int activeIndex;

  const AppPreferences({
    this.themeMode = ThemeMode.light,
    this.launchAtStartup = false,
    this.openTabs = const [],
    this.activeIndex = -1,
  });

  AppPreferences copyWith({
    ThemeMode? themeMode,
    bool? launchAtStartup,
    List<String>? openTabs,
    int? activeIndex,
  }) {
    return AppPreferences(
      themeMode: themeMode ?? this.themeMode,
      launchAtStartup: launchAtStartup ?? this.launchAtStartup,
      openTabs: openTabs ?? this.openTabs,
      activeIndex: activeIndex ?? this.activeIndex,
    );
  }

  Map<String, dynamic> toJson() => {
        'themeMode': themeMode.name,
        'launchAtStartup': launchAtStartup,
        'openTabs': openTabs,
        'activeIndex': activeIndex,
      };

  factory AppPreferences.fromJson(Map<String, dynamic> json) {
    final modeName = json['themeMode'] as String?;
    final mode = ThemeMode.values.firstWhere(
      (m) => m.name == modeName,
      orElse: () => ThemeMode.light,
    );
    return AppPreferences(
      themeMode: mode,
      launchAtStartup: json['launchAtStartup'] as bool? ?? false,
      openTabs: (json['openTabs'] as List?)?.cast<String>() ?? const [],
      activeIndex: json['activeIndex'] as int? ?? -1,
    );
  }
}

class PreferencesStorageService {
  static const _fileName = 'quarks_preferences.json';

  Future<File> _file() async {
    final Directory root;
    if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
      root = File(Platform.resolvedExecutable).parent;
    } else {
      root = await getApplicationDocumentsDirectory();
    }
    return File(p.join(root.path, _fileName));
  }

  Future<AppPreferences> load() async {
    final file = await _file();
    if (!await file.exists()) return const AppPreferences();
    try {
      final json = jsonDecode(await file.readAsString())
          as Map<String, dynamic>;
      return AppPreferences.fromJson(json);
    } catch (_) {
      return const AppPreferences();
    }
  }

  Future<void> save(AppPreferences prefs) async {
    final file = await _file();
    await file.writeAsString(jsonEncode(prefs.toJson()));
  }
}
