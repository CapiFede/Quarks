/// Template for drive_config.dart (which is gitignored).
///
/// To enable Drive sync locally:
/// 1. Copy this file to `lib/drive_config.dart`.
/// 2. Replace placeholder values with credentials from Google Cloud Console:
///    https://console.cloud.google.com/apis/credentials
/// 3. The Android OAuth client must be configured in Cloud Console with the
///    SHA-1 of your signing keystore. Run `cd android && ./gradlew signingReport`
///    to obtain the SHA-1 of the debug keystore.
class DriveConfig {
  static const desktopClientId = 'YOUR_DESKTOP_CLIENT_ID.apps.googleusercontent.com';
  static const desktopClientSecret = 'YOUR_DESKTOP_CLIENT_SECRET';

  static const androidClientId = 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';

  static const scopes = ['https://www.googleapis.com/auth/drive.file'];
}
