import '../../domain/llm_model.dart';
import 'llm_provider.dart';

/// Holds the currently-active [LlmProvider] instances (only those with
/// valid credentials are instantiated). Built by a Riverpod provider that
/// watches the configs notifier so it rebuilds on credential changes.
class LlmProviderRegistry {
  final Map<String, LlmProvider> _providers;

  LlmProviderRegistry(this._providers);

  /// Empty registry — used as a default before configs load.
  const LlmProviderRegistry.empty() : _providers = const {};

  List<LlmProvider> get providers => List.unmodifiable(_providers.values);

  LlmProvider? byId(String providerId) => _providers[providerId];

  /// Flat list of all models exposed by configured providers.
  List<LlmModel> get allModels =>
      _providers.values.expand((p) => p.models).toList();

  LlmProvider? providerForModel(LlmModel model) => _providers[model.providerId];
}
