import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/services/binary_manager.dart';
import '../../data/services/ytdlp_service.dart';
import 'download_state.dart';
import 'library_providers.dart';
import 'song_info_providers.dart';

final binaryManagerProvider = Provider<BinaryManager>((ref) {
  return BinaryManager();
});

final ytdlpServiceProvider = Provider<YtdlpService>((ref) {
  return YtdlpService(ref.read(binaryManagerProvider));
});

final downloadProvider =
    NotifierProvider<DownloadNotifier, DownloadState>(DownloadNotifier.new);

class DownloadNotifier extends Notifier<DownloadState> {
  StreamSubscription<dynamic>? _downloadSub;
  StreamSubscription<dynamic>? _setupSub;

  @override
  DownloadState build() {
    ref.onDispose(() {
      _downloadSub?.cancel();
      _setupSub?.cancel();
    });
    _checkBinaries();
    return const DownloadState();
  }

  Future<void> _checkBinaries() async {
    final manager = ref.read(binaryManagerProvider);
    final ready = await manager.areBinariesReady();
    if (ready) {
      state = state.copyWith(binariesReady: true);
    } else {
      setupBinaries();
    }
  }

  void toggleDrawer() {
    if (!state.drawerOpen) {
      ref.read(songInfoProvider.notifier).closeDrawer();
    }
    state = state.copyWith(
      drawerOpen: !state.drawerOpen,
      clearError: true,
      clearSuccess: true,
    );
  }

  void closeDrawer() {
    state = state.copyWith(drawerOpen: false);
  }

  void setUrl(String url) {
    state = state.copyWith(url: url, clearError: true, clearSuccess: true, clearVideoInfo: true);
  }

  Future<void> scanUrl() async {
    if (state.url.isEmpty || state.isScanning) return;
    state = state.copyWith(isScanning: true, clearError: true, clearVideoInfo: true);

    final service = ref.read(ytdlpServiceProvider);
    final info = await service.scan(state.url);

    if (info == null) {
      state = state.copyWith(isScanning: false, errorMessage: 'Could not fetch video info');
      return;
    }

    state = state.copyWith(
      isScanning: false,
      videoInfo: info,
      customFilename: info.isPlaylist ? null : info.title,
    );
  }

  void setCustomFilename(String? name) {
    if (name == null || name.isEmpty) {
      state = state.copyWith(clearCustomFilename: true);
    } else {
      state = state.copyWith(customFilename: name);
    }
  }

  void togglePlaylist(String playlistId) {
    final current = Set<String>.from(state.selectedPlaylistIds);
    if (current.contains(playlistId)) {
      current.remove(playlistId);
    } else {
      current.add(playlistId);
    }
    state = state.copyWith(selectedPlaylistIds: current);
  }

  Future<void> setupBinaries() async {
    if (state.isSettingUp) return;
    state = state.copyWith(isSettingUp: true, clearError: true);

    final manager = ref.read(binaryManagerProvider);
    _setupSub?.cancel();
    _setupSub = manager.ensureBinaries().listen(
      (progress) {
        state = state.copyWith(setupProgress: progress);
        if (progress.phase == BinarySetupPhase.done) {
          state = state.copyWith(
            binariesReady: true,
            isSettingUp: false,
            clearSetupProgress: true,
          );
        } else if (progress.phase == BinarySetupPhase.error) {
          state = state.copyWith(
            isSettingUp: false,
            errorMessage: progress.error,
          );
        }
      },
      onError: (Object e) {
        state = state.copyWith(
          isSettingUp: false,
          errorMessage: e.toString(),
        );
      },
    );
  }

  Future<void> startDownload() async {
    if (state.isDownloading || state.url.isEmpty) return;

    final library = ref.read(libraryProvider).valueOrNull;
    final folder = library?.scannedFolder;
    if (folder == null) {
      state = state.copyWith(errorMessage: 'No folder selected. Pick a music folder first.');
      return;
    }

    state = state.copyWith(
      isDownloading: true,
      clearError: true,
      clearSuccess: true,
      clearProgress: true,
      downloadedPaths: [],
    );

    final service = ref.read(ytdlpServiceProvider);
    _downloadSub?.cancel();
    _downloadSub = service
        .download(
          url: state.url,
          outputFolder: folder,
          customFilename: state.customFilename,
        )
        .listen(
      (progress) {
        state = state.copyWith(progress: progress);

        if (progress.phase == DownloadPhase.done) {
          _onDownloadComplete(progress.completedPaths);
        } else if (progress.phase == DownloadPhase.error) {
          state = state.copyWith(
            isDownloading: false,
            errorMessage: progress.error,
          );
        }
      },
      onError: (Object e) {
        state = state.copyWith(
          isDownloading: false,
          errorMessage: e.toString(),
        );
      },
    );
  }

  Future<void> _onDownloadComplete(List<String> paths) async {
    // Rescan folder to pick up new tracks
    await ref.read(libraryProvider.notifier).rescanMusicFolder();

    // Add to selected playlists
    final libraryNotifier = ref.read(libraryProvider.notifier);
    for (final playlistId in state.selectedPlaylistIds) {
      await libraryNotifier.addTracksToPlaylist(playlistId, paths);
    }

    state = state.copyWith(
      isDownloading: false,
      downloadedPaths: paths,
      url: '',
      clearCustomFilename: true,
      successMessage: '${paths.length} track(s) downloaded',
      selectedPlaylistIds: {},
    );
  }

  void cancelDownload() {
    ref.read(ytdlpServiceProvider).cancel();
    _downloadSub?.cancel();
    state = state.copyWith(
      isDownloading: false,
      clearProgress: true,
      errorMessage: 'Download cancelled',
    );
  }
}
