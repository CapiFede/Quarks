import 'package:flutter/material.dart';
import 'package:just_audio_media_kit/just_audio_media_kit.dart';
import 'package:quarks_core/quarks_core.dart';

import 'presentation/pages/music_page.dart';

class MusicModule extends QuarkModule {
  @override
  String get id => 'quark_music';

  @override
  String get name => 'Quark Music';

  @override
  IconData get icon => Icons.music_note;

  @override
  Widget buildPage() => const MusicPage();

  @override
  Future<void> initialize() async {
    JustAudioMediaKit.ensureInitialized();
  }

  @override
  void dispose() {}
}
