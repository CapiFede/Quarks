import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/playlist.dart';
import '../../domain/entities/track.dart';
import '../providers/library_providers.dart';
import '../providers/music_providers.dart';
import '../providers/song_info_providers.dart';

class TrackList extends ConsumerWidget {
  const TrackList({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tracks = ref.watch(visibleTracksProvider);
    final playerState = ref.watch(playerProvider);
    final theme = Theme.of(context);
    final colors = context.quarksColors;

    if (tracks.isEmpty) {
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
                        horizontal: 16, vertical: 10),
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

    final playlists = library.playlists;
    final selectedId = library.selectedPlaylistId;
    final position = details.globalPosition;

    final items = <PopupMenuEntry<String>>[];

    // Add to playlist submenu
    if (playlists.isNotEmpty) {
      for (final pl in playlists) {
        final alreadyIn = pl.trackPaths.contains(widget.track.path);
        items.add(PopupMenuItem(
          value: 'add:${pl.id}',
          enabled: !alreadyIn,
          child: Text(
            alreadyIn ? '${pl.name} (added)' : 'Add to ${pl.name}',
            style: TextStyle(
              color: alreadyIn ? colors.textLight : colors.textPrimary,
            ),
          ),
        ));
      }
    }

    // Remove from current playlist (if viewing a user playlist)
    if (selectedId != Playlist.allTracksId) {
      items.add(const PopupMenuDivider());
      items.add(PopupMenuItem(
        value: 'remove',
        child: Text('Remove from playlist',
            style: TextStyle(color: colors.error)),
      ));
    }

    // Song info
    items.add(const PopupMenuDivider());
    items.add(PopupMenuItem(
      value: 'info',
      child: Text('Song info', style: TextStyle(color: colors.textPrimary)),
    ));

    if (items.isEmpty) return;

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
    ).then((value) {
      if (value == null) return;
      if (value == 'remove') {
        ref
            .read(libraryProvider.notifier)
            .removeTrackFromPlaylist(selectedId, widget.track.path);
      } else if (value == 'info') {
        ref.read(songInfoProvider.notifier).openDrawer(widget.track);
      } else if (value.startsWith('add:')) {
        final playlistId = value.substring(4);
        ref
            .read(libraryProvider.notifier)
            .addTrackToPlaylist(playlistId, widget.track);
      }
    });
  }
}
