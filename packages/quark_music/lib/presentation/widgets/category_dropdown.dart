import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/playlist_category.dart';
import '../providers/library_providers.dart';
import 'all_playlists_drawer.dart';
import 'playlist_category_dialogs.dart';

class CategoryDropdown extends ConsumerStatefulWidget {
  const CategoryDropdown({super.key});

  @override
  ConsumerState<CategoryDropdown> createState() => _CategoryDropdownState();
}

class _CategoryDropdownState extends ConsumerState<CategoryDropdown> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final library = ref.watch(libraryProvider).valueOrNull;
    if (library == null) return const SizedBox.shrink();

    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    final selectedId = library.selectedCategoryId;
    final selectedCategory = library.categories
            .where((c) => c.id == selectedId)
            .firstOrNull ??
        PlaylistCategory.defaultCategory();

    final color = _hovering ? colors.textPrimary : colors.textSecondary;

    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          onTapDown: (details) => _showMenu(context, ref, details, library),
          onSecondaryTapDown: selectedCategory.isDefault
              ? null
              : (details) =>
                  _showCategoryActionsMenu(context, ref, details, selectedCategory),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(
              border: Border.all(color: colors.borderDark, width: 1),
              color: colors.surface,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.folder_outlined, size: 11, color: color),
                const SizedBox(width: 4),
                Text(
                  selectedCategory.name,
                  style: textTheme.labelMedium?.copyWith(color: color),
                ),
                Icon(Icons.arrow_drop_down, size: 14, color: color),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showMenu(
    BuildContext context,
    WidgetRef ref,
    TapDownDetails details,
    library,
  ) {
    final colors = context.quarksColors;
    final pos = details.globalPosition;
    final selectedId = library.selectedCategoryId;
    final defaultCat = PlaylistCategory.defaultCategory();
    final categories = [defaultCat, ...library.categories];

    showMenu<String>(
      context: context,
      position: RelativeRect.fromLTRB(pos.dx, pos.dy + 12, pos.dx, pos.dy),
      color: colors.surface,
      items: [
        for (final cat in categories)
          PopupMenuItem(
            value: 'select:${cat.id}',
            child: Row(
              children: [
                Icon(
                  cat.id == selectedId
                      ? Icons.radio_button_checked
                      : Icons.radio_button_unchecked,
                  size: 12,
                  color: cat.id == selectedId
                      ? colors.primary
                      : colors.textLight,
                ),
                const SizedBox(width: 8),
                Text(cat.name, style: TextStyle(color: colors.textPrimary)),
              ],
            ),
          ),
        const PopupMenuDivider(),
        PopupMenuItem(
          value: 'new',
          child: Row(
            children: [
              Icon(Icons.add, size: 12, color: colors.textPrimary),
              const SizedBox(width: 8),
              Text('New category…',
                  style: TextStyle(color: colors.textPrimary)),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'manage',
          child: Row(
            children: [
              Icon(Icons.queue_music, size: 12, color: colors.textPrimary),
              const SizedBox(width: 8),
              Text('Manage playlists…',
                  style: TextStyle(color: colors.textPrimary)),
            ],
          ),
        ),
      ],
    ).then((value) async {
      if (value == null || !context.mounted) return;
      if (value.startsWith('select:')) {
        final id = value.substring(7);
        ref.read(libraryProvider.notifier).selectCategory(id);
      } else if (value == 'new') {
        await showCreateCategoryDialog(context, ref);
      } else if (value == 'manage') {
        ref.read(allPlaylistsDrawerOpenProvider.notifier).state = true;
      }
    });
  }

  void _showCategoryActionsMenu(
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
          child: Text('Rename', style: TextStyle(color: colors.textPrimary)),
        ),
        PopupMenuItem(
          value: 'delete',
          child: Text('Delete', style: TextStyle(color: colors.error)),
        ),
      ],
    ).then((value) async {
      if (value == null || !context.mounted) return;
      switch (value) {
        case 'rename':
          await showRenameCategoryDialog(context, ref, category);
        case 'delete':
          await ref
              .read(libraryProvider.notifier)
              .deleteCategory(category.id);
      }
    });
  }
}
