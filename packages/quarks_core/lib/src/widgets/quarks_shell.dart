import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
      body: Column(
        children: [
          // Title bar
          _TitleBar(
            openTabs: openTabs,
            activeIndex: activeIndex,
            registry: registry,
            ref: ref,
          ),
          // Content
          Expanded(
            child: activeIndex == -1
                ? _LauncherGrid(modules: modules, ref: ref)
                : _ModulePage(
                    moduleId: openTabs[activeIndex],
                    registry: registry,
                  ),
          ),
        ],
      ),
    );
  }
}

class _TitleBar extends StatelessWidget {
  final List<String> openTabs;
  final int activeIndex;
  final ModuleRegistry registry;
  final WidgetRef ref;

  const _TitleBar({
    required this.openTabs,
    required this.activeIndex,
    required this.registry,
    required this.ref,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: const BoxDecoration(
        color: QuarksColors.primary,
        border: Border(
          bottom: BorderSide(color: QuarksColors.borderDark, width: 2),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // App title
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
            child: Text(
              'Quarks',
              style: theme.textTheme.titleMedium?.copyWith(
                color: QuarksColors.surface,
              ),
              textAlign: TextAlign.center,
            ),
          ),
          // Tabs row (only show if there are open tabs)
          if (openTabs.isNotEmpty)
            Container(
              width: double.infinity,
              color: QuarksColors.primaryDark,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _TabButton(
                      label: 'Home',
                      isActive: activeIndex == -1,
                      onTap: () =>
                          ref.read(activeTabIndexProvider.notifier).goHome(),
                    ),
                    for (var i = 0; i < openTabs.length; i++)
                      _TabButton(
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
            ),
        ],
      ),
    );
  }
}

class _TabButton extends StatefulWidget {
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  final VoidCallback? onClose;

  const _TabButton({
    required this.label,
    required this.isActive,
    required this.onTap,
    this.onClose,
  });

  @override
  State<_TabButton> createState() => _TabButtonState();
}

class _TabButtonState extends State<_TabButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: widget.isActive
                ? QuarksColors.surface
                : _hovering
                    ? QuarksColors.primaryDark.withValues(alpha: 0.5)
                    : Colors.transparent,
            border: const Border(
              right: BorderSide(color: QuarksColors.borderDark, width: 1),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                widget.label,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: widget.isActive
                      ? QuarksColors.textPrimary
                      : QuarksColors.surface,
                ),
              ),
              if (widget.onClose != null) ...[
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: widget.onClose,
                  child: Icon(
                    Icons.close,
                    size: 14,
                    color: widget.isActive
                        ? QuarksColors.textSecondary
                        : QuarksColors.surface.withValues(alpha: 0.7),
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
