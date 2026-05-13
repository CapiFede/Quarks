import 'package:flutter/material.dart';
import 'package:quark_core/quark_core.dart';

class SearchPanel extends StatelessWidget {
  final TextEditingController searchCtrl;
  final TextEditingController replaceCtrl;
  final FocusNode searchFocusNode;
  final bool wholeWord;
  final int matchCount;
  final int currentMatch;
  final VoidCallback onToggleWholeWord;
  final VoidCallback onNext;
  final VoidCallback onPrev;
  final VoidCallback onReplaceOne;
  final VoidCallback onReplaceAll;
  final VoidCallback onClose;

  const SearchPanel({
    super.key,
    required this.searchCtrl,
    required this.replaceCtrl,
    required this.searchFocusNode,
    required this.wholeWord,
    required this.matchCount,
    required this.currentMatch,
    required this.onToggleWholeWord,
    required this.onNext,
    required this.onPrev,
    required this.onReplaceOne,
    required this.onReplaceAll,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Material(
      color: Colors.transparent,
      child: Container(
        width: 360,
        padding: const EdgeInsets.fromLTRB(10, 8, 8, 10),
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border.all(color: colors.borderDark, width: 1),
          boxShadow: const [
            BoxShadow(
              color: Color(0x33000000),
              offset: Offset(0, 2),
              blurRadius: 6,
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: _PanelInput(
                    controller: searchCtrl,
                    focusNode: searchFocusNode,
                    hint: 'Buscar',
                    onSubmit: onNext,
                  ),
                ),
                const SizedBox(width: 4),
                _PanelIconBtn(
                  icon: Icons.text_fields,
                  active: wholeWord,
                  tooltip: 'Palabra completa',
                  onTap: onToggleWholeWord,
                ),
                _PanelIconBtn(
                  icon: Icons.keyboard_arrow_up,
                  tooltip: 'Anterior',
                  onTap: matchCount > 0 ? onPrev : null,
                ),
                _PanelIconBtn(
                  icon: Icons.keyboard_arrow_down,
                  tooltip: 'Siguiente',
                  onTap: matchCount > 0 ? onNext : null,
                ),
                _PanelIconBtn(
                  icon: Icons.close,
                  tooltip: 'Cerrar',
                  onTap: onClose,
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 2),
              child: Text(
                searchCtrl.text.isEmpty
                    ? ' '
                    : matchCount == 0
                        ? 'Sin coincidencias'
                        : '${currentMatch + 1} de $matchCount',
                style: TextStyle(fontSize: 10, color: colors.textLight),
              ),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: _PanelInput(
                    controller: replaceCtrl,
                    hint: 'Reemplazar',
                    onSubmit: matchCount > 0 ? onReplaceOne : null,
                  ),
                ),
                const SizedBox(width: 4),
                _PanelTextBtn(
                  label: 'Uno',
                  tooltip: 'Reemplazar coincidencia actual',
                  onTap: matchCount > 0 ? onReplaceOne : null,
                ),
                const SizedBox(width: 4),
                _PanelTextBtn(
                  label: 'Todos',
                  tooltip: 'Reemplazar todas',
                  onTap: matchCount > 0 ? onReplaceAll : null,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PanelInput extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode? focusNode;
  final String hint;
  final VoidCallback? onSubmit;

  const _PanelInput({
    required this.controller,
    required this.hint,
    this.focusNode,
    this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Container(
      height: 26,
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        border: Border.all(color: colors.border, width: 1),
      ),
      child: TextField(
        controller: controller,
        focusNode: focusNode,
        style: TextStyle(fontSize: 11, color: colors.textPrimary),
        cursorColor: colors.primary,
        cursorWidth: 1.2,
        onSubmitted: onSubmit == null ? null : (_) => onSubmit!(),
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          isCollapsed: true,
          border: InputBorder.none,
          hintText: hint,
          hintStyle: TextStyle(fontSize: 11, color: colors.textLight),
        ),
      ),
    );
  }
}

class _PanelIconBtn extends StatefulWidget {
  final IconData icon;
  final bool active;
  final String tooltip;
  final VoidCallback? onTap;

  const _PanelIconBtn({
    required this.icon,
    this.active = false,
    required this.tooltip,
    required this.onTap,
  });

  @override
  State<_PanelIconBtn> createState() => _PanelIconBtnState();
}

class _PanelIconBtnState extends State<_PanelIconBtn> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final enabled = widget.onTap != null;
    final color = !enabled
        ? colors.textLight.withValues(alpha: 0.4)
        : widget.active
            ? colors.primary
            : colors.textSecondary;
    final bg = widget.active
        ? colors.primary.withValues(alpha: 0.15)
        : _hover && enabled
            ? colors.cardHover
            : Colors.transparent;
    return Tooltip(
      message: widget.tooltip,
      waitDuration: const Duration(milliseconds: 400),
      child: MouseRegion(
        cursor:
            enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: Container(
            width: 24,
            height: 24,
            alignment: Alignment.center,
            color: bg,
            child: Icon(widget.icon, size: 14, color: color),
          ),
        ),
      ),
    );
  }
}

class _PanelTextBtn extends StatefulWidget {
  final String label;
  final String tooltip;
  final VoidCallback? onTap;

  const _PanelTextBtn({
    required this.label,
    required this.tooltip,
    required this.onTap,
  });

  @override
  State<_PanelTextBtn> createState() => _PanelTextBtnState();
}

class _PanelTextBtnState extends State<_PanelTextBtn> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final enabled = widget.onTap != null;
    final fg = enabled
        ? colors.textPrimary
        : colors.textLight.withValues(alpha: 0.4);
    return Tooltip(
      message: widget.tooltip,
      waitDuration: const Duration(milliseconds: 400),
      child: MouseRegion(
        cursor:
            enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: Container(
            height: 24,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color:
                  _hover && enabled ? colors.cardHover : colors.surfaceAlt,
              border: Border.all(color: colors.border, width: 1),
            ),
            child: Text(
              widget.label,
              style: TextStyle(
                fontSize: 11,
                color: fg,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
