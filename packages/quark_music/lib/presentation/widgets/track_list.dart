import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quarks_core/quarks_core.dart';

import '../../domain/entities/track.dart';
import '../providers/music_providers.dart';

class TrackList extends ConsumerWidget {
  const TrackList({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(playerProvider);
    final theme = Theme.of(context);

    if (!state.hasTracks) {
      return Center(
        child: Text(
          'Scan a folder to find music',
          style: theme.textTheme.bodyLarge?.copyWith(
            color: QuarksColors.textSecondary,
          ),
        ),
      );
    }

    return ListView.builder(
      itemCount: state.tracks.length,
      itemBuilder: (context, index) {
        final track = state.tracks[index];
        final isPlaying = state.currentIndex == index;

        return _TrackTile(
          track: track,
          isPlaying: isPlaying,
          onTap: () => ref.read(playerProvider.notifier).playTrack(track),
        );
      },
    );
  }
}

class _TrackTile extends StatefulWidget {
  final Track track;
  final bool isPlaying;
  final VoidCallback onTap;

  const _TrackTile({
    required this.track,
    required this.isPlaying,
    required this.onTap,
  });

  @override
  State<_TrackTile> createState() => _TrackTileState();
}

class _TrackTileState extends State<_TrackTile> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: widget.isPlaying
                ? QuarksColors.secondary.withValues(alpha: 0.3)
                : _hovering
                    ? QuarksColors.cardHover
                    : Colors.transparent,
            border: const Border(
              bottom: BorderSide(color: QuarksColors.border, width: 1),
            ),
          ),
          child: Row(
            children: [
              if (widget.isPlaying)
                const Icon(Icons.play_arrow, size: 16, color: QuarksColors.primary)
              else
                const Icon(Icons.music_note, size: 16, color: QuarksColors.textSecondary),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.track.title,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: widget.isPlaying
                            ? QuarksColors.primaryDark
                            : QuarksColors.textPrimary,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (widget.track.artist != null)
                      Text(
                        widget.track.artist!,
                        style: theme.textTheme.bodySmall,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
