import 'package:flutter/material.dart';
import 'package:quarks_core/quarks_core.dart';

import '../widgets/folder_picker.dart';
import '../widgets/player_controls.dart';
import '../widgets/track_list.dart';

class MusicPage extends StatelessWidget {
  const MusicPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: QuarksColors.background,
      child: const Column(
        children: [
          FolderPicker(),
          Expanded(child: TrackList()),
          PlayerControls(),
        ],
      ),
    );
  }
}
