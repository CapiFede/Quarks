import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/llm/llm_provider.dart';
import '../../data/llm/llm_provider_registry.dart';
import '../../data/llm/providers/anthropic_provider.dart';
import '../../data/llm/providers/google_provider.dart';
import '../../data/llm/providers/ollama_provider.dart';
import '../../domain/llm_model.dart';
import '../../domain/provider_config.dart';
import 'secret_providers.dart';

/// Registry of LLM providers built from the currently-configured credentials.
/// Rebuilds whenever [providerConfigsProvider] emits.
final llmProviderRegistryProvider = Provider<LlmProviderRegistry>((ref) {
  final configsAsync = ref.watch(providerConfigsProvider);
  final configs = configsAsync.valueOrNull ?? const <String, ProviderConfig>{};
  final providers = <String, LlmProvider>{};
  for (final entry in configs.entries) {
    final p = _instantiate(entry.key, entry.value);
    if (p != null) providers[entry.key] = p;
  }
  return LlmProviderRegistry(providers);
});

LlmProvider? _instantiate(String providerId, ProviderConfig config) {
  return switch (providerId) {
    'anthropic' => AnthropicProvider.maybeBuild(config),
    'google' => GoogleProvider.maybeBuild(config),
    'ollama' => OllamaProvider.maybeBuild(config),
    _ => null,
  };
}

/// Flat list of every model exposed by configured providers.
final availableModelsProvider = Provider<List<LlmModel>>((ref) {
  return ref.watch(llmProviderRegistryProvider).allModels;
});

/// Currently-selected provider in the drawer. Falls back to the provider of
/// the first available model when nothing is explicitly chosen.
final activeProviderIdProvider =
    NotifierProvider<ActiveProviderIdNotifier, String?>(
  ActiveProviderIdNotifier.new,
);

class ActiveProviderIdNotifier extends Notifier<String?> {
  String? _userSelected;

  @override
  String? build() {
    final providers = ref.watch(llmProviderRegistryProvider).providers;
    final available =
        providers.map((p) => p.providerId).toSet();
    if (available.isEmpty) return null;
    if (_userSelected != null && available.contains(_userSelected)) {
      return _userSelected;
    }
    return providers.first.providerId;
  }

  void select(String providerId) {
    _userSelected = providerId;
    state = providerId;
  }
}

/// Models exposed by the [activeProviderIdProvider]. Empty when no provider
/// is configured yet.
final modelsForActiveProviderProvider = Provider<List<LlmModel>>((ref) {
  final id = ref.watch(activeProviderIdProvider);
  if (id == null) return const [];
  final reg = ref.watch(llmProviderRegistryProvider);
  return reg.byId(id)?.models ?? const [];
});

/// Currently selected model in the drawer. Tracks the active provider — if the
/// user switches provider, the model falls back to that provider's first
/// model.
final activeModelProvider = NotifierProvider<ActiveModelNotifier, LlmModel?>(
  ActiveModelNotifier.new,
);

class ActiveModelNotifier extends Notifier<LlmModel?> {
  // Held in an instance field instead of [state] because Riverpod forbids
  // reading [state] from inside [build] (it's only initialized after build
  // returns). The field survives rebuilds — the Notifier instance is reused
  // when its watched deps change.
  final Map<String, LlmModel> _userSelectedByProvider = {};

  @override
  LlmModel? build() {
    final models = ref.watch(modelsForActiveProviderProvider);
    if (models.isEmpty) return null;
    final providerId = ref.watch(activeProviderIdProvider);
    final remembered = _userSelectedByProvider[providerId];
    if (remembered != null && models.contains(remembered)) {
      return remembered;
    }
    return models.first;
  }

  void select(LlmModel model) {
    _userSelectedByProvider[model.providerId] = model;
    state = model;
  }
}
