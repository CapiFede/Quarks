import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';
import 'package:window_manager/window_manager.dart';

import '../quarks_registry.dart';
import '../quarks_providers.dart';
import 'widgets/quark_card.dart';

bool get _isDesktop =>
    Platform.isWindows || Platform.isMacOS || Platform.isLinux;

class QuarksShell extends ConsumerWidget {
  const QuarksShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final registry = ref.watch(quarkRegistryProvider);
    final tabs = ref.watch(tabsProvider);

    // Get the active quark's toolbar if any
    Widget? toolbar;
    if (!tabs.isHome) {
      final quark = registry.getById(tabs.openTabs[tabs.activeIndex]);
      toolbar = quark?.buildToolbar();
    }

    return Scaffold(
      body: _WindowFrame(
        child: Column(
          children: [
            _TitleBar(tabs: tabs, registry: registry, ref: ref),
            ?toolbar,
            Expanded(
              child: _ContentArea(
                child: tabs.isHome
                    ? _LauncherGrid(quarks: registry.quarks, ref: ref)
                    : _QuarkPage(
                        quarkId: tabs.openTabs[tabs.activeIndex],
                        registry: registry,
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WindowFrame extends StatelessWidget {
  final Widget child;

  const _WindowFrame({required this.child});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    if (!_isDesktop) {
      // Mobile: fullscreen, no rounded borders (OS manages the window).
      return Container(
        color: colors.background,
        child: SafeArea(child: child),
      );
    }

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: colors.borderDark, width: 2),
      ),
      child: child,
    );
  }
}

class _TitleBar extends StatelessWidget {
  final TabsState tabs;
  final QuarkRegistry registry;
  final WidgetRef ref;

  const _TitleBar({
    required this.tabs,
    required this.registry,
    required this.ref,
  });

  void _showSettingsMenu(BuildContext context, WidgetRef ref) {
    final button = context.findRenderObject() as RenderBox;
    final overlay =
        Navigator.of(context).overlay!.context.findRenderObject() as RenderBox;
    final position = RelativeRect.fromRect(
      Rect.fromPoints(
        button.localToGlobal(button.size.bottomLeft(Offset.zero),
            ancestor: overlay),
        button.localToGlobal(button.size.bottomRight(Offset.zero),
            ancestor: overlay),
      ),
      Offset.zero & overlay.size,
    );

    final colors = context.quarksColors;
    final current = ref.read(themeModeProvider);
    final isDark = current == ThemeMode.dark;

    showMenu<String>(
      context: context,
      position: position,
      elevation: 0,
      color: colors.surface,
      shape: Border.all(color: colors.borderDark, width: 2),
      items: [
        PopupMenuItem<String>(
          value: 'theme',
          height: 32,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isDark ? Icons.light_mode : Icons.dark_mode,
                size: 13,
                color: colors.textPrimary,
              ),
              const SizedBox(width: 8),
              Text(
                isDark ? 'Tema claro' : 'Tema oscuro',
                style: TextStyle(fontSize: 12, color: colors.textPrimary),
              ),
            ],
          ),
        ),
      ],
    ).then((value) {
      if (value == 'theme') {
        ref.read(themeModeProvider.notifier).state =
            isDark ? ThemeMode.light : ThemeMode.dark;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    return SizedBox(
      height: 32,
      child: Stack(
        children: [
          // Background + bottom border line
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                color: colors.primary,
                border: Border(
                  bottom: BorderSide(color: colors.borderDark, width: 2),
                ),
              ),
            ),
          ),
          // Single row: settings, tabs, drag area, window buttons
          Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(width: 4),
              Center(
                child: Builder(
                  builder: (ctx) => _WindowButton(
                    onTap: () => _showSettingsMenu(ctx, ref),
                    child: Icon(
                      Icons.settings,
                      size: 12,
                      color: colors.textPrimary,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 4),

              // Home tab
              _TitleBarTab(
                label: 'Home',
                isActive: tabs.isHome,
                onTap: () => ref.read(tabsProvider.notifier).goHome(),
              ),
              const SizedBox(width: 2),

              // Quark tabs
              for (var i = 0; i < tabs.openTabs.length; i++) ...[
                _TitleBarTab(
                  label: registry.getById(tabs.openTabs[i])?.name ??
                      tabs.openTabs[i],
                  isActive: tabs.activeIndex == i,
                  onTap: () =>
                      ref.read(tabsProvider.notifier).setActiveIndex(i),
                  onClose: () => ref
                      .read(tabsProvider.notifier)
                      .closeQuark(tabs.openTabs[i]),
                ),
                const SizedBox(width: 2),
              ],

              // Draggable area fills remaining space (desktop only).
              if (_isDesktop)
                Expanded(
                  child: GestureDetector(
                    onDoubleTap: () async {
                      if (await windowManager.isMaximized()) {
                        windowManager.unmaximize();
                      } else {
                        windowManager.maximize();
                      }
                    },
                    child: const DragToMoveArea(
                      child: SizedBox.expand(),
                    ),
                  ),
                )
              else
                const Expanded(child: SizedBox.expand()),

              // Window buttons (desktop only — mobile uses OS chrome).
              if (_isDesktop) ...[
                Center(
                  child: _WindowButton(
                    onTap: () => windowManager.minimize(),
                    child: Container(
                      width: 10,
                      height: 2,
                      color: colors.textPrimary,
                    ),
                  ),
                ),
                const SizedBox(width: 2),
                Center(
                  child: _WindowButton(
                    onTap: () async {
                      if (await windowManager.isMaximized()) {
                        windowManager.unmaximize();
                      } else {
                        windowManager.maximize();
                      }
                    },
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: colors.textPrimary,
                          width: 1.5,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 2),
                Center(
                  child: _WindowButton(
                    onTap: () => windowManager.close(),
                    child: Text(
                      'X',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: colors.textPrimary,
                        height: 1,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 4),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _TitleBarTab extends StatefulWidget {
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  final VoidCallback? onClose;

  const _TitleBarTab({
    required this.label,
    required this.isActive,
    required this.onTap,
    this.onClose,
  });

  @override
  State<_TitleBarTab> createState() => _TitleBarTabState();
}

class _TitleBarTabState extends State<_TitleBarTab> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    final isActive = widget.isActive;

    final bgColor = isActive
        ? colors.surface
        : _hovering
            ? colors.primaryDark
            : colors.primaryDark.withValues(alpha: 0.6);

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: ClipRRect(
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(6),
            topRight: Radius.circular(6),
          ),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: bgColor,
              border: Border(
                top: BorderSide(color: colors.borderDark, width: 2),
                left: BorderSide(color: colors.borderDark, width: 1),
                right: BorderSide(color: colors.borderDark, width: 1),
                bottom: isActive
                    ? BorderSide(color: colors.surface, width: 2)
                    : BorderSide(color: colors.borderDark, width: 2),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.label,
                  style: TextStyle(
                    fontSize: 12,
                    color: isActive
                        ? colors.textPrimary
                        : colors.surface,
                  ),
                ),
                if (widget.onClose != null) ...[
                  const SizedBox(width: 6),
                  GestureDetector(
                    onTap: widget.onClose,
                    child: Icon(
                      Icons.close,
                      size: 10,
                      color: isActive
                          ? colors.textSecondary
                          : colors.surface,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _WindowButton extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;

  const _WindowButton({required this.child, this.onTap});

  @override
  State<_WindowButton> createState() => _WindowButtonState();
}

class _WindowButtonState extends State<_WindowButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            color: _hovering ? colors.cardHover : colors.surface,
            border: Border(
              top: BorderSide(color: colors.borderLight, width: 1),
              left: BorderSide(color: colors.borderLight, width: 1),
              bottom: BorderSide(color: colors.borderDark, width: 1),
              right: BorderSide(color: colors.borderDark, width: 1),
            ),
          ),
          child: Center(child: widget.child),
        ),
      ),
    );
  }
}

class _ContentArea extends StatelessWidget {
  final Widget child;

  const _ContentArea({required this.child});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    return Container(
      margin: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(
          top: BorderSide(color: colors.borderDark, width: 2),
          left: BorderSide(color: colors.borderDark, width: 2),
          bottom: BorderSide(color: colors.borderLight, width: 2),
          right: BorderSide(color: colors.borderLight, width: 2),
        ),
      ),
      child: child,
    );
  }
}

class _LauncherGrid extends StatelessWidget {
  final List<Quark> quarks;
  final WidgetRef ref;

  const _LauncherGrid({required this.quarks, required this.ref});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    if (quarks.isEmpty) {
      return Center(
        child: Text(
          'No quarks installed',
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: colors.textSecondary,
              ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.all(24),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final crossAxisCount = constraints.maxWidth > 800
              ? 4
              : constraints.maxWidth > 500
                  ? 3
                  : 2;

          return GridView.builder(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: crossAxisCount,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
              childAspectRatio: 1,
            ),
            itemCount: quarks.length,
            itemBuilder: (context, index) {
              final quark = quarks[index];
              return QuarkCard(
                label: quark.name,
                icon: quark.icon,
                onTap: () =>
                    ref.read(tabsProvider.notifier).openQuark(quark.id),
              );
            },
          );
        },
      ),
    );
  }
}

class _QuarkPage extends StatelessWidget {
  final String quarkId;
  final QuarkRegistry registry;

  const _QuarkPage({required this.quarkId, required this.registry});

  @override
  Widget build(BuildContext context) {
    final quark = registry.getById(quarkId);
    if (quark == null) {
      return const Center(child: Text('Quark not found'));
    }
    return quark.buildPage();
  }
}
