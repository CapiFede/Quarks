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
          top: BorderSide(color: colors.border, width: 1),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Now playing info
          Text(
            displayTrack.title,
            style: theme.textTheme.bodySmall?.copyWith(
              color: colors.textPrimary,
            ),
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          // Seek bar
          _SeekBar(
            position: showingSelected ? Duration.zero : state.position,
            duration: showingSelected ? Duration.zero : state.duration,
            onSeek: showingSelected
                ? null
                : (pos) => ref.read(playerProvider.notifier).seek(pos),
          ),
          const SizedBox(height: 6),
          // Controls row
          Row(
            children: [
              // Volume
              Icon(Icons.volume_down, size: 16, color: colors.textLight),
              const SizedBox(width: 4),
              SizedBox(
                width: 100,
                child: SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    trackHeight: 3,
                    thumbShape:
                        const RoundSliderThumbShape(enabledThumbRadius: 7),
                    overlayShape:
                        const RoundSliderOverlayShape(overlayRadius: 12),
                    activeTrackColor: colors.primary,
                    inactiveTrackColor: colors.border,
                    thumbColor: colors.primary,
                  ),
                  child: Slider(
                    value: state.volume,
                    onChanged: (v) =>
                        ref.read(playerProvider.notifier).setVolume(v),
                  ),
                ),
              ),
              const Spacer(),
              // Prev
              _IconControl(
                icon: Icons.skip_previous,
                size: 24,
                color: colors.textSecondary,
                onTap: state.hasPrevious || state.position.inSeconds > 3
                    ? () => ref.read(playerProvider.notifier).previous()
                    : null,
              ),
              // Play/Pause — clean circle, no border container
              const SizedBox(width: 6),
              _IconControl(
                icon: state.isPlaying && !showingSelected
                    ? Icons.pause_circle
                    : Icons.play_circle,
                size: 36,
                color: colors.primary,
                onTap: () =>
                    ref.read(playerProvider.notifier).togglePlayPause(),
              ),
              const SizedBox(width: 6),
              // Next
              _IconControl(
                icon: Icons.skip_next,
                size: 24,
                color: colors.textSecondary,
                onTap: state.hasNext
                    ? () => ref.read(playerProvider.notifier).next()
                    : null,
              ),
              const Spacer(),
              // Shuffle
              _IconControl(
                icon: Icons.shuffle,
                size: 16,
                color: state.shuffle ? colors.primary : colors.textLight,
                onTap: () =>
                    ref.read(playerProvider.notifier).toggleShuffle(),
              ),
              const SizedBox(width: 8),
              // Loop (current song)
              _IconControl(
                icon: Icons.repeat_one,
                size: 16,
                color: state.loop ? colors.primary : colors.textLight,
                onTap: () => ref.read(playerProvider.notifier).toggleLoop(),
              ),
              const SizedBox(width: 8),
              const PlaylistDropdown(),
            ],
          ),
        ],
      ),
    );
  }
}

class _IconControl extends StatefulWidget {
  final IconData icon;
  final double size;
  final Color color;
  final VoidCallback? onTap;

  const _IconControl({
    required this.icon,
    required this.size,
    required this.color,
    this.onTap,
  });

  @override
  State<_IconControl> createState() => _IconControlState();
}

class _IconControlState extends State<_IconControl> {
  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null;
    return MouseRegion(
      cursor:
          enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Icon(
          widget.icon,
          size: widget.size,
          color: enabled
              ? widget.color
              : widget.color.withValues(alpha: 0.4),
        ),
      ),
    );
  }
}

class _SeekBar extends StatefulWidget {
  final Duration position;
  final Duration duration;
  final ValueChanged<Duration>? onSeek;

  const _SeekBar({
    required this.position,
    required this.duration,
    this.onSeek,
  });

  @override
  State<_SeekBar> createState() => _SeekBarState();
}

class _SeekBarState extends State<_SeekBar> {
  double? _hoverX;
  double _barWidth = 0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.quarksColors;
    final max = widget.duration.inMilliseconds.toDouble();
    final pct = max > 0
        ? (widget.position.inMilliseconds.toDouble() / max).clamp(0.0, 1.0)
        : 0.0;

    final timeStyle = theme.textTheme.bodySmall?.copyWith(
      color: colors.textSecondary,
      fontSize: 9,
    );

    return Row(
      children: [
        SizedBox(
          width: 32,
          child: Text(
            _formatDuration(widget.position),
            style: timeStyle,
            textAlign: TextAlign.right,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              _barWidth = constraints.maxWidth;
              final hoverMs = (_hoverX != null && max > 0)
                  ? ((_hoverX! / _barWidth).clamp(0.0, 1.0) * max).toInt()
                  : null;

              return MouseRegion(
                cursor: widget.onSeek != null
                    ? SystemMouseCursors.click
                    : SystemMouseCursors.basic,
                onEnter: (e) => setState(
                    () => _hoverX = e.localPosition.dx.clamp(0.0, _barWidth)),
                onHover: (e) => setState(
                    () => _hoverX = e.localPosition.dx.clamp(0.0, _barWidth)),
                onExit: (_) => setState(() => _hoverX = null),
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTapDown: widget.onSeek == null
                      ? null
                      : (details) {
                          final fraction = (details.localPosition.dx /
                                  _barWidth)
                              .clamp(0.0, 1.0);
                          widget.onSeek!(Duration(
                              milliseconds: (fraction * max).toInt()));
                        },
                  child: SizedBox(
                    height: 20,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        // Bar (centered vertically inside the 20px hit area)
                        Positioned.fill(
                          child: Center(
                            child: SizedBox(
                              height: 4,
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  Container(color: colors.border),
                                  Align(
                                    alignment: Alignment.centerLeft,
                                    child: FractionallySizedBox(
                                      widthFactor: pct,
                                      child: Container(color: colors.primary),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        // Hover tooltip
                        if (hoverMs != null)
                          Positioned(
                            left: (_hoverX! - 20).clamp(0.0, _barWidth - 40),
                            top: -16,
                            child: IgnorePointer(
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 4, vertical: 1),
                                decoration: BoxDecoration(
                                  color: colors.surfaceAlt,
                                  border: Border.all(
                                      color: colors.border, width: 1),
                                ),
                                child: Text(
                                  _formatDuration(
                                      Duration(milliseconds: hoverMs)),
                                  style: timeStyle?.copyWith(
                                      color: colors.textPrimary),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 32,
          child: Text(
            _formatDuration(widget.duration),
            style: timeStyle,
          ),
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
