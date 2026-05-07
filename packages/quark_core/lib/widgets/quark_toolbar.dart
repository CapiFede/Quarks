import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/pin_providers.dart';
import '../quark.dart';
import '../quark_settings.dart';
import '../theme/quarks_color_extension.dart';

/// Standard 32px toolbar shown below the global title bar when a Quark is
/// active. Layout: [gear] ... [pinned-setting icons]
class QuarkToolbar extends ConsumerStatefulWidget {
  final Quark quark;

  const QuarkToolbar({super.key, required this.quark});

  @override
  ConsumerState<QuarkToolbar> createState() => _QuarkToolbarState();
}

class _QuarkToolbarState extends ConsumerState<QuarkToolbar> {
  OverlayEntry? _popover;
  final _gearKey = GlobalKey();

  @override
  void dispose() {
    _hidePopover();
    super.dispose();
  }

  void _hidePopover() {
    _popover?.remove();
    _popover = null;
  }

  void _togglePopover(List<QuarkSettingOption> options) {
    if (_popover != null) {
      _hidePopover();
      return;
    }
    if (options.isEmpty) return;
    final box = _gearKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;
    final origin = box.localToGlobal(box.size.bottomLeft(Offset.zero));

    _popover = OverlayEntry(
      builder: (ctx) => _GearPopover(
        anchor: origin,
        quarkId: widget.quark.id,
        options: options,
        onDismiss: _hidePopover,
      ),
    );
    Overlay.of(context, rootOverlay: true).insert(_popover!);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final settings = widget.quark.buildSettings(context, ref);

    final pinnedIds = ref.watch(pinStateProvider.select(
      (async) =>
          async.valueOrNull?[widget.quark.id]?.settings ?? const <String>{},
    ));
    final pinnedSettings =
        settings.where((s) => s.pinnable && pinnedIds.contains(s.id)).toList();

    return Container(
      height: 32,
      decoration: BoxDecoration(
        color: colors.background,
        border: Border(bottom: BorderSide(color: colors.border, width: 1)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        children: [
          KeyedSubtree(
            key: _gearKey,
            child: _GearButton(onTap: () => _togglePopover(settings)),
          ),
          const Expanded(child: SizedBox.shrink()),
          for (final option in pinnedSettings)
            _PinnedSettingButton(
              option: option,
              onSecondaryTap: () => ref
                  .read(pinStateProvider.notifier)
                  .toggleSetting(widget.quark.id, option.id),
            ),
        ],
      ),
    );
  }
}

class _GearPopover extends ConsumerWidget {
  final Offset anchor;
  final String quarkId;
  final List<QuarkSettingOption> options;
  final VoidCallback onDismiss;

  const _GearPopover({
    required this.anchor,
    required this.quarkId,
    required this.options,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final pinnedIds = ref.watch(pinStateProvider.select(
      (async) => async.valueOrNull?[quarkId]?.settings ?? const <String>{},
    ));

    return Stack(
      children: [
        // Backdrop: any tap or right-click outside dismisses the popover.
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onDismiss,
            onSecondaryTap: onDismiss,
          ),
        ),
        Positioned(
          left: anchor.dx,
          top: anchor.dy + 2,
          child: Material(
            color: Colors.transparent,
            child: Container(
              decoration: BoxDecoration(
                color: colors.surface,
                border: Border.all(color: colors.borderDark, width: 2),
              ),
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: IntrinsicWidth(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final option in options)
                      _GearMenuRow(
                        option: option,
                        isPinned: pinnedIds.contains(option.id),
                        onTap: () {
                          onDismiss();
                          option.onTap();
                        },
                        onSecondaryTap: option.pinnable
                            ? () => ref
                                .read(pinStateProvider.notifier)
                                .toggleSetting(quarkId, option.id)
                            : null,
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _GearMenuRow extends StatefulWidget {
  final QuarkSettingOption option;
  final bool isPinned;
  final VoidCallback onTap;
  final VoidCallback? onSecondaryTap;

  const _GearMenuRow({
    required this.option,
    required this.isPinned,
    required this.onTap,
    required this.onSecondaryTap,
  });

  @override
  State<_GearMenuRow> createState() => _GearMenuRowState();
}

class _GearMenuRowState extends State<_GearMenuRow> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        onSecondaryTap: widget.onSecondaryTap,
        child: Container(
          color: _hovering ? colors.cardHover : Colors.transparent,
          padding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(widget.option.icon, size: 13, color: colors.textPrimary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  widget.option.label,
                  style: TextStyle(fontSize: 12, color: colors.textPrimary),
                ),
              ),
              const SizedBox(width: 14),
              Icon(
                widget.isPinned ? Icons.push_pin : Icons.push_pin_outlined,
                size: 11,
                color: widget.isPinned
                    ? colors.primary
                    : colors.textLight.withValues(alpha: 0.4),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GearButton extends StatefulWidget {
  final VoidCallback onTap;
  const _GearButton({required this.onTap});

  @override
  State<_GearButton> createState() => _GearButtonState();
}

class _GearButtonState extends State<_GearButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        child: Container(
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            color: _hovering ? colors.surfaceAlt : Colors.transparent,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Center(
            child: Icon(
              Icons.settings,
              size: 14,
              color: _hovering ? colors.textPrimary : colors.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}

class _PinnedSettingButton extends StatefulWidget {
  final QuarkSettingOption option;
  final VoidCallback onSecondaryTap;

  const _PinnedSettingButton({
    required this.option,
    required this.onSecondaryTap,
  });

  @override
  State<_PinnedSettingButton> createState() => _PinnedSettingButtonState();
}

class _PinnedSettingButtonState extends State<_PinnedSettingButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    return Tooltip(
      message: widget.option.label,
      waitDuration: const Duration(milliseconds: 500),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.option.onTap,
          onSecondaryTap: widget.onSecondaryTap,
          child: Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              color: _hovering ? colors.surfaceAlt : Colors.transparent,
              borderRadius: BorderRadius.circular(4),
            ),
            child: Center(
              child: Icon(
                widget.option.icon,
                size: 14,
                color:
                    _hovering ? colors.textPrimary : colors.textSecondary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Secondary 32px bar shown below [QuarkToolbar] containing the Quark's
/// current dynamic pinned items (e.g. playlist chips). Hidden when the
/// Quark exposes no items.
class QuarkPinnedBar extends ConsumerWidget {
  final Quark quark;

  const QuarkPinnedBar({super.key, required this.quark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final leftWidget = quark.buildPinnedBarLeft(context, ref);
    final items = quark.buildDynamicPinned(context, ref);
    if (leftWidget == null && items.isEmpty) return const SizedBox.shrink();

    return Container(
      height: 22,
      decoration: BoxDecoration(
        color: colors.background,
        border: Border(bottom: BorderSide(color: colors.border, width: 1)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        children: [
          if (leftWidget != null) ...[
            leftWidget,
            Container(
              width: 1,
              height: 14,
              margin: const EdgeInsets.symmetric(horizontal: 8),
              color: colors.borderDark,
            ),
          ],
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final item in items)
                    KeyedSubtree(
                        key: ValueKey(item.id),
                        child: item.builder(context)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
