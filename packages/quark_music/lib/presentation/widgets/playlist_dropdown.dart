import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/playlist.dart';
import '../../domain/entities/playlist_category.dart';
import '../providers/library_providers.dart';
import '../providers/music_providers.dart';
import 'drawer_widgets.dart';

class PlaylistDropdown extends ConsumerStatefulWidget {
  const PlaylistDropdown({super.key});

  @override
  ConsumerState<PlaylistDropdown> createState() => _PlaylistDropdownState();
}

class _PlaylistDropdownState extends ConsumerState<PlaylistDropdown> {
  final _buttonKey = GlobalKey();
  OverlayEntry? _overlayEntry;
  final _groupId = Object();

  bool get _isOpen => _overlayEntry != null;

  void _toggle() {
    if (_isOpen) {
      _close();
    } else {
      _open();
    }
  }

  void _open() {
    final renderBox =
        _buttonKey.currentContext?.findRenderObject() as RenderBox?;
    if (renderBox == null) return;

    final overlay = Overlay.of(context);
    final buttonPos = renderBox.localToGlobal(Offset.zero, ancestor: overlay.context.findRenderObject());
    final buttonSize = renderBox.size;

    _overlayEntry = OverlayEntry(
      builder: (_) => _PlaylistOverlay(
        groupId: _groupId,
        buttonRect: Rect.fromLTWH(
          buttonPos.dx,
          buttonPos.dy,
          buttonSize.width,
          buttonSize.height,
        ),
        onClose: _close,
      ),
    );

    overlay.insert(_overlayEntry!);
    setState(() {});
  }

  void _close() {
    _overlayEntry?.remove();
    _overlayEntry = null;
    setState(() {});
  }

  @override
  void dispose() {
    _overlayEntry?.remove();
    _overlayEntry = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    return TapRegion(
      groupId: _groupId,
      child: IconButton(
        key: _buttonKey,
        icon: const Icon(Icons.playlist_add),
        iconSize: 20,
        color: _isOpen ? colors.primary : colors.textSecondary,
        onPressed: _toggle,
      ),
    );
  }
}

class _PlaylistOverlay extends ConsumerWidget {
  final Object groupId;
  final Rect buttonRect;
  final VoidCallback onClose;

  const _PlaylistOverlay({
    required this.groupId,
    required this.buttonRect,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final library = ref.watch(libraryProvider).valueOrNull;
    final track = ref.watch(playerProvider).displayTrack;

    if (track == null) return const SizedBox.shrink();

    final allPlaylists = library?.playlists ?? const <Playlist>[];
    final categories = library?.categories ?? const <PlaylistCategory>[];
    // When All Tracks is selected the user has no "current category" context,
    // so we expand the dropdown to the entire library — grouped by category
    // — instead of the usual filtered slice.
    final showAllGrouped =
        library?.selectedPlaylistId == Playlist.allTracksId;

    void toggle(Playlist pl) {
      if (pl.trackPaths.contains(track.path)) {
        ref
            .read(libraryProvider.notifier)
            .removeTrackFromPlaylist(pl.id, track.path);
      } else {
        ref.read(libraryProvider.notifier).addTrackToPlaylist(pl.id, track);
      }
    }

    Widget checkboxFor(Playlist pl) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: PlaylistCheckbox(
            name: pl.name,
            checked: pl.trackPaths.contains(track.path),
            onChanged: () => toggle(pl),
          ),
        );

    final List<Widget> body;
    if (showAllGrouped) {
      // Whole-library view, grouped by category. Empty categories are
      // skipped; orphan playlists (legacy uncategorized) hang off the end
      // without a header — same pattern as the All Playlists drawer.
      final groups = <(PlaylistCategory, List<Playlist>)>[
        for (final cat in categories)
          (cat, allPlaylists.where((p) => p.categoryId == cat.id).toList()),
      ].where((g) => g.$2.isNotEmpty).toList();
      final orphans =
          allPlaylists.where((p) => p.categoryId == null).toList();

      if (groups.isEmpty && orphans.isEmpty) {
        body = [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Text(
              'No playlists',
              style:
                  textTheme.bodySmall?.copyWith(color: colors.textLight),
            ),
          ),
        ];
      } else {
        body = [
          for (var i = 0; i < groups.length; i++) ...[
            if (i > 0) const SizedBox(height: 6),
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: Text(
                groups[i].$1.name.toUpperCase(),
                style: textTheme.labelSmall?.copyWith(
                  color: colors.textLight,
                  letterSpacing: 1.2,
                ),
              ),
            ),
            for (final pl in groups[i].$2) checkboxFor(pl),
          ],
          if (orphans.isNotEmpty) ...[
            if (groups.isNotEmpty) const SizedBox(height: 6),
            for (final pl in orphans) checkboxFor(pl),
          ],
        ];
      }
    } else {
      final playlists = library?.playlistsInSelectedCategory ?? const [];
      if (playlists.isEmpty) {
        body = [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Text(
              'No playlists',
              style:
                  textTheme.bodySmall?.copyWith(color: colors.textLight),
            ),
          ),
        ];
      } else {
        body = [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Text(
              'PLAYLISTS',
              style: textTheme.labelSmall
                  ?.copyWith(color: colors.textSecondary),
            ),
          ),
          const SizedBox(height: 4),
          for (final pl in playlists) checkboxFor(pl),
        ];
      }
    }

    const popupWidth = 220.0;

    final popupContent = Material(
      color: Colors.transparent,
      child: PixelBorder(
        backgroundColor: colors.surface,
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            maxHeight: 360,
            minWidth: popupWidth,
            maxWidth: popupWidth,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: body,
            ),
          ),
        ),
      ),
    );

    return TapRegion(
      groupId: groupId,
      onTapOutside: (_) => onClose(),
      child: Stack(
        children: [
          Positioned(
            left: buttonRect.center.dx - popupWidth / 2,
            bottom: MediaQuery.of(context).size.height - buttonRect.top + 4,
            child: popupContent,
          ),
        ],
      ),
    );
  }
}
