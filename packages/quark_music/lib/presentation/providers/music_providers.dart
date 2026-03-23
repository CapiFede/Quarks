import 'dart:async';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart' as ja;

import '../../data/repositories/music_repository_impl.dart';
import '../../data/services/audio_service.dart';
import '../../domain/entities/track.dart';
import '../../domain/repositories/music_repository.dart';
import 'library_providers.dart';
import 'player_state.dart';

final musicRepositoryProvider = Provider<MusicRepository>((ref) {
  return MusicRepositoryImpl();
});

final audioServiceProvider = Provider<AudioService>((ref) {
  final service = AudioService();
  ref.onDispose(() => service.dispose());
  return service;
});

final playerProvider =
    NotifierProvider<PlayerNotifier, PlayerState>(PlayerNotifier.new);

class PlayerNotifier extends Notifier<PlayerState> {
  late final AudioService _audio;
  final List<StreamSubscription<dynamic>> _subs = [];
  ja.ProcessingState? _lastProcessingState;

  @override
  PlayerState build() {
    _audio = ref.read(audioServiceProvider);

    _subs.add(_audio.positionStream.listen((pos) {
      state = state.copyWith(position: pos);
    }));

    _subs.add(_audio.durationStream.listen((dur) {
      if (dur != null) {
        state = state.copyWith(duration: dur);
      }
    }));

    _subs.add(_audio.playerStateStream.listen((playerState) {
      final processing = playerState.processingState;
      if (processing == ja.ProcessingState.completed &&
          _lastProcessingState != ja.ProcessingState.completed) {
        _onTrackCompleted();
      }
      _lastProcessingState = processing;
    }));

    _subs.add(_audio.playingStream.listen((playing) {
      state = state.copyWith(
        status: playing ? PlaybackStatus.playing : PlaybackStatus.paused,
      );
    }));

    ref.onDispose(() {
      for (final sub in _subs) {
        sub.cancel();
      }
    });

    return const PlayerState();
  }

  void selectTrack(Track track) {
    final tracks = ref.read(visibleTracksProvider);
    state = state.copyWith(
      selectedTrack: track,
      playingTracks: tracks,
    );
  }

  Future<void> playTrack(Track track) async {
    final tracks = ref.read(visibleTracksProvider);
    final index = tracks.indexOf(track);
    state = state.copyWith(
      currentTrack: track,
      selectedTrack: track,
      currentIndex: index,
      playingTracks: tracks,
      status: PlaybackStatus.playing,
      playedIndices: {index},
    );
    await _audio.play(track);
  }

  Future<void> playAtIndex(int index) async {
    if (index < 0 || index >= state.playingTracks.length) return;
    final track = state.playingTracks[index];
    _lastProcessingState = null;
    state = state.copyWith(
      currentTrack: track,
      selectedTrack: track,
      currentIndex: index,
      status: PlaybackStatus.playing,
    );
    _lastProcessingState = null;
    await _audio.play(track);
  }

  Future<void> togglePlayPause() async {
    final display = state.displayTrack;
    if (display == null) return;

    // If selected track differs from current, start playing the selected one
    if (state.selectedDiffersFromCurrent) {
      await playTrack(display);
      return;
    }

    if (_audio.isPlaying) {
      await _audio.pause();
    } else {
      await _audio.resume();
    }
  }

  Future<void> next() async {
    if (!state.hasNext) return;

    if (state.shuffle) {
      await _playRandomUnplayed();
    } else {
      await playAtIndex(state.currentIndex + 1);
    }
  }

  Future<void> previous() async {
    if (_audio.position.inSeconds > 3) {
      await _audio.seek(Duration.zero);
      return;
    }
    if (state.hasPrevious) {
      await playAtIndex(state.currentIndex - 1);
    }
  }

  Future<void> seek(Duration position) async {
    await _audio.seek(position);
  }

  Future<void> setVolume(double volume) async {
    state = state.copyWith(volume: volume);
    await _audio.setVolume(volume);
  }

  void toggleShuffle() {
    state = state.copyWith(shuffle: !state.shuffle);
  }

  Future<void> _playRandomUnplayed() async {
    final allIndices = List.generate(state.playingTracks.length, (i) => i);
    final available = allIndices.where((i) => !state.playedIndices.contains(i)).toList();
    if (available.isEmpty) return;

    final nextIndex = available[Random().nextInt(available.length)];
    final updatedPlayed = {...state.playedIndices, nextIndex};
    state = state.copyWith(playedIndices: updatedPlayed);
    await playAtIndex(nextIndex);
  }

  void _onTrackCompleted() {
    if (!state.hasNext) {
      state = state.copyWith(status: PlaybackStatus.stopped);
      return;
    }

    if (state.shuffle) {
      _playRandomUnplayed();
    } else {
      playAtIndex(state.currentIndex + 1);
    }
  }
}
