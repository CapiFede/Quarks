import 'dart:async';
import 'dart:io';

import 'package:extension_google_sign_in_as_googleapis_auth/extension_google_sign_in_as_googleapis_auth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:googleapis/drive/v3.dart' as drive;
import 'package:googleapis_auth/auth_io.dart' as auth_io;
import 'package:http/http.dart' as http;

import 'drive_config.dart';

class DriveAuthCancelledException implements Exception {
  const DriveAuthCancelledException();
}

abstract class DriveAuthService {
  String? get connectedEmail;

  /// Restore session from persisted credentials. Safe to call before connect();
  /// resolves quickly with `connectedEmail == null` if no session exists.
  Future<void> initialize();

  /// Starts the OAuth flow. [onAuthUrl] is called with the authorization URL
  /// instead of launching the browser automatically — the caller decides how
  /// to present it.
  Future<void> connect({required void Function(String url) onAuthUrl});

  /// Aborts an in-progress [connect] call. Throws [DriveAuthCancelledException].
  void cancelConnect();

  Future<void> disconnect();

  /// Returns an HTTP client authorized for Drive API calls, or null when not
  /// connected. The client refreshes tokens automatically.
  Future<http.Client?> getAuthenticatedClient();

  factory DriveAuthService.create() {
    if (Platform.isAndroid) return AndroidDriveAuthService();
    return DesktopDriveAuthService();
  }
}

class DesktopDriveAuthService implements DriveAuthService {
  static const _refreshTokenKey = 'quarks_drive_refresh_token';
  static const _emailKey = 'quarks_drive_email';

  final _storage = const FlutterSecureStorage();
  final _clientId = auth_io.ClientId(
    DriveConfig.desktopClientId,
    DriveConfig.desktopClientSecret,
  );

  auth_io.AutoRefreshingAuthClient? _client;
  String? _email;
  Completer<void>? _cancelCompleter;
  bool _cancelled = false;

  @override
  String? get connectedEmail => _email;

  @override
  Future<void> initialize() async {
    final refreshToken = await _storage.read(key: _refreshTokenKey);
    _email = await _storage.read(key: _emailKey);
    if (refreshToken == null) return;

    try {
      final expired = auth_io.AccessCredentials(
        auth_io.AccessToken(
          'Bearer',
          '',
          DateTime.now().toUtc().subtract(const Duration(days: 1)),
        ),
        refreshToken,
        DriveConfig.scopes,
      );
      final fresh =
          await auth_io.refreshCredentials(_clientId, expired, http.Client());
      _client = auth_io.autoRefreshingClient(_clientId, fresh, http.Client());
    } catch (_) {
      await _storage.delete(key: _refreshTokenKey);
      await _storage.delete(key: _emailKey);
      _email = null;
    }
  }

  @override
  Future<void> connect({required void Function(String url) onAuthUrl}) async {
    _cancelled = false;
    _cancelCompleter = Completer<void>();

    auth_io.AutoRefreshingAuthClient? client;
    await Future.any([
      auth_io
          .clientViaUserConsent(
            _clientId,
            DriveConfig.scopes,
            (url) async => onAuthUrl(url),
          )
          .then((c) => client = c),
      _cancelCompleter!.future,
    ]);

    if (_cancelled) throw const DriveAuthCancelledException();

    _client = client!;

    final refresh = _client!.credentials.refreshToken;
    if (refresh != null) {
      await _storage.write(key: _refreshTokenKey, value: refresh);
    }

    final api = drive.DriveApi(_client!);
    final about = await api.about.get($fields: 'user/emailAddress');
    _email = about.user?.emailAddress;
    if (_email != null) {
      await _storage.write(key: _emailKey, value: _email!);
    }
  }

  @override
  void cancelConnect() {
    _cancelled = true;
    if (_cancelCompleter != null && !_cancelCompleter!.isCompleted) {
      _cancelCompleter!.complete();
    }
  }

  @override
  Future<void> disconnect() async {
    _client?.close();
    _client = null;
    _email = null;
    await _storage.delete(key: _refreshTokenKey);
    await _storage.delete(key: _emailKey);
  }

  @override
  Future<http.Client?> getAuthenticatedClient() async => _client;
}

class AndroidDriveAuthService implements DriveAuthService {
  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: DriveConfig.scopes);
  GoogleSignInAccount? _account;

  @override
  String? get connectedEmail => _account?.email;

  @override
  Future<void> initialize() async {
    try {
      _account = await _googleSignIn.signInSilently();
    } catch (_) {
      _account = null;
    }
  }

  @override
  Future<void> connect({required void Function(String url) onAuthUrl}) async {
    final account = await _googleSignIn.signIn();
    if (account == null) throw Exception('Inicio de sesión cancelado');
    _account = account;
  }

  @override
  void cancelConnect() {}

  @override
  Future<void> disconnect() async {
    await _googleSignIn.signOut();
    _account = null;
  }

  @override
  Future<http.Client?> getAuthenticatedClient() async {
    if (_account == null) return null;
    return _googleSignIn.authenticatedClient();
  }
}
