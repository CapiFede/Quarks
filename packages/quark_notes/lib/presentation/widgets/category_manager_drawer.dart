import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/notes_providers.dart';

final categoryManagerDrawerOpenProvider = StateProvider<bool>((ref) => false);

class CategoryManagerDrawer extends ConsumerWidget {
  const CategoryManagerDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOpen = ref.watch(categoryManagerDrawerOpenProvider);
    if (!isOpen) return const SizedBox.shrink();

    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final state = ref.watch(notesProvider).valueOrNull;
    final categories = state?.categories ?? [];

    return Positioned(
      top: 0,
      bottom: 0,
      right: 0,
      child: Focus(
        autofocus: true,
        onKeyEvent: (node, event) {
          if (event is KeyDownEvent &&
              event.logicalKey == LogicalKeyboardKey.escape) {
            ref.read(categoryManagerDrawerOpenProvider.notifier).state = false;
            return KeyEventResult.handled;
          }
          return KeyEventResult.ignored;
        },
        child: Container(
          width: 300,
        decoration: BoxDecoration(
          color: colors.background,
          border: Border(
            left: BorderSide(color: colors.borderDark, width: 2),
          ),
          boxShadow: [
            BoxShadow(
              color: colors.cardShadow,
              offset: const Offset(-4, 0),
              blurRadius: 8,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'CATEGORÍAS',
                      style: textTheme.labelLarge?.copyWith(
                        color: colors.textSecondary,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: Icon(Icons.close, size: 16, color: colors.textLight),
                    onPressed: () => ref
                        .read(categoryManagerDrawerOpenProvider.notifier)
                        .state = false,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
            ),
            Container(
              height: 1,
              color: colors.border,
              margin: const EdgeInsets.symmetric(horizontal: 16),
            ),
            Expanded(
              child: categories.isEmpty
                  ? Center(
                      child: Text(
                        'Sin categorías',
                        style: textTheme.bodySmall
                            ?.copyWith(color: colors.textLight),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      itemCount: categories.length,
                      itemBuilder: (context, i) =>
                          _CategoryTile(category: categories[i]),
                    ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: _AddCategoryField(),
            ),
          ],
        ),
      ),
    ),
    );
  }
}

class _CategoryTile extends ConsumerStatefulWidget {
  final dynamic category;

  const _CategoryTile({required this.category});

  @override
  ConsumerState<_CategoryTile> createState() => _CategoryTileState();
}

class _CategoryTileState extends ConsumerState<_CategoryTile> {
  bool _editing = false;
  late final TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.category.name);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    if (_editing) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _ctrl,
                autofocus: true,
                style: textTheme.bodySmall?.copyWith(color: colors.textPrimary),
                decoration: InputDecoration(
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
                onSubmitted: (_) => _save(),
              ),
            ),
            const SizedBox(width: 4),
            IconButton(
              icon: Icon(Icons.check, size: 14, color: colors.primary),
              onPressed: _save,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
            ),
          ],
        ),
      );
    }

    return ListTile(
      dense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 8),
      title: Text(
        widget.category.name,
        style: textTheme.bodySmall?.copyWith(color: colors.textPrimary),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: Icon(Icons.edit, size: 14, color: colors.textLight),
            onPressed: () => setState(() => _editing = true),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
          const SizedBox(width: 4),
          IconButton(
            icon: Icon(Icons.delete, size: 14, color: colors.textLight),
            onPressed: () => _delete(context),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }

  void _save() {
    final name = _ctrl.text.trim();
    if (name.isNotEmpty && name != widget.category.name) {
      ref
          .read(notesProvider.notifier)
          .renameCategory(widget.category.id, name);
    }
    setState(() => _editing = false);
  }

  void _delete(BuildContext context) {
    ref.read(notesProvider.notifier).deleteCategory(widget.category.id);
  }
}

class _AddCategoryField extends ConsumerStatefulWidget {
  @override
  ConsumerState<_AddCategoryField> createState() => _AddCategoryFieldState();
}

class _AddCategoryFieldState extends ConsumerState<_AddCategoryField> {
  final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _ctrl,
            style: textTheme.bodySmall?.copyWith(color: colors.textPrimary),
            decoration: InputDecoration(
              hintText: 'Nueva categoría...',
              hintStyle:
                  textTheme.bodySmall?.copyWith(color: colors.textLight),
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
            onSubmitted: (_) => _create(),
          ),
        ),
        const SizedBox(width: 8),
        GestureDetector(
          onTap: _create,
          child: PixelBorder(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Icon(Icons.add, size: 14, color: colors.primary),
          ),
        ),
      ],
    );
  }

  void _create() {
    final name = _ctrl.text.trim();
    if (name.isEmpty) return;
    ref.read(notesProvider.notifier).createCategory(name);
    _ctrl.clear();
  }
}
