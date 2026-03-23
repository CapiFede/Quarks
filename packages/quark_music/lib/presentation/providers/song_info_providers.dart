import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/services/audio_edit_service.dart';
import '../../domain/entities/track.dart';
import 'download_providers.dart';
import 'library_providers.dart';
import 'music_providers.dart';
import 'song_info_state.dart';

final audioEditServiceProvider = Provider<AudioEditService>((ref) {
  return AudioEditService(ref.read(binaryManagerProvider));
});

final songInfoProvider =
    NotifierProvider<SongInfoNotifier, SongInfoState>(SongInfoNotifier.new);

class SongInfoNotifier extends Notifier<SongInfoState> {
  @override
  SongInfoState build() => const SongInfoState();

  Future<void> openDrawer(Track track) async {
    // Close download drawer
    ref.read(downloadProvider.notifier).closeDrawer();

    state = SongInfoState(
      drawerOpen: true,
      track: track,
      editedTitle: track.title,
    );

    // Probe duration in background
    final service = ref.read(audioEditServiceProvider);
    final duration = await service.probeDuration(track.path);
    if (duration != null && state.track?.path == track.path) {
      state = state.copyWith(
        trackDuration: duration,
        trimEnd: duration,
      );
    }
  }

  void closeDrawer() {
    state = const SongInfoState();
  }

  void setEditedTitle(String title) {
    state = state.copyWith(editedTitle: title, clearError: true, clearSuccess: true);
  }

  void setTrimStart(Duration d) {
    state = state.copyWith(trimStart: d, clearError: true, clearSuccess: true);
  }

  void setTrimEnd(Duration d) {
    state = state.copyWith(trimEnd: d, clearError: true, clearSuccess: true);
  }

  Future<void> applyRename() async {
    final track = state.track;
    final newTitle = state.editedTitle?.trim();
    if (track == null || newTitle == null || newTitle.isEmpty) return;
    if (newTitle == track.title) return;

    state = state.copyWith(isRenaming: true, clearError: true, clearSuccess: true);

    try {
      final oldPath = track.path;
      final dir = oldPath.substring(0, oldPath.lastIndexOf(RegExp(r'[/\\]')));
      final ext = oldPath.substring(oldPath.lastIndexOf('.'));
      final sanitized = newTitle.replaceAll(RegExp(r'[<>:"/\\|?*]'), '_');
      final newPath = '$dir${Platform.pathSeparator}$sanitized$ext';

      if (File(newPath).existsSync()) {
        state = state.copyWith(isRenaming: false, errorMessage: 'A file with that name already exists');
        return;
      }

      // Stop playback if this track is playing
      final player = ref.read(playerProvider);
      final wasPlaying = player.currentTrack?.path == oldPath;
      if (wasPlaying) {
        await ref.read(audioServiceProvider).stop();
      }

      await File(oldPath).rename(newPath);
      await ref.read(libraryProvider.notifier).updateTrackPath(oldPath, newPath);

      final newTrack = Track.fromPath(newPath);
      state = state.copyWith(
        isRenaming: false,
        track: newTrack,
        editedTitle: newTrack.title,
        successMessage: 'Renamed',
      );
    } catch (e) {
      state = state.copyWith(isRenaming: false, errorMessage: 'Rename failed: $e');
    }
  }

  Future<void> applyTrim() async {
    final track = state.track;
    final duration = state.trackDuration;
    if (track == null || duration == null) return;

    final start = state.trimStart ?? Duration.zero;
    final end = state.trimEnd ?? duration;

    if (start >= end) {
      state = state.copyWith(errorMessage: 'Invalid trim range');
      return;
    }
    if (start == Duration.zero && end == duration) {
      state = state.copyWith(errorMessage: 'Nothing to trim');
      return;
    }

    state = state.copyWith(isTrimming: true, clearError: true, clearSuccess: true);

    try {
      // Stop playback if this track is playing
      final player = ref.read(playerProvider);
      if (player.currentTrack?.path == track.path) {
        await ref.read(audioServiceProvider).stop();
      }

      final service = ref.read(audioEditServiceProvider);
      final success = await service.trimAudio(track.path, start, end);

      if (!success) {
        state = state.copyWith(isTrimming: false, errorMessage: 'Trim failed');
        return;
      }

      // Re-probe duration
      final newDuration = await service.probeDuration(track.path);
      state = state.copyWith(
        isTrimming: false,
        trackDuration: newDuration,
        trimStart: Duration.zero,
        trimEnd: newDuration,
        successMessage: 'Trimmed',
        clearTrimStart: true,
      );
      if (newDuration != null) {
        state = state.copyWith(trimEnd: newDuration);
      }
    } catch (e) {
      state = state.copyWith(isTrimming: false, errorMessage: 'Trim failed: $e');
    }
  }
}
