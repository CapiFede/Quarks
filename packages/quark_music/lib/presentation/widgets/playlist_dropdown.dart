import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

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
    final libraryAsync = ref.watch(libraryProvider);
    final playlists = libraryAsync.valueOrNull?.playlists ?? [];
    final track = ref.watch(playerProvider).displayTrack;

    if (track == null) return const SizedBox.shrink();

    const popupWidth = 200.0;

    final popupContent = Material(
      color: Colors.transparent,
      child: PixelBorder(
        backgroundColor: colors.surface,
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: SizedBox(
          width: popupWidth,
          child: playlists.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 4),
                  child: Text(
                    'No playlists',
                    style: textTheme.bodySmall
                        ?.copyWith(color: colors.textLight),
                  ),
                )
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 4),
                      child: Text(
                        'PLAYLISTS',
                        style: textTheme.labelSmall
                            ?.copyWith(color: colors.textSecondary),
                      ),
                    ),
                    const SizedBox(height: 4),
                    for (final pl in playlists)
                      Padding(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 4),
                        child: PlaylistCheckbox(
                          name: pl.name,
                          checked:
                              pl.trackPaths.contains(track.path),
                          onChanged: () {
                            if (pl.trackPaths.contains(track.path)) {
                              ref
                                  .read(libraryProvider.notifier)
                                  .removeTrackFromPlaylist(
                                      pl.id, track.path);
                            } else {
                              ref
                                  .read(libraryProvider.notifier)
                                  .addTrackToPlaylist(pl.id, track);
                            }
                          },
                        ),
                      ),
                  ],
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
