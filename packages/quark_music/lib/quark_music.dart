import 'package:flutter/material.dart';
import 'package:just_audio_media_kit/just_audio_media_kit.dart';
import 'package:quark_core/quark_core.dart';

import 'presentation/pages/music_page.dart';
import 'presentation/widgets/playlist_toolbar.dart';

class MusicModule extends Quark {
  @override
  String get id => 'quark_music';

  @override
  String get name => 'Quark Music';

  @override
  IconData get icon => Icons.music_note;

  @override
  Widget buildPage() => const MusicPage();

  @override
  Widget? buildToolbar() => const PlaylistToolbar();

  @override
  Future<void> initialize() async {
    JustAudioMediaKit.ensureInitialized();
  }

  @override
  void dispose() {}
}
