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
import 'presentation/widgets/all_playlists_drawer.dart';
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
    final library = ref.watch(libraryProvider).valueOrNull;
    final isScanning = library?.isScanning ?? false;

    return [
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
      QuarkSettingOption(
        id: 'rescan',
        label: isScanning ? 'Scanning…' : 'Rescan music folder',
        icon: Icons.refresh,
        onTap: isScanning
            ? () {}
            : () => ref.read(libraryProvider.notifier).rescanMusicFolder(),
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
  List<QuarkPinnedItem> buildDynamicPinned(
      BuildContext context, WidgetRef ref) {
    final library = ref.watch(libraryProvider).valueOrNull;
    if (library == null) return const [];

    final pinnedIds = ref.watch(pinStateProvider.select(
      (async) => async.valueOrNull?[id]?.dynamicItems ?? const <String>{},
    ));

    // All Tracks is treated as a regular playlist: it appears in the bar
    // only when pinned, just like any other.
    final allPlaylists = [Playlist.allTracks(), ...library.playlists];

    final items = <QuarkPinnedItem>[];
    for (final pl in allPlaylists) {
      if (!pinnedIds.contains(pl.id)) continue;
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
    final isAllTracks = pl.isAllTracks;

    showMenu<String>(
      context: context,
      position: RelativeRect.fromLTRB(pos.dx, pos.dy, pos.dx, pos.dy),
      color: colors.surface,
      items: [
        PopupMenuItem(
          value: 'unpin',
          child: Text('Unpin', style: TextStyle(color: colors.textPrimary)),
        ),
        if (!isAllTracks)
          PopupMenuItem(
            value: 'rename',
            child:
                Text('Rename', style: TextStyle(color: colors.textPrimary)),
          ),
        if (!isAllTracks)
          PopupMenuItem(
            value: 'delete',
            child: Text('Delete', style: TextStyle(color: colors.error)),
          ),
      ],
    ).then((value) async {
      if (!context.mounted) return;
      switch (value) {
        case 'unpin':
          await ref.read(pinStateProvider.notifier).unpinDynamic(id, pl.id);
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
