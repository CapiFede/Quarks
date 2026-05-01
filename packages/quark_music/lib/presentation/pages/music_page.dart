import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/library_providers.dart';
import '../widgets/download_drawer.dart';
import '../widgets/drive_sync_drawer.dart';
import '../widgets/player_controls.dart';
import '../widgets/song_info_drawer.dart';
import '../widgets/track_list.dart';

class MusicPage extends StatelessWidget {
  const MusicPage({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    return Container(
      color: colors.background,
      child: const Stack(
        children: [
          Column(
            children: [
              _SearchBar(),
              Expanded(child: TrackList()),
              PlayerControls(),
            ],
          ),
          DownloadDrawer(),
          SongInfoDrawer(),
          DriveSyncDrawer(),
        ],
      ),
    );
  }
}

class _SearchBar extends ConsumerWidget {
  const _SearchBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: colors.background,
        border: Border(
          bottom: BorderSide(color: colors.border, width: 1),
        ),
      ),
      child: TextField(
        style: theme.textTheme.bodyMedium?.copyWith(color: colors.textPrimary),
        decoration: InputDecoration(
          isDense: true,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          hintText: 'Search songs...',
          hintStyle: theme.textTheme.bodyMedium?.copyWith(
            color: colors.textLight,
          ),
          prefixIcon: Icon(Icons.search, size: 16, color: colors.textSecondary),
          prefixIconConstraints:
              const BoxConstraints(minWidth: 28, minHeight: 0),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(4),
            borderSide: BorderSide(color: colors.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(4),
            borderSide: BorderSide(color: colors.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(4),
            borderSide: BorderSide(color: colors.primary),
          ),
        ),
        onChanged: (value) =>
            ref.read(searchQueryProvider.notifier).state = value,
      ),
    );
  }
}
