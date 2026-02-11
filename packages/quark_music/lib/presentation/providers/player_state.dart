import '../../domain/entities/track.dart';

enum PlaybackStatus { stopped, playing, paused }

class PlayerState {
  final List<Track> tracks;
  final Track? currentTrack;
  final int currentIndex;
  final PlaybackStatus status;
  final Duration position;
  final Duration duration;
  final double volume;
  final bool isScanning;
  final String? scannedFolder;

  const PlayerState({
    this.tracks = const [],
    this.currentTrack,
    this.currentIndex = -1,
    this.status = PlaybackStatus.stopped,
    this.position = Duration.zero,
    this.duration = Duration.zero,
    this.volume = 1.0,
    this.isScanning = false,
    this.scannedFolder,
  });

  PlayerState copyWith({
    List<Track>? tracks,
    Track? currentTrack,
    int? currentIndex,
    PlaybackStatus? status,
    Duration? position,
    Duration? duration,
    double? volume,
    bool? isScanning,
    String? scannedFolder,
  }) {
    return PlayerState(
      tracks: tracks ?? this.tracks,
      currentTrack: currentTrack ?? this.currentTrack,
      currentIndex: currentIndex ?? this.currentIndex,
      status: status ?? this.status,
      position: position ?? this.position,
      duration: duration ?? this.duration,
      volume: volume ?? this.volume,
      isScanning: isScanning ?? this.isScanning,
      scannedFolder: scannedFolder ?? this.scannedFolder,
    );
  }

  bool get hasTracks => tracks.isNotEmpty;
  bool get hasNext => currentIndex < tracks.length - 1;
  bool get hasPrevious => currentIndex > 0;
  bool get isPlaying => status == PlaybackStatus.playing;
}
