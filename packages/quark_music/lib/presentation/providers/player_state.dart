import '../../domain/entities/track.dart';

enum PlaybackStatus { stopped, playing, paused }

class PlayerState {
  final Track? currentTrack;
  final Track? selectedTrack;
  final int currentIndex;
  final PlaybackStatus status;
  final Duration position;
  final Duration duration;
  final double volume;
  final List<Track> playingTracks;
  final bool shuffle;
  final Set<int> playedIndices;
  final bool loop;
  final List<int> playbackHistory;

  const PlayerState({
    this.currentTrack,
    this.selectedTrack,
    this.currentIndex = -1,
    this.status = PlaybackStatus.stopped,
    this.position = Duration.zero,
    this.duration = Duration.zero,
    this.volume = 1.0,
    this.playingTracks = const [],
    this.shuffle = false,
    this.playedIndices = const {},
    this.loop = false,
    this.playbackHistory = const [],
  });

  PlayerState copyWith({
    Track? currentTrack,
    Track? selectedTrack,
    int? currentIndex,
    PlaybackStatus? status,
    Duration? position,
    Duration? duration,
    double? volume,
    List<Track>? playingTracks,
    bool? shuffle,
    Set<int>? playedIndices,
    bool? loop,
    List<int>? playbackHistory,
  }) {
    return PlayerState(
      currentTrack: currentTrack ?? this.currentTrack,
      selectedTrack: selectedTrack ?? this.selectedTrack,
      currentIndex: currentIndex ?? this.currentIndex,
      status: status ?? this.status,
      position: position ?? this.position,
      duration: duration ?? this.duration,
      volume: volume ?? this.volume,
      playingTracks: playingTracks ?? this.playingTracks,
      shuffle: shuffle ?? this.shuffle,
      playedIndices: playedIndices ?? this.playedIndices,
      loop: loop ?? this.loop,
      playbackHistory: playbackHistory ?? this.playbackHistory,
    );
  }

  bool get hasNext =>
      shuffle ? playedIndices.length < playingTracks.length : currentIndex < playingTracks.length - 1;
  bool get hasPrevious => playbackHistory.isNotEmpty;
  bool get isPlaying => status == PlaybackStatus.playing;

  /// The track shown in the player bar (selected if any, otherwise current).
  Track? get displayTrack => selectedTrack ?? currentTrack;

  /// Whether the selected track is different from the currently playing one.
  bool get selectedDiffersFromCurrent =>
      selectedTrack != null && selectedTrack!.path != currentTrack?.path;
}
