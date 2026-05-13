import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../domain/provider_config.dart';

/// Thin wrapper over [FlutterSecureStorage] with namespaced keys for the AI
/// layer. Keeps secret-related code in one place so we don't sprinkle raw
/// `_storage.read('quarks.ai...')` calls all over.
class SecretStore {
  static const _prefix = 'quarks.ai';
  final FlutterSecureStorage _storage;

  SecretStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  String _key(String providerId, String suffix) =>
      '$_prefix.$providerId.$suffix';

  Future<ProviderConfig?> readConfig(String providerId) async {
    // Ollama needs no API key — always return a config (using stored base URL
    // if present, otherwise the provider defaults to localhost).
    if (providerId == 'ollama') {
      final baseUrl =
          await _storage.read(key: _key(providerId, 'base_url'));
      return ProviderConfig(
        providerId: providerId,
        authMode: ProviderAuthMode.noAuth,
        baseUrl: baseUrl,
      );
    }

    final apiKey = await _storage.read(key: _key(providerId, 'api_key'));
    final oauthAccess =
        await _storage.read(key: _key(providerId, 'oauth_access_token'));
    final oauthRefresh =
        await _storage.read(key: _key(providerId, 'oauth_refresh_token'));
    final oauthExpiresRaw =
        await _storage.read(key: _key(providerId, 'oauth_expires_at'));
    final oauthLabel =
        await _storage.read(key: _key(providerId, 'oauth_account'));

    if (apiKey == null && oauthAccess == null) return null;

    final mode = oauthAccess != null
        ? ProviderAuthMode.oauth
        : ProviderAuthMode.apiKey;

    return ProviderConfig(
      providerId: providerId,
      authMode: mode,
      apiKey: apiKey,
      oauthAccessToken: oauthAccess,
      oauthRefreshToken: oauthRefresh,
      oauthExpiresAt:
          oauthExpiresRaw != null ? DateTime.tryParse(oauthExpiresRaw) : null,
      oauthAccountLabel: oauthLabel,
    );
  }

  Future<void> writeApiKey(String providerId, String? apiKey) async {
    final key = _key(providerId, 'api_key');
    if (apiKey == null || apiKey.isEmpty) {
      await _storage.delete(key: key);
    } else {
      await _storage.write(key: key, value: apiKey);
    }
  }

  Future<void> writeOauth(
    String providerId, {
    required String accessToken,
    String? refreshToken,
    DateTime? expiresAt,
    String? accountLabel,
  }) async {
    await _storage.write(
        key: _key(providerId, 'oauth_access_token'), value: accessToken);
    if (refreshToken != null) {
      await _storage.write(
          key: _key(providerId, 'oauth_refresh_token'), value: refreshToken);
    }
    if (expiresAt != null) {
      await _storage.write(
          key: _key(providerId, 'oauth_expires_at'),
          value: expiresAt.toIso8601String());
    }
    if (accountLabel != null) {
      await _storage.write(
          key: _key(providerId, 'oauth_account'), value: accountLabel);
    }
  }

  Future<void> writeBaseUrl(String providerId, String? baseUrl) async {
    final key = _key(providerId, 'base_url');
    if (baseUrl == null || baseUrl.isEmpty) {
      await _storage.delete(key: key);
    } else {
      await _storage.write(key: key, value: baseUrl);
    }
  }

  Future<void> clearProvider(String providerId) async {
    await _storage.delete(key: _key(providerId, 'api_key'));
    await _storage.delete(key: _key(providerId, 'oauth_access_token'));
    await _storage.delete(key: _key(providerId, 'oauth_refresh_token'));
    await _storage.delete(key: _key(providerId, 'oauth_expires_at'));
    await _storage.delete(key: _key(providerId, 'oauth_account'));
    await _storage.delete(key: _key(providerId, 'base_url'));
  }
}
