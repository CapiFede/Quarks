import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'quarks_registry.dart';

/// App version string read once from package info
final appVersionProvider = FutureProvider<String>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return info.version;
});

/// Theme mode toggle (light/dark)
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.light);

/// The single quark registry instance
final quarkRegistryProvider = Provider<QuarkRegistry>((ref) {
  return QuarkRegistry();
});

/// Tab navigation state
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
  TabsState build() => const TabsState();

  void openQuark(String quarkId) {
    var tabs = state.openTabs;
    if (!tabs.contains(quarkId)) {
      tabs = [...tabs, quarkId];
    }
    final index = tabs.indexOf(quarkId);
    state = state.copyWith(openTabs: tabs, activeIndex: index);
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

    state = TabsState(openTabs: newTabs, activeIndex: newActive);
  }

  void setActiveIndex(int index) {
    state = state.copyWith(activeIndex: index);
  }

  void goHome() {
    state = state.copyWith(activeIndex: -1);
  }
}
