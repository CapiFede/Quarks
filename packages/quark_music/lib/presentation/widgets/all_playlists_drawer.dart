import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/playlist.dart';
import '../providers/library_providers.dart';
import 'drawer_widgets.dart';
import 'playlist_dialogs.dart';

final allPlaylistsDrawerOpenProvider = StateProvider<bool>((ref) => false);

const _quarkId = 'quark_music';

class AllPlaylistsDrawer extends ConsumerWidget {
  const AllPlaylistsDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOpen = ref.watch(allPlaylistsDrawerOpenProvider);
    if (!isOpen) return const SizedBox.shrink();

    final colors = context.quarksColors;
    final libraryAsync = ref.watch(libraryProvider);
    final library = libraryAsync.valueOrNull;

    final playlists = <Playlist>[
      Playlist.allTracks(),
      ...?library?.playlists,
    ];

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
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: DrawerTitleBar(
                title: 'ALL PLAYLISTS',
                onClose: () => ref
                    .read(allPlaylistsDrawerOpenProvider.notifier)
                    .state = false,
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                itemCount: playlists.length,
                itemBuilder: (context, i) =>
                    _PlaylistTile(playlist: playlists[i]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlaylistTile extends ConsumerStatefulWidget {
  final Playlist playlist;

  const _PlaylistTile({required this.playlist});

  @override
  ConsumerState<_PlaylistTile> createState() => _PlaylistTileState();
}

class _PlaylistTileState extends ConsumerState<_PlaylistTile> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final isPinned = ref.watch(pinStateProvider.select((async) =>
        async.valueOrNull?[_quarkId]?.dynamicItems
            .contains(widget.playlist.id) ??
        false));

    final pl = widget.playlist;
    final isAllTracks = pl.isAllTracks;
    final library = ref.watch(libraryProvider).valueOrNull;
    final trackCount = isAllTracks
        ? (library?.allTracks.length ?? 0)
        : pl.trackPaths.length;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () {
          ref.read(libraryProvider.notifier).selectPlaylist(pl.id);
          ref.read(allPlaylistsDrawerOpenProvider.notifier).state = false;
        },
        onSecondaryTapDown: isAllTracks
            ? null
            : (details) => _showContextMenu(context, ref, pl, details),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          color: _hovering ? colors.cardHover : Colors.transparent,
          child: Row(
            children: [
              _PinToggleButton(
                isPinned: isPinned,
                onTap: () => ref
                    .read(pinStateProvider.notifier)
                    .toggleDynamic(_quarkId, pl.id),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  pl.name,
                  style: textTheme.bodyMedium
                      ?.copyWith(color: colors.textPrimary),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                '$trackCount',
                style: textTheme.bodySmall
                    ?.copyWith(color: colors.textLight),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showContextMenu(
    BuildContext context,
    WidgetRef ref,
    Playlist pl,
    TapDownDetails details,
  ) {
    final colors = context.quarksColors;
    final pos = details.globalPosition;

    showMenu<String>(
      context: context,
      position: RelativeRect.fromLTRB(pos.dx, pos.dy, pos.dx, pos.dy),
      color: colors.surface,
      items: [
        PopupMenuItem(
          value: 'rename',
          child: Text('Rename', style: TextStyle(color: colors.textPrimary)),
        ),
        PopupMenuItem(
          value: 'delete',
          child: Text('Delete', style: TextStyle(color: colors.error)),
        ),
      ],
    ).then((value) async {
      if (!context.mounted) return;
      switch (value) {
        case 'rename':
          await showRenamePlaylistDialog(context, ref, pl);
        case 'delete':
          await ref.read(libraryProvider.notifier).deletePlaylist(pl.id);
      }
    });
  }
}

class _PinToggleButton extends StatefulWidget {
  final bool isPinned;
  final VoidCallback onTap;

  const _PinToggleButton({required this.isPinned, required this.onTap});

  @override
  State<_PinToggleButton> createState() => _PinToggleButtonState();
}

class _PinToggleButtonState extends State<_PinToggleButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    final color = widget.isPinned
        ? colors.primary
        : _hovering
            ? colors.textPrimary
            : colors.textLight.withValues(alpha: 0.5);

    return Tooltip(
      message: widget.isPinned ? 'Unpin from bar' : 'Pin to bar',
      waitDuration: const Duration(milliseconds: 500),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          // Stop the tap from bubbling to the row's onTap (which would
          // close the drawer) — we want pinning to be a non-destructive
          // toggle so the user can pin/unpin many playlists in a row.
          onTap: widget.onTap,
          child: SizedBox(
            width: 24,
            height: 24,
            child: Center(
              child: Icon(
                widget.isPinned
                    ? Icons.push_pin
                    : Icons.push_pin_outlined,
                size: 14,
                color: color,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
