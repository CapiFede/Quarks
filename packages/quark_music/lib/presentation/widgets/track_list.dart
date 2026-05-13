import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/playlist.dart';
import '../../domain/entities/track.dart';
import '../providers/library_providers.dart';
import '../providers/music_providers.dart';
import '../providers/player_state.dart';
import '../providers/song_info_providers.dart';
import 'track_dialogs.dart';

class TrackList extends ConsumerStatefulWidget {
  const TrackList({super.key});

  @override
  ConsumerState<TrackList> createState() => _TrackListState();
}

class _TrackListState extends ConsumerState<TrackList> {
  final _scrollController = ScrollController();
  // Exact tile height — matches itemExtent on the ListView so scroll-to-center
  // math is always precise. Value: 16px padding + 17px title + 2px gap +
  // 14px artist + 1px border = 50px.
  static const _kItemHeight = 50.0;

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToTrack(Track track) {
    final tracks = ref.read(visibleTracksProvider);
    final index = tracks.indexWhere((t) => t.path == track.path);
    if (index < 0 || !_scrollController.hasClients) return;
    final viewportHeight = _scrollController.position.viewportDimension;
    final targetOffset =
        (index * _kItemHeight) - (viewportHeight / 2) + (_kItemHeight / 2);
    _scrollController.animateTo(
      targetOffset.clamp(0.0, _scrollController.position.maxScrollExtent),
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeInOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final tracks = ref.watch(visibleTracksProvider);
    final libraryAsync = ref.watch(libraryProvider);
    final playerState = ref.watch(playerProvider);
    final theme = Theme.of(context);
    final colors = context.quarksColors;

    ref.listen<PlayerState>(playerProvider, (prev, next) {
      if (next.currentTrack != null &&
          next.currentTrack?.path != prev?.currentTrack?.path) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _scrollToTrack(next.currentTrack!);
        });
      }
    });

    if (tracks.isEmpty) {
      // Distinguish "library is loading", "library errored", and "library
      // loaded but empty" so a silent scan failure isn't masked behind a
      // generic empty-state message.
      if (libraryAsync.isLoading) {
        return Center(
          child: Text(
            'Scanning...',
            style: theme.textTheme.bodyLarge?.copyWith(
              color: colors.textSecondary,
            ),
          ),
        );
      }
      if (libraryAsync.hasError) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Could not scan music folder',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: colors.error,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${libraryAsync.error}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colors.textSecondary,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        );
      }
      return Center(
        child: Text(
          'Scan a folder to find music',
          style: theme.textTheme.bodyLarge?.copyWith(
            color: colors.textSecondary,
          ),
        ),
      );
    }

    return ListView.builder(
      controller: _scrollController,
      itemExtent: _kItemHeight,  // fixed extent keeps scroll math exact
      itemCount: tracks.length,
      itemBuilder: (context, index) {
        final track = tracks[index];
        final isPlaying = playerState.currentTrack?.path == track.path;
        final isSelected = playerState.selectedTrack?.path == track.path;

        return _TrackTile(
          track: track,
          isPlaying: isPlaying,
          isSelected: isSelected,
          onTap: () => ref.read(playerProvider.notifier).selectTrack(track),
          onDoubleTap: () => ref.read(playerProvider.notifier).playTrack(track),
        );
      },
    );
  }
}

class _TrackTile extends ConsumerStatefulWidget {
  final Track track;
  final bool isPlaying;
  final bool isSelected;
  final VoidCallback onTap;
  final VoidCallback onDoubleTap;

  const _TrackTile({
    required this.track,
    required this.isPlaying,
    this.isSelected = false,
    required this.onTap,
    required this.onDoubleTap,
  });

  @override
  ConsumerState<_TrackTile> createState() => _TrackTileState();
}

class _TrackTileState extends ConsumerState<_TrackTile> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.quarksColors;
    final library = ref.watch(libraryProvider).valueOrNull;
    final containingPlaylists = library?.playlists
            .where((p) => p.trackPaths.contains(widget.track.path))
            .map((p) => p.name)
            .toList() ??
        [];

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onTap: widget.onTap,
        onDoubleTap: widget.onDoubleTap,
        onSecondaryTapDown: (details) =>
            _showContextMenu(context, details),
        child: Container(
          constraints: const BoxConstraints(minHeight: 38),
          decoration: BoxDecoration(
            color: widget.isSelected
                ? colors.secondary.withValues(alpha: 0.3)
                : widget.isPlaying
                    ? colors.error.withValues(alpha: 0.25)
                    : _hovering
                        ? colors.cardHover
                        : Colors.transparent,
            border: Border(
              bottom: BorderSide(color: colors.border, width: 1),
            ),
          ),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (containingPlaylists.isNotEmpty)
                  Tooltip(
                    message: containingPlaylists.join('\n'),
                    child: Container(width: 5, color: colors.primary),
                  )
                else
                  const SizedBox(width: 5),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 8),
                    child: Row(
                      children: [
                        Icon(
                          widget.isPlaying
                              ? Icons.play_arrow
                              : Icons.music_note,
                          size: 16,
                          color: widget.isPlaying
                              ? colors.error
                              : colors.textSecondary,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                widget.track.title,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: widget.isSelected
                                      ? colors.primaryDark
                                      : widget.isPlaying
                                          ? colors.error
                                          : colors.textPrimary,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (widget.track.artist != null) ...[
                                const SizedBox(height: 2),
                                Text(
                                  widget.track.artist!,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: colors.textSecondary,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ],
                          ),
                        ),
                        if (widget.track.duration != null) ...[
                          const SizedBox(width: 12),
                          Text(
                            _formatDuration(widget.track.duration!),
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: colors.textLight,
                              fontSize: 9,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  void _showContextMenu(BuildContext context, TapDownDetails details) {
    final colors = context.quarksColors;
    final libraryAsync = ref.read(libraryProvider);
    final library = libraryAsync.valueOrNull;
    if (library == null) return;

    final selectedId = library.selectedPlaylistId;
    final position = details.globalPosition;

    final items = <PopupMenuEntry<String>>[
      PopupMenuItem(
        value: 'rename',
        child: Text('Rename', style: TextStyle(color: colors.textPrimary)),
      ),
      PopupMenuItem(
        value: 'delete',
        child: Text('Delete', style: TextStyle(color: colors.error)),
      ),
      if (selectedId != Playlist.allTracksId)
        PopupMenuItem(
          value: 'remove',
          child: Text('Remove from playlist',
              style: TextStyle(color: colors.error)),
        ),
      const PopupMenuDivider(),
      PopupMenuItem(
        value: 'info',
        child: Text('Song info', style: TextStyle(color: colors.textPrimary)),
      ),
    ];

    showMenu<String>(
      context: context,
      position: RelativeRect.fromLTRB(
        position.dx,
        position.dy,
        position.dx,
        position.dy,
      ),
      color: colors.surface,
      items: items,
    ).then((value) async {
      if (value == null) return;
      if (!context.mounted) return;
      switch (value) {
        case 'rename':
          await showRenameTrackDialog(context, ref, widget.track);
        case 'delete':
          await showDeleteTrackDialog(context, ref, widget.track);
        case 'remove':
          await ref
              .read(libraryProvider.notifier)
              .removeTrackFromPlaylist(selectedId, widget.track.path);
        case 'info':
          ref.read(songInfoProvider.notifier).openDrawer(widget.track);
      }
    });
  }
}
