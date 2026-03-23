import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/song_info_providers.dart';
import 'drawer_widgets.dart';

class SongInfoDrawer extends ConsumerWidget {
  const SongInfoDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(songInfoProvider);
    if (!state.drawerOpen || state.track == null) return const SizedBox.shrink();

    final colors = context.quarksColors;

    return Positioned(
      top: 0,
      bottom: 0,
      right: 0,
      child: Container(
        width: 360,
        decoration: BoxDecoration(
          color: colors.background,
          border: Border(
            left: BorderSide(color: colors.borderDark, width: 2),
          ),
          boxShadow: [
            BoxShadow(
              color: colors.cardShadow,
              offset: const Offset(-4, 0),
              blurRadius: 8,
            ),
          ],
        ),
        child: _SongInfoContent(state: state),
      ),
    );
  }
}

class _SongInfoContent extends ConsumerStatefulWidget {
  final dynamic state;

  const _SongInfoContent({required this.state});

  @override
  ConsumerState<_SongInfoContent> createState() => _SongInfoContentState();
}

class _SongInfoContentState extends ConsumerState<_SongInfoContent> {
  late TextEditingController _titleController;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.state.editedTitle ?? '');
  }

  @override
  void didUpdateWidget(_SongInfoContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    final newTitle = widget.state.editedTitle ?? '';
    if (newTitle != _titleController.text) {
      _titleController.text = newTitle;
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final state = ref.watch(songInfoProvider);
    final track = state.track!;
    final busy = state.isRenaming || state.isTrimming;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DrawerTitleBar(
                title: 'SONG INFO',
                onClose: () => ref.read(songInfoProvider.notifier).closeDrawer(),
              ),
              const SizedBox(height: 16),

              // Title
              Text('TITLE', style: textTheme.labelSmall?.copyWith(color: colors.textSecondary)),
              const SizedBox(height: 4),
              Row(
                children: [
                  Expanded(
                    child: PixelBorder(
                      inset: true,
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      backgroundColor: colors.surface,
                      child: TextField(
                        controller: _titleController,
                        enabled: !busy,
                        style: textTheme.bodySmall?.copyWith(color: colors.textPrimary),
                        decoration: InputDecoration(
                          hintText: 'Track title...',
                          hintStyle: TextStyle(color: colors.textLight),
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(vertical: 8),
                        ),
                        onChanged: (v) => ref.read(songInfoProvider.notifier).setEditedTitle(v),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  SmallButton(
                    label: state.isRenaming ? '...' : 'RENAME',
                    onTap: busy || (_titleController.text.trim() == track.title)
                        ? null
                        : () => ref.read(songInfoProvider.notifier).applyRename(),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Path
              Text('PATH', style: textTheme.labelSmall?.copyWith(color: colors.textSecondary)),
              const SizedBox(height: 4),
              PixelBorder(
                inset: true,
                padding: const EdgeInsets.all(8),
                backgroundColor: colors.surface,
                child: SelectableText(
                  track.path,
                  style: textTheme.bodySmall?.copyWith(
                    color: colors.textLight,
                    fontSize: 10,
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Duration
              if (state.trackDuration != null) ...[
                Text('DURATION', style: textTheme.labelSmall?.copyWith(color: colors.textSecondary)),
                const SizedBox(height: 4),
                Text(
                  _formatDuration(state.trackDuration!),
                  style: textTheme.bodySmall?.copyWith(color: colors.textPrimary),
                ),
                const SizedBox(height: 16),
              ],

              // Trim section
              if (state.trackDuration != null) ...[
                Text('TRIM', style: textTheme.labelSmall?.copyWith(color: colors.textSecondary)),
                const SizedBox(height: 8),
                _TrimSection(
                  duration: state.trackDuration!,
                  trimStart: state.trimStart ?? Duration.zero,
                  trimEnd: state.trimEnd ?? state.trackDuration!,
                  enabled: !busy,
                  onStartChanged: (d) => ref.read(songInfoProvider.notifier).setTrimStart(d),
                  onEndChanged: (d) => ref.read(songInfoProvider.notifier).setTrimEnd(d),
                ),
                const SizedBox(height: 12),
                ActionButton(
                  label: state.isTrimming ? 'TRIMMING...' : 'TRIM',
                  onTap: busy
                      ? null
                      : () => _confirmTrim(context),
                  isDestructive: true,
                ),
                const SizedBox(height: 16),
              ],

              // Messages
              if (state.successMessage != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    state.successMessage!,
                    style: textTheme.bodySmall?.copyWith(color: colors.success),
                  ),
                ),
              if (state.errorMessage != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    state.errorMessage!,
                    style: textTheme.bodySmall?.copyWith(color: colors.error),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  void _confirmTrim(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text('Trim track?', style: textTheme.titleSmall?.copyWith(color: colors.textPrimary)),
        content: Text(
          'This will permanently modify the audio file. This cannot be undone.',
          style: textTheme.bodySmall?.copyWith(color: colors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('CANCEL', style: TextStyle(color: colors.textSecondary)),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              ref.read(songInfoProvider.notifier).applyTrim();
            },
            child: Text('TRIM', style: TextStyle(color: colors.error)),
          ),
        ],
      ),
    );
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes.toString().padLeft(2, '0');
    final seconds = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }
}

class _TrimSection extends StatelessWidget {
  final Duration duration;
  final Duration trimStart;
  final Duration trimEnd;
  final bool enabled;
  final ValueChanged<Duration> onStartChanged;
  final ValueChanged<Duration> onEndChanged;

  const _TrimSection({
    required this.duration,
    required this.trimStart,
    required this.trimEnd,
    required this.enabled,
    required this.onStartChanged,
    required this.onEndChanged,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final totalMs = duration.inMilliseconds.toDouble();
    if (totalMs <= 0) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Select the range to KEEP:',
          style: textTheme.bodySmall?.copyWith(color: colors.textLight, fontSize: 10),
        ),
        const SizedBox(height: 8),
        SliderTheme(
          data: SliderThemeData(
            activeTrackColor: colors.primary,
            inactiveTrackColor: colors.surfaceAlt,
            thumbColor: colors.primary,
            overlayColor: colors.primary.withValues(alpha: 0.2),
            trackHeight: 8,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
            rangeThumbShape: const RoundRangeSliderThumbShape(enabledThumbRadius: 6),
            rangeTrackShape: const RoundedRectRangeSliderTrackShape(),
          ),
          child: RangeSlider(
            values: RangeValues(
              trimStart.inMilliseconds.toDouble().clamp(0, totalMs),
              trimEnd.inMilliseconds.toDouble().clamp(0, totalMs),
            ),
            min: 0,
            max: totalMs,
            onChanged: enabled
                ? (values) {
                    onStartChanged(Duration(milliseconds: values.start.round()));
                    onEndChanged(Duration(milliseconds: values.end.round()));
                  }
                : null,
          ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              _fmt(trimStart),
              style: textTheme.bodySmall?.copyWith(color: colors.textSecondary, fontSize: 10),
            ),
            Text(
              _fmt(trimEnd),
              style: textTheme.bodySmall?.copyWith(color: colors.textSecondary, fontSize: 10),
            ),
          ],
        ),
      ],
    );
  }

  String _fmt(Duration d) {
    final m = d.inMinutes.toString().padLeft(2, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}
