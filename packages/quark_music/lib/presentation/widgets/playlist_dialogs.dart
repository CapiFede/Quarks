import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/playlist.dart';
import '../providers/library_providers.dart';

Future<void> showCreatePlaylistDialog(
    BuildContext context, WidgetRef ref) async {
  final controller = TextEditingController();
  final colors = context.quarksColors;

  await showDialog<void>(
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
          child:
              Text('Cancel', style: TextStyle(color: colors.textSecondary)),
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

Future<void> showRenamePlaylistDialog(
    BuildContext context, WidgetRef ref, Playlist playlist) async {
  final controller = TextEditingController(text: playlist.name);
  final colors = context.quarksColors;

  await showDialog<void>(
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
          child:
              Text('Cancel', style: TextStyle(color: colors.textSecondary)),
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
