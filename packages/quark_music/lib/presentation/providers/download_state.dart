import '../../data/services/binary_manager.dart';
import '../../data/services/ytdlp_service.dart';

class DownloadState {
  final bool drawerOpen;
  final String url;
  final String? customFilename;
  final Set<String> selectedPlaylistIds;
  final bool isDownloading;
  final DownloadProgress? progress;
  final List<String> downloadedPaths;
  final String? errorMessage;
  final String? successMessage;

  // Scan info
  final bool isScanning;
  final VideoInfo? videoInfo;

  // Binary setup
  final bool binariesReady;
  final bool isSettingUp;
  final BinarySetupProgress? setupProgress;

  const DownloadState({
    this.drawerOpen = false,
    this.url = '',
    this.customFilename,
    this.selectedPlaylistIds = const {},
    this.isDownloading = false,
    this.progress,
    this.downloadedPaths = const [],
    this.errorMessage,
    this.successMessage,
    this.isScanning = false,
    this.videoInfo,
    this.binariesReady = false,
    this.isSettingUp = false,
    this.setupProgress,
  });

  bool get isScanned => videoInfo != null;

  DownloadState copyWith({
    bool? drawerOpen,
    String? url,
    String? customFilename,
    bool clearCustomFilename = false,
    Set<String>? selectedPlaylistIds,
    bool? isDownloading,
    DownloadProgress? progress,
    bool clearProgress = false,
    List<String>? downloadedPaths,
    String? errorMessage,
    bool clearError = false,
    String? successMessage,
    bool clearSuccess = false,
    bool? isScanning,
    VideoInfo? videoInfo,
    bool clearVideoInfo = false,
    bool? binariesReady,
    bool? isSettingUp,
    BinarySetupProgress? setupProgress,
    bool clearSetupProgress = false,
  }) {
    return DownloadState(
      drawerOpen: drawerOpen ?? this.drawerOpen,
      url: url ?? this.url,
      customFilename: clearCustomFilename ? null : (customFilename ?? this.customFilename),
      selectedPlaylistIds: selectedPlaylistIds ?? this.selectedPlaylistIds,
      isDownloading: isDownloading ?? this.isDownloading,
      progress: clearProgress ? null : (progress ?? this.progress),
      downloadedPaths: downloadedPaths ?? this.downloadedPaths,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      successMessage: clearSuccess ? null : (successMessage ?? this.successMessage),
      isScanning: isScanning ?? this.isScanning,
      videoInfo: clearVideoInfo ? null : (videoInfo ?? this.videoInfo),
      binariesReady: binariesReady ?? this.binariesReady,
      isSettingUp: isSettingUp ?? this.isSettingUp,
      setupProgress: clearSetupProgress ? null : (setupProgress ?? this.setupProgress),
    );
  }
}
