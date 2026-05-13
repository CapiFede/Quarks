import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:launch_at_startup/launch_at_startup.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'preferences.dart';

/// App version string read once from package info
final appVersionProvider = FutureProvider<String>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return info.version;
});

/// Persistence layer for [AppPreferences]. Overridden in main with the
/// already-instantiated service so we don't construct it twice.
final preferencesStorageProvider = Provider<PreferencesStorageService>((ref) {
  throw UnimplementedError('Override in ProviderScope');
});

/// Single source of truth for all persisted user preferences. The initial
/// snapshot is loaded from disk before runApp() and injected via override.
final appPreferencesProvider =
    NotifierProvider<AppPreferencesNotifier, AppPreferences>(
        AppPreferencesNotifier.new);

class AppPreferencesNotifier extends Notifier<AppPreferences> {
  @override
  AppPreferences build() {
    throw UnimplementedError(
        'appPreferencesProvider must be overridden with the loaded snapshot');
  }

  void _persist(AppPreferences next) {
    state = next;
    // Fire-and-forget: a stale write isn't worth blocking the UI for.
    ref.read(preferencesStorageProvider).save(next);
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    if (state.themeMode == mode) return;
    _persist(state.copyWith(themeMode: mode));
  }

  Future<void> setLaunchAtStartup(bool enabled) async {
    if (state.launchAtStartup == enabled) return;
    if (enabled) {
      await launchAtStartup.enable();
    } else {
      await launchAtStartup.disable();
    }
    _persist(state.copyWith(launchAtStartup: enabled));
  }

  void _setTabs(List<String> openTabs, int activeIndex) {
    if (listEquals(state.openTabs, openTabs) &&
        state.activeIndex == activeIndex) {
      return;
    }
    _persist(state.copyWith(openTabs: openTabs, activeIndex: activeIndex));
  }
}

bool listEquals<T>(List<T> a, List<T> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

/// Derived view of the theme mode, exposed for widgets that only care about
/// theming (no need to rebuild on tab changes).
final themeModeProvider = Provider<ThemeMode>((ref) {
  return ref.watch(appPreferencesProvider.select((p) => p.themeMode));
});

/// Tab navigation state, mirrored from [appPreferencesProvider]. Mutations go
/// through this notifier which delegates persistence to the prefs store.
final tabsProvider =
    NotifierProvider<TabsNotifier, TabsState>(TabsNotifier.new);

class TabsState {
  final List<String> openTabs;
  final int activeIndex;

  const TabsState({this.openTabs = const [], this.activeIndex = -1});

  bool get isHome => activeIndex == -1;
  String? get activeQuarkId =>
      activeIndex >= 0 && activeIndex < openTabs.length
          ? openTabs[activeIndex]
          : null;

  TabsState copyWith({List<String>? openTabs, int? activeIndex}) {
    return TabsState(
      openTabs: openTabs ?? this.openTabs,
      activeIndex: activeIndex ?? this.activeIndex,
    );
  }
}

class TabsNotifier extends Notifier<TabsState> {
  @override
  TabsState build() {
    final prefs = ref.watch(appPreferencesProvider);
    return TabsState(
      openTabs: List.unmodifiable(prefs.openTabs),
      activeIndex: prefs.activeIndex,
    );
  }

  void _commit(List<String> openTabs, int activeIndex) {
    ref
        .read(appPreferencesProvider.notifier)
        ._setTabs(List.unmodifiable(openTabs), activeIndex);
  }

  void openQuark(String quarkId) {
    var tabs = state.openTabs;
    if (!tabs.contains(quarkId)) {
      tabs = [...tabs, quarkId];
    }
    final index = tabs.indexOf(quarkId);
    _commit(tabs, index);
  }

  void closeQuark(String quarkId) {
    final index = state.openTabs.indexOf(quarkId);
    if (index == -1) return;

    final newTabs = [...state.openTabs]..removeAt(index);

    int newActive;
    if (newTabs.isEmpty) {
      newActive = -1;
    } else if (state.activeIndex >= newTabs.length) {
      newActive = newTabs.length - 1;
    } else {
      newActive = state.activeIndex;
    }

    _commit(newTabs, newActive);
  }

  void setActiveIndex(int index) {
    _commit(state.openTabs, index);
  }

  void goHome() {
    _commit(state.openTabs, -1);
  }
}
