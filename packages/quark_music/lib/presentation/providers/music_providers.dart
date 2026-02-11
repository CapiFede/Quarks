import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart' as ja;

import '../../data/repositories/music_repository_impl.dart';
import '../../data/services/audio_service.dart';
import '../../domain/entities/track.dart';
import '../../domain/repositories/music_repository.dart';
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
  late final MusicRepository _repo;
  final List<StreamSubscription<dynamic>> _subs = [];

  @override
  PlayerState build() {
    _audio = ref.read(audioServiceProvider);
    _repo = ref.read(musicRepositoryProvider);

    _subs.add(_audio.positionStream.listen((pos) {
      state = state.copyWith(position: pos);
    }));

    _subs.add(_audio.durationStream.listen((dur) {
      if (dur != null) {
        state = state.copyWith(duration: dur);
      }
    }));

    _subs.add(_audio.playerStateStream.listen((playerState) {
      if (playerState.processingState == ja.ProcessingState.completed) {
        _onTrackCompleted();
      }
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

  Future<void> pickAndScanFolder() async {
    final result = await FilePicker.platform.getDirectoryPath();
    if (result == null) return;

    state = state.copyWith(isScanning: true, scannedFolder: result);
    final tracks = await _repo.scanFolder(result);
    state = state.copyWith(tracks: tracks, isScanning: false);
  }

  Future<void> playTrack(Track track) async {
    final index = state.tracks.indexOf(track);
    state = state.copyWith(
      currentTrack: track,
      currentIndex: index,
      status: PlaybackStatus.playing,
    );
    await _audio.play(track);
  }

  Future<void> playAtIndex(int index) async {
    if (index < 0 || index >= state.tracks.length) return;
    await playTrack(state.tracks[index]);
  }

  Future<void> togglePlayPause() async {
    if (state.currentTrack == null) return;

    if (_audio.isPlaying) {
      await _audio.pause();
    } else {
      await _audio.resume();
    }
  }

  Future<void> next() async {
    if (state.hasNext) {
      await playAtIndex(state.currentIndex + 1);
    }
  }

  Future<void> previous() async {
    // If past 3 seconds, restart current track
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

  void _onTrackCompleted() {
    if (state.hasNext) {
      playAtIndex(state.currentIndex + 1);
    } else {
      state = state.copyWith(status: PlaybackStatus.stopped);
    }
  }
}
