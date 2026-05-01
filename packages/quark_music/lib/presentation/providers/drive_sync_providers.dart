import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../data/services/drive_auth_service.dart'
    show DriveAuthCancelledException, DriveAuthService;
import '../../data/services/drive_sync_service.dart';
import 'drive_sync_state.dart';
import 'library_providers.dart';

final driveAuthServiceProvider = Provider<DriveAuthService>((ref) {
  return DriveAuthService.create();
});

final driveSyncServiceProvider = Provider<DriveSyncService>((ref) {
  return DriveSyncService(ref.read(driveAuthServiceProvider));
});

final driveSyncProvider =
    NotifierProvider<DriveSyncNotifier, DriveSyncState>(DriveSyncNotifier.new);

class DriveSyncNotifier extends Notifier<DriveSyncState> {
  late final DriveAuthService _auth;
  StreamSubscription<SyncProgress>? _syncSub;

  @override
  DriveSyncState build() {
    _auth = ref.read(driveAuthServiceProvider);
    ref.onDispose(() => _syncSub?.cancel());
    _initialize();
    return const DriveSyncState();
  }

  Future<void> _initialize() async {
    try {
      await _auth.initialize();
      state = state.copyWith(
        isInitializing: false,
        connectedEmail: _auth.connectedEmail,
      );
    } catch (e) {
      state = state.copyWith(
        isInitializing: false,
        errorMessage: e.toString(),
      );
    }
  }

  void toggleDrawer() {
    state = state.copyWith(
      drawerOpen: !state.drawerOpen,
      clearError: true,
      clearSuccess: true,
    );
  }

  void closeDrawer() {
    state = state.copyWith(drawerOpen: false);
  }

  Future<void> connect() async {
    if (state.isConnecting) return;
    state = state.copyWith(
      isConnecting: true,
      clearError: true,
      clearSuccess: true,
      clearAuthUrl: true,
    );
    try {
      await _auth.connect(
        onAuthUrl: (url) => state = state.copyWith(authUrl: url),
      );
      state = state.copyWith(
        isConnecting: false,
        clearAuthUrl: true,
        connectedEmail: _auth.connectedEmail,
        successMessage: 'Conectado',
      );
    } on DriveAuthCancelledException {
      state = state.copyWith(
        isConnecting: false,
        clearAuthUrl: true,
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(
        isConnecting: false,
        clearAuthUrl: true,
        errorMessage: e.toString(),
      );
    }
  }

  void cancelConnect() {
    _auth.cancelConnect();
  }

  Future<void> disconnect() async {
    try {
      await _auth.disconnect();
      state = state.copyWith(
        clearConnectedEmail: true,
        successMessage: 'Desconectado',
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(errorMessage: e.toString());
    }
  }

  Future<void> syncNow() async {
    if (state.isSyncing) return;

    final storage = ref.read(playlistStorageServiceProvider);
    final musicDir = await storage.musicDirPath;
    final playlistsDir = await storage.playlistsDirPath;

    state = state.copyWith(
      isSyncing: true,
      clearError: true,
      clearSuccess: true,
      clearSyncProgress: true,
    );

    WakelockPlus.enable();

    _syncSub?.cancel();
    _syncSub = ref
        .read(driveSyncServiceProvider)
        .sync(musicDirPath: musicDir, playlistsDirPath: playlistsDir)
        .listen(
          (progress) {
            state = state.copyWith(syncProgress: progress);
            if (progress.phase == SyncPhase.done) {
              WakelockPlus.disable();
              _onSyncDone(progress.title);
            } else if (progress.phase == SyncPhase.error) {
              WakelockPlus.disable();
              state = state.copyWith(
                isSyncing: false,
                errorMessage: progress.error,
                clearSyncProgress: true,
              );
            }
          },
          onError: (Object e) {
            WakelockPlus.disable();
            state = state.copyWith(
              isSyncing: false,
              errorMessage: e.toString(),
              clearSyncProgress: true,
            );
          },
        );
  }

  Future<void> _onSyncDone(String label) async {
    ref.invalidate(libraryProvider);
    state = state.copyWith(
      isSyncing: false,
      clearSyncProgress: true,
      successMessage: label,
    );
  }
}
