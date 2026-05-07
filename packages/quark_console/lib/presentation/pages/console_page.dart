import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/console_providers.dart';
import '../widgets/log_view.dart';

class ConsolePage extends ConsumerStatefulWidget {
  const ConsolePage({super.key});

  @override
  ConsumerState<ConsolePage> createState() => _ConsolePageState();
}

class _ConsolePageState extends ConsumerState<ConsolePage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    // For now, only "App events" is implemented. Future tabs (interactive
    // shell, dedicated streams) should be added here.
    _tabController = TabController(length: 1, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    return Container(
      color: const Color(0xFF1A1B20),
      child: Column(
        children: [
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF14151A),
              border: Border(
                bottom: BorderSide(color: colors.borderDark, width: 1),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TabBar(
                    controller: _tabController,
                    isScrollable: true,
                    indicatorColor: colors.primary,
                    indicatorSize: TabBarIndicatorSize.label,
                    labelColor: colors.primary,
                    unselectedLabelColor: const Color(0xFF8B95A1),
                    labelStyle: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                    unselectedLabelStyle: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                    ),
                    tabs: const [
                      Tab(text: 'App events'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: const [
                LogView(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class LogLevelFilterMenu extends ConsumerWidget {
  const LogLevelFilterMenu({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(consoleProvider);
    return PopupMenuButton<LogLevel>(
      tooltip: 'Filter by level',
      onSelected: (level) =>
          ref.read(consoleProvider.notifier).toggleLevel(level),
      itemBuilder: (ctx) => [
        for (final level in LogLevel.values)
          CheckedPopupMenuItem(
            value: level,
            checked: state.visibleLevels.contains(level),
            child: Text(level.name.toUpperCase()),
          ),
      ],
      child: const Icon(Icons.filter_list, size: 16),
    );
  }
}
