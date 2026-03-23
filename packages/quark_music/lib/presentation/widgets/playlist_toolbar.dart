import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/playlist.dart';
import '../providers/download_providers.dart';
import '../providers/library_providers.dart';
import '../providers/library_state.dart';

class PlaylistToolbar extends ConsumerWidget {
  const PlaylistToolbar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final libraryAsync = ref.watch(libraryProvider);

    return libraryAsync.when(
      data: (library) => _PlaylistToolbarContent(library: library),
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }
}

class _PlaylistToolbarContent extends ConsumerWidget {
  final LibraryState library;

  const _PlaylistToolbarContent({required this.library});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;

    return Container(
      decoration: BoxDecoration(
        color: colors.background,
        border: Border(
          bottom: BorderSide(color: colors.borderDark, width: 2),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _PlaylistChip(
                    name: 'All Tracks',
                    isSelected:
                        library.selectedPlaylistId == Playlist.allTracksId,
                    onTap: () => ref
                        .read(libraryProvider.notifier)
                        .selectPlaylist(Playlist.allTracksId),
                  ),
                  for (final pl in library.playlists)
                    _PlaylistChip(
                      name: pl.name,
                      isSelected: library.selectedPlaylistId == pl.id,
                      onTap: () => ref
                          .read(libraryProvider.notifier)
                          .selectPlaylist(pl.id),
                      onSecondaryTap: (details) =>
                          _showContextMenu(context, ref, pl, details),
                    ),
                  const SizedBox(width: 4),
                  _AddButton(
                    onTap: () => _showCreateDialog(context, ref),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          _ToolbarButton(
            icon: Icons.folder_open,
            onTap: () => ref.read(libraryProvider.notifier).pickAndScanFolder(),
            isScanning: library.isScanning,
          ),
          if (Platform.isWindows) ...[
            const SizedBox(width: 4),
            _ToolbarButton(
              icon: Icons.download,
              onTap: () => ref.read(downloadProvider.notifier).toggleDrawer(),
            ),
          ],
        ],
      ),
    );
  }

  void _showCreateDialog(BuildContext context, WidgetRef ref) {
    final controller = TextEditingController();
    final colors = context.quarksColors;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text(
          'New Playlist',
          style: Theme.of(context)
              .textTheme
              .titleSmall
              ?.copyWith(color: colors.textPrimary),
        ),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(color: colors.textPrimary),
          decoration: InputDecoration(
            hintText: 'Playlist name',
            hintStyle: TextStyle(color: colors.textLight),
          ),
          onSubmitted: (value) {
            if (value.trim().isNotEmpty) {
              ref.read(libraryProvider.notifier).createPlaylist(value.trim());
              Navigator.of(ctx).pop();
            }
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text('Cancel',
                style: TextStyle(color: colors.textSecondary)),
          ),
          TextButton(
            onPressed: () {
              final name = controller.text.trim();
              if (name.isNotEmpty) {
                ref.read(libraryProvider.notifier).createPlaylist(name);
                Navigator.of(ctx).pop();
              }
            },
            child: Text('Create', style: TextStyle(color: colors.primary)),
          ),
        ],
      ),
    );
  }

  void _showContextMenu(
    BuildContext context,
    WidgetRef ref,
    Playlist playlist,
    TapDownDetails details,
  ) {
    final colors = context.quarksColors;
    final position = details.globalPosition;

    showMenu<String>(
      context: context,
      position: RelativeRect.fromLTRB(
        position.dx,
        position.dy,
        position.dx,
        position.dy,
      ),
      color: colors.surface,
      items: [
        PopupMenuItem(
          value: 'rename',
          child: Text('Rename',
              style: TextStyle(color: colors.textPrimary)),
        ),
        PopupMenuItem(
          value: 'delete',
          child:
              Text('Delete', style: TextStyle(color: colors.error)),
        ),
      ],
    ).then((value) {
      if (!context.mounted) return;
      if (value == 'rename') {
        _showRenameDialog(context, ref, playlist);
      } else if (value == 'delete') {
        ref.read(libraryProvider.notifier).deletePlaylist(playlist.id);
      }
    });
  }

  void _showRenameDialog(
    BuildContext context,
    WidgetRef ref,
    Playlist playlist,
  ) {
    final controller = TextEditingController(text: playlist.name);
    final colors = context.quarksColors;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text(
          'Rename Playlist',
          style: Theme.of(context)
              .textTheme
              .titleSmall
              ?.copyWith(color: colors.textPrimary),
        ),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(color: colors.textPrimary),
          onSubmitted: (value) {
            if (value.trim().isNotEmpty) {
              ref
                  .read(libraryProvider.notifier)
                  .renamePlaylist(playlist.id, value.trim());
              Navigator.of(ctx).pop();
            }
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text('Cancel',
                style: TextStyle(color: colors.textSecondary)),
          ),
          TextButton(
            onPressed: () {
              final name = controller.text.trim();
              if (name.isNotEmpty) {
                ref
                    .read(libraryProvider.notifier)
                    .renamePlaylist(playlist.id, name);
                Navigator.of(ctx).pop();
              }
            },
            child: Text('Rename', style: TextStyle(color: colors.primary)),
          ),
        ],
      ),
    );
  }
}

class _PlaylistChip extends StatefulWidget {
  final String name;
  final bool isSelected;
  final VoidCallback onTap;
  final void Function(TapDownDetails)? onSecondaryTap;

  const _PlaylistChip({
    required this.name,
    required this.isSelected,
    required this.onTap,
    this.onSecondaryTap,
  });

  @override
  State<_PlaylistChip> createState() => _PlaylistChipState();
}

class _PlaylistChipState extends State<_PlaylistChip> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    return Padding(
      padding: const EdgeInsets.only(right: 4),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          onTap: widget.onTap,
          onSecondaryTapDown: widget.onSecondaryTap,
          child: PixelBorder(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            borderWidth: 1.5,
            backgroundColor: widget.isSelected
                ? colors.primary
                : _hovering
                    ? colors.cardHover
                    : colors.surface,
            child: Text(
              widget.name,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: widget.isSelected
                        ? colors.surface
                        : colors.textPrimary,
                  ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AddButton extends StatefulWidget {
  final VoidCallback onTap;

  const _AddButton({required this.onTap});

  @override
  State<_AddButton> createState() => _AddButtonState();
}

class _AddButtonState extends State<_AddButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: PixelBorder(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          borderWidth: 1.5,
          backgroundColor: _hovering ? colors.cardHover : colors.surface,
          child: Icon(
            Icons.add,
            size: 14,
            color: colors.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _ToolbarButton extends StatefulWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool isScanning;

  const _ToolbarButton({
    required this.icon,
    required this.onTap,
    this.isScanning = false,
  });

  @override
  State<_ToolbarButton> createState() => _ToolbarButtonState();
}

class _ToolbarButtonState extends State<_ToolbarButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.isScanning ? null : widget.onTap,
        child: PixelBorder(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          borderWidth: 1.5,
          backgroundColor: _hovering ? colors.cardHover : colors.surface,
          child: widget.isScanning
              ? SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.textSecondary,
                  ),
                )
              : Icon(
                  widget.icon,
                  size: 14,
                  color: colors.textSecondary,
                ),
        ),
      ),
    );
  }
}
