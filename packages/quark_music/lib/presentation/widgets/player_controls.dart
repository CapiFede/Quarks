import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quarks_core/quarks_core.dart';

import '../providers/music_providers.dart';

class PlayerControls extends ConsumerWidget {
  const PlayerControls({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(playerProvider);
    final theme = Theme.of(context);

    if (state.currentTrack == null) return const SizedBox.shrink();

    return Container(
      decoration: const BoxDecoration(
        color: QuarksColors.surfaceAlt,
        border: Border(
          top: BorderSide(color: QuarksColors.border, width: 2),
        ),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Now playing info
          Text(
            state.currentTrack!.title,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: QuarksColors.textPrimary,
            ),
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 8),
          // Seek bar
          _SeekBar(
            position: state.position,
            duration: state.duration,
            onSeek: (pos) => ref.read(playerProvider.notifier).seek(pos),
          ),
          const SizedBox(height: 4),
          // Controls row
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Volume
              Icon(Icons.volume_down, size: 16, color: QuarksColors.textSecondary),
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
                color: QuarksColors.textPrimary,
                onPressed: state.hasPrevious || state.position.inSeconds > 3
                    ? () => ref.read(playerProvider.notifier).previous()
                    : null,
              ),
              Container(
                decoration: BoxDecoration(
                  color: QuarksColors.primary,
                  border: Border.all(color: QuarksColors.borderDark, width: 2),
                ),
                child: IconButton(
                  icon: Icon(
                    state.isPlaying ? Icons.pause : Icons.play_arrow,
                  ),
                  iconSize: 32,
                  color: QuarksColors.surface,
                  onPressed: () =>
                      ref.read(playerProvider.notifier).togglePlayPause(),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.skip_next),
                iconSize: 28,
                color: QuarksColors.textPrimary,
                onPressed: state.hasNext
                    ? () => ref.read(playerProvider.notifier).next()
                    : null,
              ),
              const Spacer(),
              // Spacer to balance volume on the left
              const SizedBox(width: 112),
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
  final ValueChanged<Duration> onSeek;

  const _SeekBar({
    required this.position,
    required this.duration,
    required this.onSeek,
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
              onChanged: (v) => onSeek(Duration(milliseconds: v.toInt())),
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
