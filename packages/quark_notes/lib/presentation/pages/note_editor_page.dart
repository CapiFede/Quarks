import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:window_manager/window_manager.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/note.dart';
import '../providers/notes_providers.dart';

enum _DraftChoice { discard, stay }

class NoteEditorPage extends ConsumerStatefulWidget {
  final String noteId; // 'new' or existing id

  const NoteEditorPage({super.key, required this.noteId});

  @override
  ConsumerState<NoteEditorPage> createState() => _NoteEditorPageState();
}

class _NoteEditorPageState extends ConsumerState<NoteEditorPage>
    with WindowListener {
  late final QuillController _quillController;
  late final TextEditingController _nameController;
  late final FocusNode _editorFocusNode;
  // Captured during initState so dispose() can clear the back handler without
  // touching `ref` (which is unusable after the element is disposed).
  late final StateController<VoidCallback?> _backNotifier;
  Note? _note;
  bool _initialized = false;
  bool _dirty = false;
  // True once the note has been persisted at least once.
  // For existing notes this is true from the start; for 'new' notes it becomes
  // true only when the user types a name for the first time.
  bool _isSaved = false;
  // While true, content edits push the first 15 characters into the name field.
  // Flips to false the moment the user types in the name field themselves.
  late bool _nameAutoFilled;
  // Re-entry guard so programmatic name updates don't disable auto-fill.
  bool _autoFillingName = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _editorFocusNode = FocusNode();
    _quillController = QuillController.basic();
    _nameAutoFilled = widget.noteId == 'new';
    _backNotifier = ref.read(noteEditorBackHandlerProvider.notifier);
    if (_isDesktop) {
      windowManager.addListener(this);
      windowManager.setPreventClose(false);
    }
    // Expose _onBack to the global Escape handler so it works regardless of
    // which child of this page (name field, Quill editor, color picker, …)
    // currently has focus.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _backNotifier.state = _onBack;
    });
  }

  static bool get _isDesktop =>
      Platform.isWindows || Platform.isMacOS || Platform.isLinux;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      _initNote();
      _initialized = true;
    }
  }

  Future<void> _initNote() async {
    if (widget.noteId == 'new') {
      // Create a local draft — do NOT persist until the user gives it a name.
      const marfil = Color(0xFFFAF8F3);
      final note = Note(
        id: Note.generateId(),
        colorValue: marfil.toARGB32(),
        createdAt: DateTime.now(),
      );
      if (!mounted) return;
      setState(() {
        _note = note;
        _isSaved = false;
      });
      _setupListeners();
    } else {
      final state = ref.read(notesProvider).valueOrNull;
      final note =
          state?.notes.where((n) => n.id == widget.noteId).firstOrNull;
      if (note == null) {
        ref.read(activeNoteIdProvider.notifier).state = null;
        return;
      }
      _note = note;
      _isSaved = true;
      _nameController.text = note.name ?? '';
      _loadQuillContent(note.content);
      _setupListeners();
    }
  }

  void _loadQuillContent(String deltaJson) {
    try {
      final decoded = jsonDecode(deltaJson);
      if (decoded is List && decoded.isNotEmpty) {
        final doc = Document.fromJson(decoded.cast<Map<String, dynamic>>());
        _quillController.document = doc;
      }
    } catch (_) {
      // Leave empty
    }
  }

  void _setupListeners() {
    _quillController.addListener(_onContentChanged);
    _nameController.addListener(_onNameChanged);
  }

  void _onContentChanged() {
    if (!_dirty) setState(() => _dirty = true);
    _maybeAutoFillName();
    if (!_isSaved) _updatePreventClose();
  }

  void _onNameChanged() {
    if (!_autoFillingName) {
      _nameAutoFilled = false;
    }
    if (!_dirty) setState(() => _dirty = true);
    // First save: persist the note as soon as it gets a name.
    final name = _nameController.text.trim();
    if (!_isSaved && name.isNotEmpty) {
      _isSaved = true;
      final note = _note;
      if (note != null) {
        final deltaJson =
            jsonEncode(_quillController.document.toDelta().toJson());
        final updated = note.copyWith(name: name, content: deltaJson);
        _note = updated;
        ref.read(notesProvider.notifier).saveNote(updated);
      }
      _updatePreventClose();
    }
  }

  void _maybeAutoFillName() {
    if (!_nameAutoFilled) return;
    final raw = _quillController.document.toPlainText();
    final flattened = raw.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (flattened.isEmpty) return;
    final autoName =
        flattened.length > 15 ? flattened.substring(0, 15) : flattened;
    if (autoName == _nameController.text) return;
    _autoFillingName = true;
    _nameController.text = autoName;
    _autoFillingName = false;
  }

  // ── Unsaved-draft guard ───────────────────────────────────────────────────

  bool _hasUnsavedContent() =>
      !_isSaved &&
      _quillController.document.toPlainText().trim().isNotEmpty;

  void _updatePreventClose() {
    if (!_isDesktop) return;
    windowManager.setPreventClose(_hasUnsavedContent());
  }

  Future<_DraftChoice> _showUnsavedDraftDialog() async {
    final result = await showDialog<_DraftChoice>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        final colors = ctx.quarksColors;
        return AlertDialog(
          backgroundColor: colors.surface,
          title: Text(
            'Cambios sin guardar',
            style: TextStyle(color: colors.textPrimary, fontSize: 14),
          ),
          content: Text(
            'Esta nota tiene contenido pero no tiene nombre.\n'
            'Si retrocedes los cambios se perderán.\n'
            'Agrégale un nombre para guardarla.',
            style: TextStyle(color: colors.textSecondary, fontSize: 12),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(_DraftChoice.discard),
              child: Text('Descartar',
                  style: TextStyle(color: colors.error, fontSize: 12)),
            ),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(_DraftChoice.stay),
              child: Text('Agregar nombre',
                  style: TextStyle(color: colors.primary, fontSize: 12)),
            ),
          ],
        );
      },
    );
    return result ?? _DraftChoice.stay;
  }

  @override
  Future<void> onWindowClose() async {
    if (!_hasUnsavedContent()) {
      await windowManager.destroy();
      return;
    }
    final choice = await _showUnsavedDraftDialog();
    if (choice == _DraftChoice.discard) {
      await windowManager.destroy();
    }
  }

  Future<void> _save() async {
    if (!_isSaved) return; // Unsaved draft — nothing to write yet.
    final note = _note;
    if (note == null) return;
    final deltaJson =
        jsonEncode(_quillController.document.toDelta().toJson());
    final name = _nameController.text.trim();
    final updated = note.copyWith(
      name: name.isEmpty ? null : name,
      content: deltaJson,
    );
    await ref.read(notesProvider.notifier).saveNote(updated);
    _note = updated;
    if (mounted) setState(() => _dirty = false);
  }

  Future<void> _onBack() async {
    if (_hasUnsavedContent()) {
      final choice = await _showUnsavedDraftDialog();
      if (choice == _DraftChoice.stay) return;
    }
    if (_isSaved && _dirty) await _save();
    if (mounted) {
      ref.read(activeNoteIdProvider.notifier).state = null;
    }
  }

  Future<void> _pasteAsPlainText() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    if (data?.text == null) return;
    final text = _cleanPastedText(data!.text!);
    if (text.isEmpty) return;
    final selection = _quillController.selection;
    if (!selection.isValid) return;
    if (!selection.isCollapsed) {
      _quillController.document.delete(
        selection.start,
        selection.end - selection.start,
      );
    }
    final offset =
        selection.isCollapsed ? selection.baseOffset : selection.start;
    _quillController.document.insert(offset, text);
    _quillController.updateSelection(
      TextSelection.collapsed(offset: offset + text.length),
      ChangeSource.local,
    );
  }

  static String _cleanPastedText(String raw) {
    final lines = raw.split('\n');
    final cleaned = lines
        .where((line) => !line.trimLeft().startsWith('SourceURL:'))
        .toList();
    while (cleaned.isNotEmpty && cleaned.first.trim().isEmpty) {
      cleaned.removeAt(0);
    }
    while (cleaned.isNotEmpty && cleaned.last.trim().isEmpty) {
      cleaned.removeLast();
    }
    return cleaned.join('\n');
  }

  Future<void> _deleteNote() async {
    final note = _note;
    if (note == null) return;
    if (_isSaved) {
      await ref.read(notesProvider.notifier).deleteNote(note.id);
    }
    if (mounted) {
      ref.read(activeNoteIdProvider.notifier).state = null;
    }
  }

  @override
  void dispose() {
    if (_isDesktop) {
      windowManager.removeListener(this);
      windowManager.setPreventClose(false);
    }
    if (_backNotifier.state == _onBack) {
      _backNotifier.state = null;
    }
    _quillController.removeListener(_onContentChanged);
    _nameController.removeListener(_onNameChanged);
    _quillController.dispose();
    _nameController.dispose();
    _editorFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final note = _note;

    if (note == null) {
      return Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: colors.primary,
          ),
        ),
      );
    }

    final noteColor = Color(note.colorValue);
    final state = ref.watch(notesProvider).valueOrNull;
    final categories = state?.categories ?? [];

    return Container(
      color: colors.background,
      child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
          // Top bar
          Container(
            height: 40,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            decoration: BoxDecoration(
              color: colors.background,
              border: Border(
                bottom: BorderSide(color: colors.primary, width: 1),
              ),
            ),
            child: Row(
              children: [
                // Back button
                _ToolbarIconButton(
                  icon: Icons.arrow_back,
                  onTap: _onBack,
                  color: colors.textSecondary,
                ),
                const SizedBox(width: 4),
                // Name field
                Expanded(
                  child: TextField(
                    controller: _nameController,
                    style: textTheme.bodyMedium
                        ?.copyWith(color: colors.textPrimary),
                    decoration: InputDecoration(
                      hintText: 'Nombre de la nota...',
                      hintStyle: textTheme.bodyMedium
                          ?.copyWith(color: colors.textLight),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding:
                          const EdgeInsets.symmetric(vertical: 4),
                    ),
                  ),
                ),
                // Delete
                _ToolbarIconButton(
                  icon: Icons.delete_outline,
                  onTap: _deleteNote,
                  color: colors.textLight,
                ),
              ],
            ),
          ),
          // Combined toolbar: Quill formatting + color picker + category
          Container(
            height: 40,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            decoration: BoxDecoration(
              color: noteColor,
              border: Border(
                bottom:
                    BorderSide(color: colors.border.withAlpha(80), width: 1),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: QuillSimpleToolbar(
                    controller: _quillController,
                    config: QuillSimpleToolbarConfig(
                      multiRowsDisplay: false,
                      color: Colors.transparent,
                      toolbarSize: 26,
                      toolbarSectionSpacing: 2,
                      sectionDividerSpace: 6,
                      sectionDividerColor: colors.border.withAlpha(120),
                      showFontFamily: false,
                      showFontSize: false,
                      showStrikeThrough: false,
                      showInlineCode: false,
                      showCodeBlock: false,
                      showIndent: false,
                      showLink: false,
                      showSubscript: false,
                      showSuperscript: false,
                      showUndo: false,
                      showRedo: false,
                      showDividers: false,
                      showColorButton: false,
                      showBackgroundColorButton: false,
                      showClearFormat: true,
                      showAlignmentButtons: true,
                      showListBullets: true,
                      showListNumbers: true,
                      showQuote: false,
                      showBoldButton: true,
                      showItalicButton: true,
                      showUnderLineButton: true,
                      buttonOptions: const QuillSimpleToolbarButtonOptions(
                        base: QuillToolbarBaseButtonOptions(
                          iconSize: 13,
                          iconButtonFactor: 1.5,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  width: 1,
                  height: 18,
                  color: colors.border.withAlpha(120),
                ),
                const SizedBox(width: 8),
                QuarkColorPicker(
                  selectedColorValue: note.colorValue,
                  onColorSelected: (v) async {
                    final updated = note.copyWith(colorValue: v);
                    _note = updated;
                    setState(() {});
                    await ref.read(notesProvider.notifier).saveNote(updated);
                  },
                ),
                if (categories.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  _CategoryDropdown(
                    categories: categories,
                    selectedCategoryId: note.categoryId,
                    onChanged: (id) async {
                      final updated = note.copyWith(categoryId: id);
                      _note = updated;
                      setState(() {});
                      await ref
                          .read(notesProvider.notifier)
                          .saveNote(updated);
                    },
                  ),
                ],
              ],
            ),
          ),
          // Editor
          Expanded(
            child: QuillEditor.basic(
              controller: _quillController,
              focusNode: _editorFocusNode,
              config: QuillEditorConfig(
                padding: const EdgeInsets.all(16),
                placeholder: 'Escribe tu nota...',
                customStyles: DefaultStyles(
                  paragraph: DefaultTextBlockStyle(
                    TextStyle(
                      fontFamily: 'Consolas',
                      fontSize: 13.5,
                      height: 1.6,
                      color: colors.textPrimary,
                    ),
                    const HorizontalSpacing(0, 0),
                    const VerticalSpacing(2, 2),
                    const VerticalSpacing(0, 0),
                    null,
                  ),
                ),
                customActions: {
                  PasteTextIntent: CallbackAction<PasteTextIntent>(
                    onInvoke: (_) => _pasteAsPlainText(),
                  ),
                },
              ),
            ),
          ),
          ],
        ),
      );
  }
}

class _ToolbarIconButton extends StatefulWidget {
  final IconData icon;
  final VoidCallback onTap;
  final Color color;

  const _ToolbarIconButton({
    required this.icon,
    required this.onTap,
    required this.color,
  });

  @override
  State<_ToolbarIconButton> createState() => _ToolbarIconButtonState();
}

class _ToolbarIconButtonState extends State<_ToolbarIconButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Icon(
            widget.icon,
            size: 16,
            color: _hovering
                ? widget.color.withAlpha(204)
                : widget.color,
          ),
        ),
      ),
    );
  }
}

class _CategoryDropdown extends StatelessWidget {
  final List<dynamic> categories;
  final String? selectedCategoryId;
  final ValueChanged<String?> onChanged;

  const _CategoryDropdown({
    required this.categories,
    required this.selectedCategoryId,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    return DropdownButtonHideUnderline(
      child: DropdownButton<String?>(
        value: selectedCategoryId,
        isDense: true,
        style: textTheme.labelSmall?.copyWith(color: colors.textSecondary),
        dropdownColor: colors.surface,
        hint: Text(
          'Sin categoría',
          style: textTheme.labelSmall?.copyWith(color: colors.textLight),
        ),
        items: [
          DropdownMenuItem<String?>(
            value: null,
            child: Text(
              'Sin categoría',
              style: textTheme.labelSmall?.copyWith(color: colors.textLight),
            ),
          ),
          for (final cat in categories)
            DropdownMenuItem<String?>(
              value: cat.id as String,
              child: Text(
                cat.name as String,
                style:
                    textTheme.labelSmall?.copyWith(color: colors.textPrimary),
              ),
            ),
        ],
        onChanged: onChanged,
      ),
    );
  }
}
