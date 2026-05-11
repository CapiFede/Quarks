import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio_media_kit/just_audio_media_kit.dart';
import 'package:quark_core/quark_core.dart';

import 'domain/entities/playlist.dart';
import 'presentation/pages/music_page.dart';
import 'presentation/providers/download_providers.dart';
import 'presentation/providers/drive_sync_providers.dart';
import 'presentation/providers/library_providers.dart';
import 'presentation/providers/song_info_providers.dart';
import 'presentation/widgets/all_playlists_drawer.dart';
import 'presentation/widgets/category_dropdown.dart';
import 'presentation/widgets/download_drawer.dart';
import 'presentation/widgets/drive_sync_drawer.dart';
import 'presentation/widgets/playlist_chip.dart';
import 'presentation/widgets/playlist_dialogs.dart';
import 'presentation/widgets/song_info_drawer.dart';

class MusicModule extends Quark {
  @override
  String get id => 'quark_music';

  @override
  String get name => 'Quark Music';

  @override
  IconData get icon => Icons.music_note;

  @override
  Widget buildPage() => const MusicPage();

  @override
  List<QuarkSettingOption> buildSettings(
      BuildContext context, WidgetRef ref) {
    return [
      QuarkSettingOption(
        id: 'view_all_tracks',
        label: 'View all tracks',
        icon: Icons.library_music,
        onTap: () => ref.read(libraryProvider.notifier).showAllTracksChip(),
      ),
      QuarkSettingOption(
        id: 'new_playlist',
        label: 'New playlist',
        icon: Icons.playlist_add,
        onTap: () => showCreatePlaylistDialog(context, ref),
      ),
      QuarkSettingOption(
        id: 'view_all_playlists',
        label: 'All playlists',
        icon: Icons.queue_music,
        onTap: () => ref
            .read(allPlaylistsDrawerOpenProvider.notifier)
            .update((v) => !v),
      ),
      if (!Platform.isAndroid && !Platform.isIOS)
        QuarkSettingOption(
          id: 'open_folder',
          label: 'Open music folder',
          icon: Icons.folder_open,
          onTap: () => ref.read(libraryProvider.notifier).openMusicFolder(),
        ),
      if (Platform.isWindows)
        QuarkSettingOption(
          id: 'download',
          label: 'Download',
          icon: Icons.download,
          onTap: () => ref.read(downloadProvider.notifier).toggleDrawer(),
        ),
      QuarkSettingOption(
        id: 'cloud_sync',
        label: 'Cloud sync',
        icon: Icons.cloud,
        onTap: () => ref.read(driveSyncProvider.notifier).toggleDrawer(),
      ),
    ];
  }

  @override
  Widget? buildPinnedBarLeft(BuildContext context, WidgetRef ref) {
    return const CategoryDropdown();
  }

  @override
  List<QuarkPinnedItem> buildDynamicPinned(
      BuildContext context, WidgetRef ref) {
    final library = ref.watch(libraryProvider).valueOrNull;
    if (library == null) return const [];

    final items = <QuarkPinnedItem>[];

    // All Tracks chip shows when either:
    //   - No categories exist yet (forced; can't be closed because there'd be
    //     nothing left in the bar), or
    //   - The user opted in via the gear menu (pinned; closable with X).
    final hasCategories = library.categories.isNotEmpty;
    final showAllTracks =
        !hasCategories || library.allTracksChipPinned;
    final allTracksClosable = hasCategories && library.allTracksChipPinned;

    if (showAllTracks) {
      items.add(QuarkPinnedItem(
        id: 'playlist_${Playlist.allTracksId}',
        builder: (ctx) => PlaylistChip(
          name: 'All Tracks',
          isSelected:
              library.selectedPlaylistId == Playlist.allTracksId,
          onTap: () => ref
              .read(libraryProvider.notifier)
              .selectPlaylist(Playlist.allTracksId),
          onClose: allTracksClosable
              ? () => ref
                  .read(libraryProvider.notifier)
                  .hideAllTracksChip()
              : null,
        ),
      ));
    }

    for (final pl in library.playlistsInSelectedCategory) {
      items.add(QuarkPinnedItem(
        id: 'playlist_${pl.id}',
        builder: (ctx) => PlaylistChip(
          name: pl.name,
          isSelected: library.selectedPlaylistId == pl.id,
          onTap: () =>
              ref.read(libraryProvider.notifier).selectPlaylist(pl.id),
          onSecondaryTap: (details) =>
              _showChipContextMenu(ctx, ref, pl, details),
        ),
      ));
    }
    return items;
  }

  void _showChipContextMenu(
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

  @override
  Widget? buildOverlay(BuildContext context, WidgetRef ref) {
    // Drawers are mounted at shell level so they extend over the toolbars,
    // not just the page body. Each drawer is self-hiding when closed.
    return const Stack(
      children: [
        DownloadDrawer(),
        SongInfoDrawer(),
        DriveSyncDrawer(),
        AllPlaylistsDrawer(),
      ],
    );
  }

  @override
  bool onEscape(WidgetRef ref) {
    if (ref.read(songInfoProvider).drawerOpen) {
      ref.read(songInfoProvider.notifier).closeDrawer();
      return true;
    }
    if (ref.read(downloadProvider).drawerOpen) {
      ref.read(downloadProvider.notifier).closeDrawer();
      return true;
    }
    if (ref.read(driveSyncProvider).drawerOpen) {
      ref.read(driveSyncProvider.notifier).closeDrawer();
      return true;
    }
    if (ref.read(allPlaylistsDrawerOpenProvider)) {
      ref.read(allPlaylistsDrawerOpenProvider.notifier).state = false;
      return true;
    }
    return false;
  }

  @override
  Future<void> initialize() async {
    // just_audio uses ExoPlayer (Android) / AVPlayer (iOS, macOS) natively.
    // media_kit is only needed as a backend on Windows/Linux.
    if (Platform.isWindows || Platform.isLinux) {
      JustAudioMediaKit.ensureInitialized();
    }
  }

  @override
  void dispose() {}
}
