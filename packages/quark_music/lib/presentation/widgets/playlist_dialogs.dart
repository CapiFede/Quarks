import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/playlist.dart';
import '../../domain/entities/playlist_category.dart';
import '../providers/library_providers.dart';
import 'playlist_category_dialogs.dart';

Future<void> showCreatePlaylistDialog(
    BuildContext context, WidgetRef ref) async {
  final library = ref.read(libraryProvider).valueOrNull;
  final categories = library?.categories ?? const <PlaylistCategory>[];

  // Categories are now mandatory, so dead-end the user with a friendly nudge
  // (and a one-click jump into category creation) instead of letting them name
  // a playlist that has nowhere to live.
  if (categories.isEmpty) {
    await _showNoCategoriesDialog(context, ref);
    return;
  }

  final selectedCategoryId = library?.selectedCategoryId;
  final initialCategory = categories
          .where((c) => c.id == selectedCategoryId)
          .firstOrNull ??
      categories.first;

  final controller = TextEditingController();
  final colors = context.quarksColors;
  var chosenCategoryId = initialCategory.id;

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) {
        void submit() {
          final name = controller.text.trim();
          if (name.isEmpty) return;
          ref
              .read(libraryProvider.notifier)
              .createPlaylist(name, categoryId: chosenCategoryId);
          Navigator.of(ctx).pop();
        }

        return AlertDialog(
          backgroundColor: colors.surface,
          title: Text(
            'New Playlist',
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(color: colors.textPrimary),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
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
                onSubmitted: (_) => submit(),
              ),
              const SizedBox(height: 16),
              Text(
                'CATEGORY',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: colors.textSecondary,
                      letterSpacing: 1.2,
                    ),
              ),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                initialValue: chosenCategoryId,
                isDense: true,
                dropdownColor: colors.surface,
                decoration: const InputDecoration(
                  isDense: true,
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                ),
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: colors.textPrimary),
                items: [
                  for (final cat in categories)
                    DropdownMenuItem(
                      value: cat.id,
                      child: Text(cat.name),
                    ),
                ],
                onChanged: (value) {
                  if (value == null) return;
                  setState(() => chosenCategoryId = value);
                },
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text('Cancel',
                  style: TextStyle(color: colors.textSecondary)),
            ),
            TextButton(
              onPressed: submit,
              child:
                  Text('Create', style: TextStyle(color: colors.primary)),
            ),
          ],
        );
      },
    ),
  );
}

Future<void> showCreatePlaylistInCategoryDialog(
    BuildContext context, WidgetRef ref, PlaylistCategory category) async {
  final controller = TextEditingController();
  final colors = context.quarksColors;

  await showDialog<void>(
    context: context,
    builder: (ctx) {
      void submit() {
        final name = controller.text.trim();
        if (name.isEmpty) return;
        ref
            .read(libraryProvider.notifier)
            .createPlaylist(name, categoryId: category.id);
        Navigator.of(ctx).pop();
      }

      return AlertDialog(
        backgroundColor: colors.surface,
        title: Text(
          'New playlist in ${category.name}',
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
          onSubmitted: (_) => submit(),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text('Cancel',
                style: TextStyle(color: colors.textSecondary)),
          ),
          TextButton(
            onPressed: submit,
            child: Text('Create', style: TextStyle(color: colors.primary)),
          ),
        ],
      );
    },
  );
}

Future<void> _showNoCategoriesDialog(
    BuildContext context, WidgetRef ref) async {
  final colors = context.quarksColors;
  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: colors.surface,
      title: Text(
        'Create a category first',
        style: Theme.of(context)
            .textTheme
            .titleSmall
            ?.copyWith(color: colors.textPrimary),
      ),
      content: Text(
        'Playlists belong to a category. Create one to get started.',
        style: Theme.of(context)
            .textTheme
            .bodyMedium
            ?.copyWith(color: colors.textSecondary),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child:
              Text('Cancel', style: TextStyle(color: colors.textSecondary)),
        ),
        TextButton(
          onPressed: () async {
            Navigator.of(ctx).pop();
            await showCreateCategoryDialog(context, ref);
          },
          child: Text('New category',
              style: TextStyle(color: colors.primary)),
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
