import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/notes_providers.dart';

const _quarkId = 'quark_notes';

class CategoryFilterBar extends ConsumerWidget {
  const CategoryFilterBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(notesProvider).valueOrNull;
    if (state == null) return const SizedBox.shrink();

    final categories = state.categories;
    final selectedId = state.selectedCategoryId;
    final pinnedIds = ref.watch(pinStateProvider.select(
      (async) =>
          async.valueOrNull?[_quarkId]?.dynamicItems ?? const <String>{},
    ));

    return SizedBox(
      height: 32,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        children: [
          _CategoryChip(
            label: 'Todas',
            isSelected: selectedId == null,
            isPinned: pinnedIds.contains('all'),
            onTap: () =>
                ref.read(notesProvider.notifier).selectCategory(null),
            onSecondaryTap: (_) => ref
                .read(pinStateProvider.notifier)
                .toggleDynamic(_quarkId, 'all'),
          ),
          for (final cat in categories)
            _CategoryChip(
              label: cat.name,
              isSelected: selectedId == cat.id,
              isPinned: pinnedIds.contains(cat.id),
              onTap: () =>
                  ref.read(notesProvider.notifier).selectCategory(cat.id),
              onSecondaryTap: (_) => ref
                  .read(pinStateProvider.notifier)
                  .toggleDynamic(_quarkId, cat.id),
            ),
        ],
      ),
    );
  }
}

class CategoryChipWidget extends ConsumerStatefulWidget {
  final String categoryId;
  final String categoryName;
  final bool isSelected;
  final VoidCallback onTap;
  final void Function(TapDownDetails)? onSecondaryTap;

  const CategoryChipWidget({
    super.key,
    required this.categoryId,
    required this.categoryName,
    required this.isSelected,
    required this.onTap,
    this.onSecondaryTap,
  });

  @override
  ConsumerState<CategoryChipWidget> createState() => _CategoryChipWidgetState();
}

class _CategoryChipWidgetState extends ConsumerState<CategoryChipWidget> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    final Color borderColor = widget.isSelected
        ? colors.primary
        : _hovering
            ? colors.borderDark
            : Colors.transparent;
    final Color textColor = widget.isSelected
        ? colors.primary
        : _hovering
            ? colors.textPrimary
            : colors.textSecondary;

    return Padding(
      padding: const EdgeInsets.only(right: 2),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          onTap: widget.onTap,
          onSecondaryTapDown: widget.onSecondaryTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 1),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: borderColor, width: 2),
              ),
            ),
            child: Text(
              widget.categoryName,
              style: textTheme.labelMedium?.copyWith(color: textColor),
            ),
          ),
        ),
      ),
    );
  }
}

class _CategoryChip extends StatefulWidget {
  final String label;
  final bool isSelected;
  final bool isPinned;
  final VoidCallback onTap;
  final void Function(TapDownDetails)? onSecondaryTap;

  const _CategoryChip({
    required this.label,
    required this.isSelected,
    required this.isPinned,
    required this.onTap,
    this.onSecondaryTap,
  });

  @override
  State<_CategoryChip> createState() => _CategoryChipState();
}

class _CategoryChipState extends State<_CategoryChip> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    final Color borderColor = widget.isSelected
        ? colors.primary
        : _hovering
            ? colors.borderDark
            : Colors.transparent;
    final Color textColor = widget.isSelected
        ? colors.primary
        : _hovering
            ? colors.textPrimary
            : colors.textSecondary;

    return Padding(
      padding: const EdgeInsets.only(right: 2),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          onTap: widget.onTap,
          onSecondaryTapDown: widget.onSecondaryTap,
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 9),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: borderColor, width: 2),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.label,
                  style: textTheme.labelMedium?.copyWith(color: textColor),
                ),
                if (widget.isPinned) ...
                  [
                    const SizedBox(width: 4),
                    Icon(Icons.push_pin, size: 9, color: colors.textLight),
                  ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
