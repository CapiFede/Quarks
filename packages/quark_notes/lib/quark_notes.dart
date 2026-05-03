import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import 'presentation/pages/note_editor_page.dart';
import 'presentation/pages/notes_page.dart';
import 'presentation/providers/notes_providers.dart';
import 'presentation/widgets/category_filter_bar.dart';
import 'presentation/widgets/category_manager_drawer.dart';

class NotesModule extends Quark {
  @override
  String get id => 'quark_notes';

  @override
  String get name => 'Quark Notes';

  @override
  IconData get icon => Icons.note_alt_outlined;

  @override
  Widget buildPage() {
    return Consumer(
      builder: (context, ref, _) {
        final activeId = ref.watch(activeNoteIdProvider);
        if (activeId == null) {
          return const NotesPage();
        }
        return NoteEditorPage(noteId: activeId);
      },
    );
  }

  @override
  List<QuarkSettingOption> buildSettings(BuildContext context, WidgetRef ref) {
    return [
      QuarkSettingOption(
        id: 'new_note',
        label: 'Nueva nota',
        icon: Icons.add,
        onTap: () => ref.read(activeNoteIdProvider.notifier).state = 'new',
      ),
      QuarkSettingOption(
        id: 'manage_categories',
        label: 'Categorías',
        icon: Icons.folder_outlined,
        onTap: () => ref
            .read(categoryManagerDrawerOpenProvider.notifier)
            .update((v) => !v),
      ),
    ];
  }

  @override
  List<QuarkPinnedItem> buildDynamicPinned(
      BuildContext context, WidgetRef ref) {
    final state = ref.watch(notesProvider).valueOrNull;
    if (state == null) return const [];

    final pinnedIds = ref.watch(pinStateProvider.select(
      (async) =>
          async.valueOrNull?[id]?.dynamicItems ?? const <String>{},
    ));

    final items = <QuarkPinnedItem>[];

    // "Todas" chip is always first when pinned
    if (pinnedIds.contains('all')) {
      items.add(QuarkPinnedItem(
        id: 'cat_all',
        builder: (ctx) => CategoryChipWidget(
          categoryId: 'all',
          categoryName: 'Todas',
          isSelected: state.selectedCategoryId == null,
          onTap: () => ref.read(notesProvider.notifier).selectCategory(null),
          onSecondaryTap: (_) => ref
              .read(pinStateProvider.notifier)
              .unpinDynamic(id, 'all'),
        ),
      ));
    }

    for (final cat in state.categories) {
      if (!pinnedIds.contains(cat.id)) continue;
      items.add(QuarkPinnedItem(
        id: 'cat_${cat.id}',
        builder: (ctx) => CategoryChipWidget(
          categoryId: cat.id,
          categoryName: cat.name,
          isSelected: state.selectedCategoryId == cat.id,
          onTap: () =>
              ref.read(notesProvider.notifier).selectCategory(cat.id),
          onSecondaryTap: (_) => ref
              .read(pinStateProvider.notifier)
              .unpinDynamic(id, cat.id),
        ),
      ));
    }

    return items;
  }

  @override
  Widget? buildOverlay(BuildContext context, WidgetRef ref) {
    return const Stack(
      children: [
        CategoryManagerDrawer(),
      ],
    );
  }

  @override
  Future<void> initialize() async {}

  @override
  void dispose() {}
}
