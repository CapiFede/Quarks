enum ProviderAuthMode { apiKey, oauth, noAuth }

class ProviderConfig {
  final String providerId;
  final ProviderAuthMode authMode;
  final String? apiKey;
  final String? oauthAccessToken;
  final String? oauthRefreshToken;
  final DateTime? oauthExpiresAt;
  final String? oauthAccountLabel;
  final String? baseUrl;

  const ProviderConfig({
    required this.providerId,
    required this.authMode,
    this.apiKey,
    this.oauthAccessToken,
    this.oauthRefreshToken,
    this.oauthExpiresAt,
    this.oauthAccountLabel,
    this.baseUrl,
  });

  bool get isConfigured => switch (authMode) {
        ProviderAuthMode.apiKey =>
          apiKey != null && apiKey!.trim().isNotEmpty,
        ProviderAuthMode.oauth =>
          oauthAccessToken != null && oauthAccessToken!.isNotEmpty,
        ProviderAuthMode.noAuth => true,
      };

  ProviderConfig copyWith({
    ProviderAuthMode? authMode,
    String? apiKey,
    String? oauthAccessToken,
    String? oauthRefreshToken,
    DateTime? oauthExpiresAt,
    String? oauthAccountLabel,
    String? baseUrl,
  }) {
    return ProviderConfig(
      providerId: providerId,
      authMode: authMode ?? this.authMode,
      apiKey: apiKey ?? this.apiKey,
      oauthAccessToken: oauthAccessToken ?? this.oauthAccessToken,
      oauthRefreshToken: oauthRefreshToken ?? this.oauthRefreshToken,
      oauthExpiresAt: oauthExpiresAt ?? this.oauthExpiresAt,
      oauthAccountLabel: oauthAccountLabel ?? this.oauthAccountLabel,
      baseUrl: baseUrl ?? this.baseUrl,
    );
  }
}
