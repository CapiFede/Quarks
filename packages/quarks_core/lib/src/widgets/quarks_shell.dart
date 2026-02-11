import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:window_manager/window_manager.dart';

import '../module/module_registry.dart';
import '../module/quark_module.dart';
import '../providers/core_providers.dart';
import '../theme/quarks_colors.dart';
import 'quark_card.dart';

class QuarksShell extends ConsumerWidget {
  const QuarksShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final modules = ref.watch(installedModulesProvider);
    final openTabs = ref.watch(openTabsProvider);
    final activeIndex = ref.watch(activeTabIndexProvider);
    final registry = ref.read(moduleRegistryProvider);

    return Scaffold(
      body: _WindowFrame(
        child: Column(
          children: [
            const _TitleBar(),
            if (openTabs.isNotEmpty)
              _TabStrip(
                openTabs: openTabs,
                activeIndex: activeIndex,
                registry: registry,
                ref: ref,
              ),
            Expanded(
              child: _ContentArea(
                child: activeIndex == -1
                    ? _LauncherGrid(modules: modules, ref: ref)
                    : _ModulePage(
                        moduleId: openTabs[activeIndex],
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
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: QuarksColors.background,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: QuarksColors.borderDark, width: 2),
      ),
      child: child,
    );
  }
}

class _TitleBar extends StatelessWidget {
  const _TitleBar();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GestureDetector(
      onDoubleTap: () async {
        if (await windowManager.isMaximized()) {
          windowManager.unmaximize();
        } else {
          windowManager.maximize();
        }
      },
      child: DragToMoveArea(
        child: Container(
          decoration: const BoxDecoration(
            color: QuarksColors.primary,
            border: Border(
              bottom: BorderSide(color: QuarksColors.borderDark, width: 2),
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
          child: Row(
            children: [
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Quarks',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: QuarksColors.surface,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
              _WindowButton(
                onTap: () => windowManager.minimize(),
                child: Container(
                  width: 10,
                  height: 2,
                  color: QuarksColors.textPrimary,
                ),
              ),
              const SizedBox(width: 2),
              _WindowButton(
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
                      color: QuarksColors.textPrimary,
                      width: 1.5,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 2),
              _WindowButton(
                onTap: () => windowManager.close(),
                child: const Text(
                  'X',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: QuarksColors.textPrimary,
                    height: 1,
                  ),
                ),
              ),
              const SizedBox(width: 4),
            ],
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
            color: _hovering ? QuarksColors.cardHover : QuarksColors.surface,
            border: const Border(
              top: BorderSide(color: QuarksColors.borderLight, width: 1),
              left: BorderSide(color: QuarksColors.borderLight, width: 1),
              bottom: BorderSide(color: QuarksColors.borderDark, width: 1),
              right: BorderSide(color: QuarksColors.borderDark, width: 1),
            ),
          ),
          child: Center(child: widget.child),
        ),
      ),
    );
  }
}

class _TabStrip extends StatelessWidget {
  final List<String> openTabs;
  final int activeIndex;
  final ModuleRegistry registry;
  final WidgetRef ref;

  const _TabStrip({
    required this.openTabs,
    required this.activeIndex,
    required this.registry,
    required this.ref,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: QuarksColors.background,
        border: Border(
          bottom: BorderSide(color: QuarksColors.borderDark, width: 2),
        ),
      ),
      padding: const EdgeInsets.only(left: 8, top: 4),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            _FolderTab(
              label: 'Home',
              isActive: activeIndex == -1,
              onTap: () =>
                  ref.read(activeTabIndexProvider.notifier).goHome(),
            ),
            for (var i = 0; i < openTabs.length; i++)
              _FolderTab(
                label:
                    registry.getById(openTabs[i])?.name ?? openTabs[i],
                isActive: activeIndex == i,
                onTap: () =>
                    ref.read(activeTabIndexProvider.notifier).setIndex(i),
                onClose: () => ref
                    .read(openTabsProvider.notifier)
                    .closeModule(openTabs[i]),
              ),
          ],
        ),
      ),
    );
  }
}

class _FolderTab extends StatefulWidget {
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  final VoidCallback? onClose;

  const _FolderTab({
    required this.label,
    required this.isActive,
    required this.onTap,
    this.onClose,
  });

  @override
  State<_FolderTab> createState() => _FolderTabState();
}

class _FolderTabState extends State<_FolderTab> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          padding: EdgeInsets.symmetric(
            horizontal: 16,
            vertical: widget.isActive ? 8 : 6,
          ),
          decoration: BoxDecoration(
            color: widget.isActive
                ? QuarksColors.surface
                : _hovering
                    ? QuarksColors.surfaceAlt
                    : QuarksColors.background,
            border: Border(
              top: BorderSide(
                color: widget.isActive
                    ? QuarksColors.borderLight
                    : QuarksColors.border,
                width: 2,
              ),
              left: BorderSide(
                color: widget.isActive
                    ? QuarksColors.borderLight
                    : QuarksColors.border,
                width: widget.isActive ? 2 : 1,
              ),
              right: BorderSide(
                color: widget.isActive
                    ? QuarksColors.borderDark
                    : QuarksColors.border,
                width: widget.isActive ? 2 : 1,
              ),
              bottom: widget.isActive
                  ? const BorderSide(
                      color: QuarksColors.surface, width: 2)
                  : const BorderSide(
                      color: QuarksColors.borderDark, width: 2),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                widget.label,
                style: theme.textTheme.labelLarge?.copyWith(
                  color: widget.isActive
                      ? QuarksColors.textPrimary
                      : _hovering
                          ? QuarksColors.textPrimary
                          : QuarksColors.textSecondary,
                ),
              ),
              if (widget.onClose != null) ...[
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: widget.onClose,
                  child: const Icon(
                    Icons.close,
                    size: 12,
                    color: QuarksColors.textSecondary,
                  ),
                ),
              ],
            ],
          ),
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
    return Container(
      margin: const EdgeInsets.all(8),
      decoration: const BoxDecoration(
        color: QuarksColors.surface,
        border: Border(
          top: BorderSide(color: QuarksColors.borderDark, width: 2),
          left: BorderSide(color: QuarksColors.borderDark, width: 2),
          bottom: BorderSide(color: QuarksColors.borderLight, width: 2),
          right: BorderSide(color: QuarksColors.borderLight, width: 2),
        ),
      ),
      child: child,
    );
  }
}

class _LauncherGrid extends StatelessWidget {
  final List<QuarkModule> modules;
  final WidgetRef ref;

  const _LauncherGrid({required this.modules, required this.ref});

  @override
  Widget build(BuildContext context) {
    if (modules.isEmpty) {
      return Center(
        child: Text(
          'No modules installed',
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: QuarksColors.textSecondary,
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
            itemCount: modules.length,
            itemBuilder: (context, index) {
              final module = modules[index];
              return QuarkCard(
                label: module.name,
                icon: module.icon,
                onTap: () =>
                    ref.read(openTabsProvider.notifier).openModule(module.id),
              );
            },
          );
        },
      ),
    );
  }
}

class _ModulePage extends StatelessWidget {
  final String moduleId;
  final ModuleRegistry registry;

  const _ModulePage({required this.moduleId, required this.registry});

  @override
  Widget build(BuildContext context) {
    final module = registry.getById(moduleId);
    if (module == null) {
      return const Center(child: Text('Module not found'));
    }
    return module.buildPage();
  }
}
