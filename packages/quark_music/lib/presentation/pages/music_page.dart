import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/library_providers.dart';
import '../providers/music_providers.dart';
import '../widgets/player_controls.dart';
import '../widgets/track_list.dart';

class MusicPage extends ConsumerWidget {
  const MusicPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.space): () {
          ref.read(playerProvider.notifier).togglePlayPause();
        },
      },
      child: Focus(
        autofocus: true,
        child: Container(
          color: colors.background,
          child: const Column(
            children: [
              _SearchBar(),
              Expanded(child: TrackList()),
              PlayerControls(),
            ],
          ),
        ),
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
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border.all(color: colors.border, width: 1),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          children: [
            Icon(Icons.search, size: 16, color: colors.textSecondary),
            const SizedBox(width: 6),
            Expanded(
              child: TextField(
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: colors.textPrimary),
                decoration: InputDecoration(
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                  hintText: 'Search songs...',
                  hintStyle: theme.textTheme.bodyMedium?.copyWith(
                    color: colors.textLight,
                  ),
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                ),
                onChanged: (value) =>
                    ref.read(searchQueryProvider.notifier).state = value,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
