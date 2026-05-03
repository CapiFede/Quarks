import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/pin_storage_service.dart';

final pinStorageServiceProvider = Provider<PinStorageService>((ref) {
  return PinStorageService();
});

/// Global pin state keyed by `quarkId`. Each entry holds two sets: settings
/// (gear menu options pinned to the toolbar) and dynamicItems (e.g.
/// playlists that the Quark has chosen to expose as pinneable).
final pinStateProvider =
    AsyncNotifierProvider<PinStateNotifier, Map<String, PinSet>>(
        PinStateNotifier.new);

class PinStateNotifier extends AsyncNotifier<Map<String, PinSet>> {
  late final PinStorageService _storage;

  @override
  Future<Map<String, PinSet>> build() async {
    _storage = ref.read(pinStorageServiceProvider);
    return _storage.load();
  }

  bool isSettingPinned(String quarkId, String optionId) {
    final pins = state.valueOrNull?[quarkId];
    return pins?.settings.contains(optionId) ?? false;
  }

  bool isDynamicPinned(String quarkId, String itemId) {
    final pins = state.valueOrNull?[quarkId];
    return pins?.dynamicItems.contains(itemId) ?? false;
  }

  Set<String> dynamicPinsFor(String quarkId) =>
      state.valueOrNull?[quarkId]?.dynamicItems ?? const {};

  Set<String> settingPinsFor(String quarkId) =>
      state.valueOrNull?[quarkId]?.settings ?? const {};

  Future<void> toggleSetting(String quarkId, String optionId) async {
    await _mutate(quarkId, (set) {
      final next = set.settings.toSet();
      if (!next.add(optionId)) next.remove(optionId);
      return set.copyWith(settings: next);
    });
  }

  Future<void> toggleDynamic(String quarkId, String itemId) async {
    await _mutate(quarkId, (set) {
      final next = set.dynamicItems.toSet();
      if (!next.add(itemId)) next.remove(itemId);
      return set.copyWith(dynamicItems: next);
    });
  }

  Future<void> pinDynamic(String quarkId, String itemId) async {
    await _mutate(quarkId, (set) {
      if (set.dynamicItems.contains(itemId)) return set;
      return set.copyWith(dynamicItems: {...set.dynamicItems, itemId});
    });
  }

  Future<void> unpinDynamic(String quarkId, String itemId) async {
    await _mutate(quarkId, (set) {
      if (!set.dynamicItems.contains(itemId)) return set;
      final next = set.dynamicItems.toSet()..remove(itemId);
      return set.copyWith(dynamicItems: next);
    });
  }

  /// Sets initial pin defaults for a Quark only if no entry exists yet.
  /// Once the user has touched any pin (even if they end up with an empty
  /// set), this is a no-op — we don't override their explicit state.
  Future<void> seedIfMissing(
    String quarkId, {
    Set<String> settings = const {},
    Set<String> dynamicItems = const {},
  }) async {
    final loaded = await future;
    if (loaded.containsKey(quarkId)) return;
    final current = Map<String, PinSet>.from(loaded);
    current[quarkId] =
        PinSet(settings: settings, dynamicItems: dynamicItems);
    state = AsyncData(current);
    await _storage.save(current);
  }

  Future<void> _mutate(
      String quarkId, PinSet Function(PinSet current) update) async {
    // Make sure the initial load has completed before mutating, otherwise
    // we could persist an empty map over an existing on-disk file.
    final loaded = await future;
    final current = Map<String, PinSet>.from(loaded);
    // Note: we keep entries even when empty — an explicitly-cleared set is
    // distinct from "never touched" and shouldn't trigger seedIfMissing again.
    current[quarkId] = update(current[quarkId] ?? const PinSet());
    state = AsyncData(current);
    await _storage.save(current);
  }
}
