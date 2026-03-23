import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/music_providers.dart';
import 'playlist_dropdown.dart';

class PlayerControls extends ConsumerWidget {
  const PlayerControls({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(playerProvider);
    final theme = Theme.of(context);
    final colors = context.quarksColors;

    final displayTrack = state.displayTrack;
    if (displayTrack == null) return const SizedBox.shrink();

    final showingSelected = state.selectedDiffersFromCurrent;

    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        border: Border(
          top: BorderSide(color: colors.border, width: 2),
        ),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Now playing info
          Text(
            displayTrack.title,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: colors.textPrimary,
            ),
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 8),
          // Seek bar — reset to zero when viewing a non-playing selected track
          _SeekBar(
            position: showingSelected ? Duration.zero : state.position,
            duration: showingSelected ? Duration.zero : state.duration,
            onSeek: showingSelected
                ? null
                : (pos) => ref.read(playerProvider.notifier).seek(pos),
          ),
          const SizedBox(height: 4),
          // Controls row
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Volume
              Icon(Icons.volume_down, size: 16, color: colors.textSecondary),
              SizedBox(
                width: 80,
                child: SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    trackHeight: 3,
                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                  ),
                  child: Slider(
                    value: state.volume,
                    onChanged: (v) =>
                        ref.read(playerProvider.notifier).setVolume(v),
                  ),
                ),
              ),
              const Spacer(),
              // Playback controls
              IconButton(
                icon: const Icon(Icons.skip_previous),
                iconSize: 28,
                color: colors.textPrimary,
                onPressed: state.hasPrevious || state.position.inSeconds > 3
                    ? () => ref.read(playerProvider.notifier).previous()
                    : null,
              ),
              Container(
                decoration: BoxDecoration(
                  color: colors.primary,
                  border: Border.all(color: colors.borderDark, width: 2),
                ),
                child: IconButton(
                  icon: Icon(
                    state.isPlaying && !showingSelected
                        ? Icons.pause
                        : Icons.play_arrow,
                  ),
                  iconSize: 32,
                  color: colors.surface,
                  onPressed: () =>
                      ref.read(playerProvider.notifier).togglePlayPause(),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.skip_next),
                iconSize: 28,
                color: colors.textPrimary,
                onPressed: state.hasNext
                    ? () => ref.read(playerProvider.notifier).next()
                    : null,
              ),
              const Spacer(),
              // Shuffle toggle
              IconButton(
                icon: const Icon(Icons.shuffle),
                iconSize: 20,
                color: state.shuffle ? colors.primary : colors.textSecondary,
                onPressed: () =>
                    ref.read(playerProvider.notifier).toggleShuffle(),
              ),
              const PlaylistDropdown(),
            ],
          ),
        ],
      ),
    );
  }
}

class _SeekBar extends StatelessWidget {
  final Duration position;
  final Duration duration;
  final ValueChanged<Duration>? onSeek;

  const _SeekBar({
    required this.position,
    required this.duration,
    this.onSeek,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final max = duration.inMilliseconds.toDouble();
    final current = position.inMilliseconds.toDouble().clamp(0.0, max);

    return Row(
      children: [
        Text(
          _formatDuration(position),
          style: theme.textTheme.bodySmall,
        ),
        Expanded(
          child: SliderTheme(
            data: SliderTheme.of(context).copyWith(
              trackHeight: 3,
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
            ),
            child: Slider(
              value: max > 0 ? current : 0.0,
              max: max > 0 ? max : 1.0,
              onChanged: onSeek != null
                  ? (v) => onSeek!(Duration(milliseconds: v.toInt()))
                  : null,
            ),
          ),
        ),
        Text(
          _formatDuration(duration),
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }
}
