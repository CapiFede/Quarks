import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/category.dart';
import '../../domain/entities/note.dart';
import '../providers/notes_providers.dart';
import 'note_color_picker.dart';

class NoteActionBar extends ConsumerStatefulWidget {
  const NoteActionBar({super.key});

  @override
  ConsumerState<NoteActionBar> createState() => _NoteActionBarState();
}

class _NoteActionBarState extends ConsumerState<NoteActionBar> {
  late TextEditingController _nameController;
  String? _lastNoteId;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _syncNameController(Note note) {
    if (_lastNoteId != note.id) {
      _lastNoteId = note.id;
      _nameController.text = note.name ?? '';
    }
  }

  Future<void> _saveName(Note note, String name) async {
    final trimmed = name.trim();
    final updated = note.copyWith(name: trimmed.isEmpty ? null : trimmed);
    await ref.read(notesProvider.notifier).saveNote(updated);
  }

  @override
  Widget build(BuildContext context) {
    final selectedId = ref.watch(selectedNoteIdProvider);
    if (selectedId == null) return const SizedBox.shrink();

    final state = ref.watch(notesProvider).valueOrNull;
    final note = state?.notes.where((n) => n.id == selectedId).firstOrNull;
    if (note == null) return const SizedBox.shrink();

    _syncNameController(note);

    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final categories = state?.categories ?? <Category>[];

    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        border: Border(top: BorderSide(color: colors.border, width: 1)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Row 1: close | name field (centered, narrower) | delete
          Row(
            children: [
              _ActionButton(
                icon: Icons.close,
                color: colors.textSecondary,
                onTap: () =>
                    ref.read(selectedNoteIdProvider.notifier).state = null,
              ),
              const Spacer(),
              SizedBox(
                width: 280,
                height: 30,
                child: TextField(
                  controller: _nameController,
                  style: textTheme.bodySmall
                      ?.copyWith(color: colors.textPrimary),
                  decoration: InputDecoration(
                    hintText: 'Sin título',
                    hintStyle: textTheme.bodySmall
                        ?.copyWith(color: colors.textLight),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.zero,
                      borderSide: BorderSide(color: colors.border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.zero,
                      borderSide: BorderSide(color: colors.border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.zero,
                      borderSide: BorderSide(color: colors.primary),
                    ),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 6),
                  ),
                  onSubmitted: (v) => _saveName(note, v),
                  onEditingComplete: () =>
                      _saveName(note, _nameController.text),
                ),
              ),
              const Spacer(),
              _ActionButton(
                icon: Icons.delete_outline,
                color: colors.error,
                onTap: () async {
                  await ref
                      .read(notesProvider.notifier)
                      .deleteNote(selectedId);
                  ref.read(selectedNoteIdProvider.notifier).state = null;
                },
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Row 2: color swatches | spacer | category button
          Row(
            children: [
              NoteColorPicker(
                selectedColorValue: note.colorValue,
                onColorSelected: (v) async {
                  final updated = note.copyWith(colorValue: v);
                  await ref.read(notesProvider.notifier).saveNote(updated);
                },
              ),
              const Spacer(),
              _CategoryButton(note: note, categories: categories),
            ],
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Color picker button — opens an overlay popup above the bar
// ─────────────────────────────────────────────────────────────────────────────

class _ColorButton extends ConsumerStatefulWidget {
  final Note note;
  const _ColorButton({required this.note});

  @override
  ConsumerState<_ColorButton> createState() => _ColorButtonState();
}

class _ColorButtonState extends ConsumerState<_ColorButton> {
  final _key = GlobalKey();
  OverlayEntry? _overlay;
  final _groupId = Object();

  bool get _isOpen => _overlay != null;

  void _close() {
    _overlay?.remove();
    _overlay = null;
    if (mounted) setState(() {});
  }

  void _toggle() {
    if (_isOpen) {
      _close();
      return;
    }
    final box = _key.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;
    final overlayState = Overlay.of(context);
    final pos = box.localToGlobal(Offset.zero,
        ancestor: overlayState.context.findRenderObject());
    final size = box.size;

    _overlay = OverlayEntry(
      builder: (_) => _ColorPickerOverlay(
        groupId: _groupId,
        buttonRect: Rect.fromLTWH(pos.dx, pos.dy, size.width, size.height),
        note: widget.note,
        onClose: _close,
        onColorSelected: (v) async {
          _close();
          final updated = widget.note.copyWith(colorValue: v);
          await ref.read(notesProvider.notifier).saveNote(updated);
        },
      ),
    );
    overlayState.insert(_overlay!);
    setState(() {});
  }

  @override
  void dispose() {
    _overlay?.remove();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return TapRegion(
      groupId: _groupId,
      child: GestureDetector(
        key: _key,
        onTap: _toggle,
        child: MouseRegion(
          cursor: SystemMouseCursors.click,
          child: Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: Color(widget.note.colorValue),
              border: Border.all(
                color: _isOpen ? colors.primary : colors.border,
                width: 1,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ColorPickerOverlay extends ConsumerWidget {
  final Object groupId;
  final Rect buttonRect;
  final Note note;
  final VoidCallback onClose;
  final ValueChanged<int> onColorSelected;

  const _ColorPickerOverlay({
    required this.groupId,
    required this.buttonRect,
    required this.note,
    required this.onClose,
    required this.onColorSelected,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;

    final content = Material(
      color: Colors.transparent,
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border.all(color: colors.borderDark, width: 2),
        ),
        padding: const EdgeInsets.all(6),
        child: NoteColorPicker(
          selectedColorValue: note.colorValue,
          onColorSelected: onColorSelected,
        ),
      ),
    );

    return TapRegion(
      groupId: groupId,
      onTapOutside: (_) => onClose(),
      child: Stack(
        children: [
          Positioned(
            left: buttonRect.left,
            bottom: MediaQuery.of(context).size.height - buttonRect.top + 4,
            child: content,
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Category button — opens an overlay popup with category list
// ─────────────────────────────────────────────────────────────────────────────

class _CategoryButton extends ConsumerStatefulWidget {
  final Note note;
  final List<Category> categories;
  const _CategoryButton({required this.note, required this.categories});

  @override
  ConsumerState<_CategoryButton> createState() => _CategoryButtonState();
}

class _CategoryButtonState extends ConsumerState<_CategoryButton> {
  final _key = GlobalKey();
  OverlayEntry? _overlay;
  final _groupId = Object();

  bool get _isOpen => _overlay != null;

  void _close() {
    _overlay?.remove();
    _overlay = null;
    if (mounted) setState(() {});
  }

  void _toggle() {
    if (_isOpen) {
      _close();
      return;
    }
    final box = _key.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;
    final overlayState = Overlay.of(context);
    final pos = box.localToGlobal(Offset.zero,
        ancestor: overlayState.context.findRenderObject());
    final size = box.size;

    _overlay = OverlayEntry(
      builder: (_) => _CategoryOverlay(
        groupId: _groupId,
        buttonRect: Rect.fromLTWH(pos.dx, pos.dy, size.width, size.height),
        note: widget.note,
        categories: widget.categories,
        onClose: _close,
        onSelect: (id) async {
          _close();
          final updated = widget.note.copyWith(categoryId: id);
          await ref.read(notesProvider.notifier).saveNote(updated);
        },
      ),
    );
    overlayState.insert(_overlay!);
    setState(() {});
  }

  @override
  void dispose() {
    _overlay?.remove();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final catName = widget.categories
        .where((c) => c.id == widget.note.categoryId)
        .firstOrNull
        ?.name;

    return TapRegion(
      groupId: _groupId,
      child: GestureDetector(
        key: _key,
        onTap: _toggle,
        child: MouseRegion(
          cursor: SystemMouseCursors.click,
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              border: Border.all(
                color: _isOpen ? colors.primary : colors.border,
                width: 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.folder_outlined,
                    size: 13, color: colors.textSecondary),
                const SizedBox(width: 4),
                Text(
                  catName ?? 'Categoría',
                  style: textTheme.bodySmall
                      ?.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(width: 4),
                Icon(Icons.arrow_drop_up,
                    size: 14, color: colors.textSecondary),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CategoryOverlay extends ConsumerWidget {
  final Object groupId;
  final Rect buttonRect;
  final Note note;
  final List<Category> categories;
  final VoidCallback onClose;
  final ValueChanged<String?> onSelect;

  const _CategoryOverlay({
    required this.groupId,
    required this.buttonRect,
    required this.note,
    required this.categories,
    required this.onClose,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    final content = Material(
      color: Colors.transparent,
      child: Container(
        width: 180,
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border.all(color: colors.borderDark, width: 2),
        ),
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _CategoryRow(
              label: 'Sin categoría',
              isSelected: note.categoryId == null,
              colors: colors,
              textTheme: textTheme,
              onTap: () => onSelect(null),
            ),
            if (categories.isNotEmpty)
              Divider(height: 1, thickness: 1, color: colors.border),
            for (final cat in categories)
              _CategoryRow(
                label: cat.name,
                isSelected: note.categoryId == cat.id,
                colors: colors,
                textTheme: textTheme,
                onTap: () => onSelect(cat.id),
              ),
          ],
        ),
      ),
    );

    return TapRegion(
      groupId: groupId,
      onTapOutside: (_) => onClose(),
      child: Stack(
        children: [
          Positioned(
            left: buttonRect.left,
            bottom: MediaQuery.of(context).size.height - buttonRect.top + 4,
            child: content,
          ),
        ],
      ),
    );
  }
}

class _CategoryRow extends StatefulWidget {
  final String label;
  final bool isSelected;
  final QuarksColorExtension colors;
  final TextTheme textTheme;
  final VoidCallback onTap;

  const _CategoryRow({
    required this.label,
    required this.isSelected,
    required this.colors,
    required this.textTheme,
    required this.onTap,
  });

  @override
  State<_CategoryRow> createState() => _CategoryRowState();
}

class _CategoryRowState extends State<_CategoryRow> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          color: _hovering ? widget.colors.cardHover : Colors.transparent,
          padding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  widget.label,
                  style: widget.textTheme.bodySmall?.copyWith(
                    color: widget.isSelected
                        ? widget.colors.primary
                        : widget.colors.textPrimary,
                  ),
                ),
              ),
              if (widget.isSelected)
                Icon(Icons.check, size: 13, color: widget.colors.primary),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple icon button
// ─────────────────────────────────────────────────────────────────────────────

class _ActionButton extends StatefulWidget {
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _ActionButton({
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  State<_ActionButton> createState() => _ActionButtonState();
}

class _ActionButtonState extends State<_ActionButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Icon(
          widget.icon,
          size: 18,
          color: widget.color.withValues(alpha: _hovering ? 1.0 : 0.75),
        ),
      ),
    );
  }
}
