import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/notes_providers.dart';
import '../widgets/category_filter_bar.dart';
import '../widgets/new_note_tile.dart';
import '../widgets/note_action_bar.dart';
import '../widgets/note_card.dart';

class NotesPage extends ConsumerWidget {
  const NotesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final notesAsync = ref.watch(notesProvider);
    final filteredNotes = ref.watch(filteredNotesProvider);
    final state = notesAsync.valueOrNull;

    return Column(
      children: [
        // Search bar
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
          child: SizedBox(
            height: 30,
            child: TextField(
              style: textTheme.bodySmall?.copyWith(color: colors.textPrimary),
              decoration: InputDecoration(
                hintText: 'Buscar notas...',
                hintStyle:
                    textTheme.bodySmall?.copyWith(color: colors.textLight),
                prefixIcon: Icon(Icons.search, size: 14, color: colors.textLight),
                isDense: true,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.zero,
                  borderSide: BorderSide(color: colors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.zero,
                  borderSide: BorderSide(color: colors.primary),
                ),
              ),
              onChanged: (v) =>
                  ref.read(notesProvider.notifier).setSearchQuery(v),
            ),
          ),
        ),
        // Category filter bar
        const CategoryFilterBar(),
        const SizedBox(height: 8),
        // Notes grid
        Expanded(
          child: notesAsync.isLoading
              ? Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: colors.primary,
                    ),
                  ),
                )
              : (filteredNotes.isEmpty &&
                      state?.searchQuery.isNotEmpty == true)
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.note_outlined,
                              size: 32, color: colors.textLight),
                          const SizedBox(height: 8),
                          Text(
                            'Sin resultados',
                            style: textTheme.bodySmall
                                ?.copyWith(color: colors.textLight),
                          ),
                        ],
                      ),
                    )
                  : GridView.builder(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                      gridDelegate:
                          const SliverGridDelegateWithMaxCrossAxisExtent(
                        maxCrossAxisExtent: 220,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                        childAspectRatio: 0.85,
                      ),
                      itemCount: filteredNotes.length + 1,
                      itemBuilder: (context, i) {
                        if (i == 0) return const NewNoteTile();
                        final note = filteredNotes[i - 1];
                        final categoryName = state?.categories
                            .where((c) => c.id == note.categoryId)
                            .firstOrNull
                            ?.name;
                        return NoteCard(
                          note: note,
                          categoryName: categoryName,
                        );
                      },
                    ),
        ),
        const NoteActionBar(),
      ],
    );
  }
}
