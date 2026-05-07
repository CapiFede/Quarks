import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/track.dart';
import '../providers/library_providers.dart';

Future<void> showRenameTrackDialog(
    BuildContext context, WidgetRef ref, Track track) async {
  final controller = TextEditingController(text: track.title);
  final colors = context.quarksColors;

  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: colors.surface,
      title: Text(
        'Rename file',
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
          hintText: 'New name (without extension)',
          hintStyle: TextStyle(color: colors.textLight),
        ),
        onSubmitted: (value) {
          final name = value.trim();
          if (name.isNotEmpty) {
            ref
                .read(libraryProvider.notifier)
                .renameTrackFile(track.path, name);
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
                  .renameTrackFile(track.path, name);
              Navigator.of(ctx).pop();
            }
          },
          child: Text('Rename', style: TextStyle(color: colors.primary)),
        ),
      ],
    ),
  );
}

Future<void> showDeleteTrackDialog(
    BuildContext context, WidgetRef ref, Track track) async {
  final colors = context.quarksColors;

  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: colors.surface,
      title: Text(
        'Delete file?',
        style: Theme.of(context)
            .textTheme
            .titleSmall
            ?.copyWith(color: colors.textPrimary),
      ),
      content: Text(
        '"${track.title}" will be removed from disk and from every playlist.',
        style: Theme.of(context)
            .textTheme
            .bodySmall
            ?.copyWith(color: colors.textSecondary),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child:
              Text('Cancel', style: TextStyle(color: colors.textSecondary)),
        ),
        TextButton(
          onPressed: () {
            ref.read(libraryProvider.notifier).deleteTrack(track.path);
            Navigator.of(ctx).pop();
          },
          child: Text('Delete', style: TextStyle(color: colors.error)),
        ),
      ],
    ),
  );
}
