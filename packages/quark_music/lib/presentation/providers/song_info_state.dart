import '../../domain/entities/track.dart';

class SongInfoState {
  final bool drawerOpen;
  final Track? track;
  final String? editedTitle;
  final bool isRenaming;
  final bool isTrimming;
  final Duration? trimStart;
  final Duration? trimEnd;
  final Duration? trackDuration;
  final String? errorMessage;
  final String? successMessage;

  const SongInfoState({
    this.drawerOpen = false,
    this.track,
    this.editedTitle,
    this.isRenaming = false,
    this.isTrimming = false,
    this.trimStart,
    this.trimEnd,
    this.trackDuration,
    this.errorMessage,
    this.successMessage,
  });

  SongInfoState copyWith({
    bool? drawerOpen,
    Track? track,
    bool clearTrack = false,
    String? editedTitle,
    bool clearEditedTitle = false,
    bool? isRenaming,
    bool? isTrimming,
    Duration? trimStart,
    bool clearTrimStart = false,
    Duration? trimEnd,
    bool clearTrimEnd = false,
    Duration? trackDuration,
    bool clearTrackDuration = false,
    String? errorMessage,
    bool clearError = false,
    String? successMessage,
    bool clearSuccess = false,
  }) {
    return SongInfoState(
      drawerOpen: drawerOpen ?? this.drawerOpen,
      track: clearTrack ? null : (track ?? this.track),
      editedTitle: clearEditedTitle ? null : (editedTitle ?? this.editedTitle),
      isRenaming: isRenaming ?? this.isRenaming,
      isTrimming: isTrimming ?? this.isTrimming,
      trimStart: clearTrimStart ? null : (trimStart ?? this.trimStart),
      trimEnd: clearTrimEnd ? null : (trimEnd ?? this.trimEnd),
      trackDuration: clearTrackDuration ? null : (trackDuration ?? this.trackDuration),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      successMessage: clearSuccess ? null : (successMessage ?? this.successMessage),
    );
  }
}
