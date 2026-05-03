import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/note.dart';
import '../providers/notes_providers.dart';

class NoteCard extends ConsumerStatefulWidget {
  final Note note;
  final String? categoryName;

  const NoteCard({
    super.key,
    required this.note,
    this.categoryName,
  });

  @override
  ConsumerState<NoteCard> createState() => _NoteCardState();
}

class _NoteCardState extends ConsumerState<NoteCard> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final noteColor = Color(widget.note.colorValue);
    final hasName = widget.note.name != null && widget.note.name!.isNotEmpty;
    final preview = _previewText(widget.note.content);
    final isSelected = ref.watch(selectedNoteIdProvider) == widget.note.id;

    final borderTopLeft = isSelected
        ? colors.primary
        : _hovering
            ? Color.lerp(colors.borderDark, Colors.white, 0.3)!
            : Color.lerp(noteColor, Colors.white, 0.4)!;
    final borderBottomRight = isSelected
        ? colors.primaryDark
        : _hovering
            ? colors.borderDark
            : Color.lerp(noteColor, Colors.black, 0.12)!;

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onTap: () =>
            ref.read(activeNoteIdProvider.notifier).state = widget.note.id,
        onSecondaryTapDown: (_) {
          ref.read(selectedNoteIdProvider.notifier).state =
              isSelected ? null : widget.note.id;
        },
        child: Container(
          decoration: BoxDecoration(
            color: noteColor,
            border: Border(
              top: BorderSide(color: borderTopLeft, width: 2),
              left: BorderSide(color: borderTopLeft, width: 2),
              bottom: BorderSide(color: borderBottomRight, width: 2),
              right: BorderSide(color: borderBottomRight, width: 2),
            ),
            boxShadow: [
              BoxShadow(
                color: colors.cardShadow,
                offset: const Offset(3, 3),
                blurRadius: 0,
              ),
            ],
          ),
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (hasName) ...[
                Text(
                  widget.note.name!,
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.bold,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
              ] else ...[
                Text(
                  'Sin título',
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.textLight,
                    fontStyle: FontStyle.italic,
                  ),
                  maxLines: 1,
                ),
                const SizedBox(height: 4),
              ],
              if (preview.isNotEmpty)
                Expanded(
                  child: Text(
                    preview,
                    style: textTheme.bodySmall?.copyWith(
                      color: colors.textSecondary,
                    ),
                    maxLines: 5,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  if (widget.categoryName != null)
                    Text(
                      widget.categoryName!,
                      style: textTheme.labelSmall?.copyWith(
                        color: colors.textLight,
                      ),
                    )
                  else
                    const SizedBox.shrink(),
                  Text(
                    _formatDate(widget.note.createdAt),
                    style: textTheme.labelSmall?.copyWith(
                      color: colors.textLight,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _previewText(String deltaJson) {
    try {
      final regex = RegExp(r'"insert"\s*:\s*"((?:[^"\\]|\\.)*)');
      return regex
          .allMatches(deltaJson)
          .map((m) => m.group(1) ?? '')
          .join('')
          .replaceAll(r'\n', '\n')
          .replaceAll(r'\"', '"')
          .trim();
    } catch (_) {
      return '';
    }
  }

  String _formatDate(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inDays == 0) {
      if (diff.inHours == 0) {
        if (diff.inMinutes == 0) return 'ahora';
        return 'hace ${diff.inMinutes}m';
      }
      return 'hace ${diff.inHours}h';
    }
    if (diff.inDays < 7) return 'hace ${diff.inDays}d';
    return '${dt.day}/${dt.month}/${dt.year}';
  }
}
