import '../../data/services/drive_sync_service.dart';

class DriveSyncState {
  final bool drawerOpen;
  final bool isInitializing;
  final bool isConnecting;
  final bool isSyncing;
  final String? connectedEmail;
  final String? authUrl;
  final SyncProgress? syncProgress;
  final String? errorMessage;
  final String? successMessage;

  const DriveSyncState({
    this.drawerOpen = false,
    this.isInitializing = true,
    this.isConnecting = false,
    this.isSyncing = false,
    this.connectedEmail,
    this.authUrl,
    this.syncProgress,
    this.errorMessage,
    this.successMessage,
  });

  bool get isConnected => connectedEmail != null;

  DriveSyncState copyWith({
    bool? drawerOpen,
    bool? isInitializing,
    bool? isConnecting,
    bool? isSyncing,
    String? connectedEmail,
    bool clearConnectedEmail = false,
    String? authUrl,
    bool clearAuthUrl = false,
    SyncProgress? syncProgress,
    bool clearSyncProgress = false,
    String? errorMessage,
    bool clearError = false,
    String? successMessage,
    bool clearSuccess = false,
  }) {
    return DriveSyncState(
      drawerOpen: drawerOpen ?? this.drawerOpen,
      isInitializing: isInitializing ?? this.isInitializing,
      isConnecting: isConnecting ?? this.isConnecting,
      isSyncing: isSyncing ?? this.isSyncing,
      connectedEmail: clearConnectedEmail
          ? null
          : (connectedEmail ?? this.connectedEmail),
      authUrl: clearAuthUrl ? null : (authUrl ?? this.authUrl),
      syncProgress:
          clearSyncProgress ? null : (syncProgress ?? this.syncProgress),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      successMessage:
          clearSuccess ? null : (successMessage ?? this.successMessage),
    );
  }
}
