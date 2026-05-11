import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/playlist.dart';
import '../../domain/entities/playlist_category.dart';
import '../providers/library_providers.dart';
import 'drawer_widgets.dart';
import 'playlist_category_dialogs.dart';
import 'playlist_dialogs.dart';

final allPlaylistsDrawerOpenProvider = StateProvider<bool>((ref) => false);

class AllPlaylistsDrawer extends ConsumerWidget {
  const AllPlaylistsDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOpen = ref.watch(allPlaylistsDrawerOpenProvider);
    if (!isOpen) return const SizedBox.shrink();

    final colors = context.quarksColors;
    final libraryAsync = ref.watch(libraryProvider);
    final library = libraryAsync.valueOrNull;
    final playlists = library?.playlists ?? const [];
    final categories = library?.categories ?? const [];

    // Real category sections only — the synthetic "Sin categoría" section is
    // gone. Stragglers without a category render at the end as a flat list
    // without a header.
    final groups = <_CategoryGroup>[
      for (final cat in categories)
        _CategoryGroup(
          category: cat,
          playlists:
              playlists.where((p) => p.categoryId == cat.id).toList(),
        ),
    ];
    final orphans =
        playlists.where((p) => p.categoryId == null).toList();

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
              child: Row(
                children: [
                  Expanded(
                    child: DrawerTitleBar(
                      title: 'ALL PLAYLISTS',
                      onClose: () => ref
                          .read(allPlaylistsDrawerOpenProvider.notifier)
                          .state = false,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Tooltip(
                    message: 'New category',
                    child: IconButton(
                      icon: Icon(Icons.create_new_folder_outlined,
                          size: 16, color: colors.textPrimary),
                      onPressed: () =>
                          showCreateCategoryDialog(context, ref),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                children: [
                  for (final g in groups) _CategorySection(group: g),
                  if (orphans.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    for (final pl in orphans) _PlaylistTile(playlist: pl),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryGroup {
  final PlaylistCategory category;
  final List<Playlist> playlists;

  _CategoryGroup({required this.category, required this.playlists});
}

class _CategorySection extends ConsumerWidget {
  final _CategoryGroup group;
  const _CategorySection({required this.group});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(6, 12, 6, 4),
          child: GestureDetector(
            onSecondaryTapDown: group.category.isDefault
                ? null
                : (details) =>
                    _showCategoryMenu(context, ref, details, group.category),
            child: Row(
              children: [
                Icon(Icons.folder_outlined,
                    size: 11, color: colors.textLight),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    group.category.name.toUpperCase(),
                    style: textTheme.labelSmall?.copyWith(
                      color: colors.textLight,
                      letterSpacing: 1.2,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '${group.playlists.length}',
                  style: textTheme.labelSmall?.copyWith(
                    color: colors.textLight.withValues(alpha: 0.7),
                  ),
                ),
                const SizedBox(width: 4),
                _AddPlaylistButton(
                  onTap: () => showCreatePlaylistInCategoryDialog(
                      context, ref, group.category),
                ),
              ],
            ),
          ),
        ),
        if (group.playlists.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 6, 4),
            child: Text(
              'empty',
              style: textTheme.bodySmall?.copyWith(
                color: colors.textLight.withValues(alpha: 0.5),
                fontStyle: FontStyle.italic,
              ),
            ),
          )
        else
          for (final pl in group.playlists)
            _PlaylistTile(playlist: pl),
      ],
    );
  }

  void _showCategoryMenu(
    BuildContext context,
    WidgetRef ref,
    TapDownDetails details,
    PlaylistCategory category,
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
          child:
              Text('Rename', style: TextStyle(color: colors.textPrimary)),
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
          await showRenameCategoryDialog(context, ref, category);
        case 'delete':
          await ref.read(libraryProvider.notifier).deleteCategory(category.id);
      }
    });
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
          padding:
              const EdgeInsets.symmetric(horizontal: 24, vertical: 6),
          color: _hovering ? colors.cardHover : Colors.transparent,
          child: Row(
            children: [
              Icon(
                isAllTracks ? Icons.library_music : Icons.queue_music,
                size: 12,
                color: colors.textLight,
              ),
              const SizedBox(width: 8),
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
    final library = ref.read(libraryProvider).valueOrNull;
    final categories = library?.categories ?? const <PlaylistCategory>[];

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
        if (categories.isNotEmpty) ...[
          const PopupMenuDivider(),
          PopupMenuItem(
            enabled: false,
            height: 24,
            child: Text(
              'Move to category',
              style: TextStyle(color: colors.textLight, fontSize: 10),
            ),
          ),
          for (final cat in categories)
            PopupMenuItem(
              value: 'move:${cat.id}',
              child: Row(
                children: [
                  Icon(
                    pl.categoryId == cat.id
                        ? Icons.radio_button_checked
                        : Icons.radio_button_unchecked,
                    size: 11,
                    color: pl.categoryId == cat.id
                        ? colors.primary
                        : colors.textLight,
                  ),
                  const SizedBox(width: 8),
                  Text(cat.name,
                      style: TextStyle(color: colors.textPrimary)),
                ],
              ),
            ),
        ],
      ],
    ).then((value) async {
      if (!context.mounted) return;
      if (value == null) return;
      switch (value) {
        case 'rename':
          await showRenamePlaylistDialog(context, ref, pl);
        case 'delete':
          await ref.read(libraryProvider.notifier).deletePlaylist(pl.id);
        default:
          if (value.startsWith('move:')) {
            final id = value.substring(5);
            await ref
                .read(libraryProvider.notifier)
                .assignPlaylistToCategory(pl.id, id);
          }
      }
    });
  }
}

class _AddPlaylistButton extends StatefulWidget {
  final VoidCallback onTap;

  const _AddPlaylistButton({required this.onTap});

  @override
  State<_AddPlaylistButton> createState() => _AddPlaylistButtonState();
}

class _AddPlaylistButtonState extends State<_AddPlaylistButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: Tooltip(
        message: 'New playlist in this category',
        child: GestureDetector(
          onTap: widget.onTap,
          child: Padding(
            padding: const EdgeInsets.all(2),
            child: Icon(
              Icons.add,
              size: 12,
              color: _hovering ? colors.primary : colors.textLight,
            ),
          ),
        ),
      ),
    );
  }
}
