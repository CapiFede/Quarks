import 'dart:async';

import 'package:just_audio/just_audio.dart';

import '../../domain/entities/track.dart';

class AudioService {
  final AudioPlayer _player = AudioPlayer();

  // Streams
  Stream<Duration> get positionStream => _player.positionStream;
  Stream<Duration?> get durationStream => _player.durationStream;
  Stream<PlayerState> get playerStateStream => _player.playerStateStream;
  Stream<bool> get playingStream => _player.playingStream;

  // Current state
  bool get isPlaying => _player.playing;
  Duration get position => _player.position;
  Duration? get duration => _player.duration;
  double get volume => _player.volume;

  Future<void> play(Track track) async {
    await _player.stop();
    await _player.setFilePath(track.path);
    await _player.play();
  }

  Future<void> resume() async => _player.play();

  Future<void> pause() async => _player.pause();

  Future<void> stop() async => _player.stop();

  Future<void> seek(Duration position) async => _player.seek(position);

  Future<void> setVolume(double volume) async => _player.setVolume(volume);

  void dispose() {
    _player.dispose();
  }
}
