import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../module/module_registry.dart';
import '../module/quark_module.dart';

/// The single module registry instance
final moduleRegistryProvider = Provider<ModuleRegistry>((ref) {
  return ModuleRegistry();
});

/// List of all registered modules (reactive)
final installedModulesProvider = Provider<List<QuarkModule>>((ref) {
  return ref.watch(moduleRegistryProvider).modules;
});

/// Currently open module tabs
final openTabsProvider =
    NotifierProvider<OpenTabsNotifier, List<String>>(OpenTabsNotifier.new);

/// Index of the active tab (-1 = home/launcher grid)
final activeTabIndexProvider =
    NotifierProvider<ActiveTabIndexNotifier, int>(ActiveTabIndexNotifier.new);

class OpenTabsNotifier extends Notifier<List<String>> {
  @override
  List<String> build() => [];

  void openModule(String moduleId) {
    if (!state.contains(moduleId)) {
      state = [...state, moduleId];
    }
    // Switch to the opened tab
    final index = state.indexOf(moduleId);
    ref.read(activeTabIndexProvider.notifier).setIndex(index);
  }

  void closeModule(String moduleId) {
    final index = state.indexOf(moduleId);
    if (index == -1) return;

    state = [...state]..removeAt(index);

    final activeIndex = ref.read(activeTabIndexProvider);
    if (state.isEmpty) {
      ref.read(activeTabIndexProvider.notifier).goHome();
    } else if (activeIndex >= state.length) {
      ref.read(activeTabIndexProvider.notifier).setIndex(state.length - 1);
    }
  }
}

class ActiveTabIndexNotifier extends Notifier<int> {
  @override
  int build() => -1; // -1 means home

  void setIndex(int index) {
    state = index;
  }

  void goHome() {
    state = -1;
  }
}
