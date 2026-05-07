import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/playlist_category.dart';
import '../providers/library_providers.dart';

Future<void> showCreateCategoryDialog(
    BuildContext context, WidgetRef ref) async {
  final controller = TextEditingController();
  final colors = context.quarksColors;

  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: colors.surface,
      title: Text(
        'New category',
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
          hintText: 'Category name',
          hintStyle: TextStyle(color: colors.textLight),
        ),
        onSubmitted: (value) {
          final name = value.trim();
          if (name.isNotEmpty) {
            ref.read(libraryProvider.notifier).createCategory(name);
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
              ref.read(libraryProvider.notifier).createCategory(name);
              Navigator.of(ctx).pop();
            }
          },
          child: Text('Create', style: TextStyle(color: colors.primary)),
        ),
      ],
    ),
  );
}

Future<void> showRenameCategoryDialog(
    BuildContext context, WidgetRef ref, PlaylistCategory category) async {
  final controller = TextEditingController(text: category.name);
  final colors = context.quarksColors;

  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: colors.surface,
      title: Text(
        'Rename category',
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
          final name = value.trim();
          if (name.isNotEmpty) {
            ref
                .read(libraryProvider.notifier)
                .renameCategory(category.id, name);
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
                  .renameCategory(category.id, name);
              Navigator.of(ctx).pop();
            }
          },
          child: Text('Rename', style: TextStyle(color: colors.primary)),
        ),
      ],
    ),
  );
}
