import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import 'claude_oauth_config.dart';

class ClaudeOauthCancelledException implements Exception {
  const ClaudeOauthCancelledException();
  @override
  String toString() => 'ClaudeOauthCancelledException';
}

class ClaudeOauthTokens {
  final String accessToken;
  final String? refreshToken;
  final DateTime? expiresAt;
  final String? accountLabel;

  const ClaudeOauthTokens({
    required this.accessToken,
    this.refreshToken,
    this.expiresAt,
    this.accountLabel,
  });
}

class ClaudeOauthService {
  Completer<void>? _cancelCompleter;
  bool _cancelled = false;

  /// Starts the PKCE OAuth flow. Opens the browser and waits for the local
  /// callback. Returns tokens on success.
  /// Throws [ClaudeOauthCancelledException] if [cancelConnect] was called.
  Future<ClaudeOauthTokens> connect() async {
    _cancelled = false;
    _cancelCompleter = Completer<void>();

    final verifier = _generateVerifier();
    final challenge = _generateChallenge(verifier);
    final state = _randomBase64Url(16);

    final authUrl = Uri.parse(kClaudeAuthorizeUrl).replace(
      queryParameters: {
        'response_type': 'code',
        'client_id': kClaudeClientId,
        'redirect_uri': kClaudeRedirectUri,
        'scope': kClaudeScopes.join(' '),
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
        'state': state,
      },
    );

    final server =
        await HttpServer.bind(InternetAddress.loopbackIPv4, 54545);

    await launchUrl(authUrl, mode: LaunchMode.externalApplication);

    late final String code;
    try {
      final result = await Future.any([
        server.first.then((req) async {
          final reqState = req.uri.queryParameters['state'];
          final reqCode = req.uri.queryParameters['code'];
          final error = req.uri.queryParameters['error'];

          final html = error != null
              ? '<html><body><h2>Error: $error</h2>'
                  '<p>Podés cerrar esta pestaña.</p></body></html>'
              : '<html><body><h2>Listo</h2>'
                  '<p>Podés cerrar esta pestaña.</p></body></html>';
          req.response
            ..statusCode = 200
            ..headers.set('Content-Type', 'text/html; charset=utf-8')
            ..write(html);
          await req.response.close();

          return (reqState == state && reqCode != null && error == null)
              ? reqCode
              : null;
        }),
        _cancelCompleter!.future.then((_) => null),
      ]);

      if (_cancelled) throw const ClaudeOauthCancelledException();
      if (result == null) {
        throw Exception('OAuth callback inválido o error del servidor');
      }
      code = result;
    } finally {
      await server.close(force: true);
    }

    return _exchangeCode(code, verifier);
  }

  void cancelConnect() {
    _cancelled = true;
    final c = _cancelCompleter;
    if (c != null && !c.isCompleted) c.complete();
  }

  /// Refreshes an expired access token. Returns null if refresh fails.
  Future<ClaudeOauthTokens?> refresh(String refreshToken) async {
    final response = await http.post(
      Uri.parse(kClaudeTokenUrl),
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: {
        'grant_type': 'refresh_token',
        'refresh_token': refreshToken,
        'client_id': kClaudeClientId,
      },
    );
    if (response.statusCode != 200) return null;
    return _parseTokenResponse(response.body, accountLabel: null);
  }

  Future<ClaudeOauthTokens> _exchangeCode(
      String code, String verifier) async {
    final response = await http.post(
      Uri.parse(kClaudeTokenUrl),
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': kClaudeRedirectUri,
        'client_id': kClaudeClientId,
        'code_verifier': verifier,
      },
    );

    if (response.statusCode != 200) {
      throw Exception(
          'Token exchange failed: ${response.statusCode} ${response.body}');
    }

    final tokens = _parseTokenResponse(response.body, accountLabel: null);

    // Try to fetch the account email for display.
    String? label;
    try {
      final profile = await http.get(
        Uri.parse('https://api.anthropic.com/v1/users/me'),
        headers: {
          'Authorization': 'Bearer ${tokens.accessToken}',
          'x-api-key': tokens.accessToken,
          'anthropic-beta': 'oauth-2025-04-20',
          'anthropic-version': '2023-06-01',
        },
      );
      if (profile.statusCode == 200) {
        final json = jsonDecode(profile.body) as Map<String, dynamic>;
        label = json['email'] as String?;
      }
    } catch (_) {}

    return ClaudeOauthTokens(
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      accountLabel: label,
    );
  }

  static ClaudeOauthTokens _parseTokenResponse(
    String body, {
    required String? accountLabel,
  }) {
    final json = jsonDecode(body) as Map<String, dynamic>;
    final access = json['access_token'] as String;
    final refresh = json['refresh_token'] as String?;
    final expiresIn = json['expires_in'] as int?;
    final expiresAt = expiresIn != null
        ? DateTime.now().toUtc().add(Duration(seconds: expiresIn))
        : null;
    return ClaudeOauthTokens(
      accessToken: access,
      refreshToken: refresh,
      expiresAt: expiresAt,
      accountLabel: accountLabel,
    );
  }

  static String _generateVerifier() {
    const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    final rng = Random.secure();
    return List.generate(64, (_) => chars[rng.nextInt(chars.length)]).join();
  }

  static String _generateChallenge(String verifier) {
    final bytes = utf8.encode(verifier);
    final digest = sha256.convert(bytes);
    return base64Url.encode(digest.bytes).replaceAll('=', '');
  }

  static String _randomBase64Url(int length) {
    final rng = Random.secure();
    final bytes = List<int>.generate(length, (_) => rng.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }
}
