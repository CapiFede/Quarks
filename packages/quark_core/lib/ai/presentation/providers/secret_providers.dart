import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/llm/auth/claude_oauth_service.dart';
import '../../data/repositories/secret_store.dart';
import '../../domain/provider_config.dart';

const List<String> kAiProviderIds = [
  'anthropic',
  'google',
  'ollama',
];

final claudeOauthServiceProvider = Provider<ClaudeOauthService>(
  (ref) => ClaudeOauthService(),
);

final secretStoreProvider = Provider<SecretStore>((ref) => SecretStore());

/// All configured provider credentials. Empty map if nothing is configured yet.
/// Rebuilds the LLM registry when this changes.
final providerConfigsProvider =
    AsyncNotifierProvider<ProviderConfigsNotifier, Map<String, ProviderConfig>>(
  ProviderConfigsNotifier.new,
);

class ProviderConfigsNotifier
    extends AsyncNotifier<Map<String, ProviderConfig>> {
  @override
  Future<Map<String, ProviderConfig>> build() async {
    final store = ref.read(secretStoreProvider);
    final result = <String, ProviderConfig>{};
    for (final id in kAiProviderIds) {
      final config = await store.readConfig(id);
      if (config != null) result[id] = config;
    }
    return result;
  }

  Future<void> setApiKey(String providerId, String? apiKey) async {
    final store = ref.read(secretStoreProvider);
    await store.writeApiKey(providerId, apiKey);
    ref.invalidateSelf();
    await future;
  }

  Future<void> setOauth(
    String providerId, {
    required String accessToken,
    String? refreshToken,
    DateTime? expiresAt,
    String? accountLabel,
  }) async {
    final store = ref.read(secretStoreProvider);
    await store.writeOauth(
      providerId,
      accessToken: accessToken,
      refreshToken: refreshToken,
      expiresAt: expiresAt,
      accountLabel: accountLabel,
    );
    ref.invalidateSelf();
    await future;
  }

  Future<void> setBaseUrl(String providerId, String? baseUrl) async {
    final store = ref.read(secretStoreProvider);
    await store.writeBaseUrl(providerId, baseUrl);
    ref.invalidateSelf();
    await future;
  }

  Future<void> clearProvider(String providerId) async {
    final store = ref.read(secretStoreProvider);
    await store.clearProvider(providerId);
    ref.invalidateSelf();
    await future;
  }
}
