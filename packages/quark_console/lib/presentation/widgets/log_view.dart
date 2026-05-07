import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/console_providers.dart';

class LogView extends ConsumerStatefulWidget {
  const LogView({super.key});

  @override
  ConsumerState<LogView> createState() => _LogViewState();
}

class _LogViewState extends ConsumerState<LogView> {
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToEnd() {
    if (!_scrollController.hasClients) return;
    final pos = _scrollController.position;
    if (pos.pixels < pos.maxScrollExtent - 80) return; // user scrolled up — leave alone
    _scrollController.jumpTo(pos.maxScrollExtent);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(consoleProvider);
    final entries = state.filteredEntries;

    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToEnd());

    if (entries.isEmpty) {
      return const Center(
        child: Text(
          'No logs yet',
          style: TextStyle(color: Color(0xFF6B7280), fontFamily: 'monospace'),
        ),
      );
    }

    return Container(
      color: const Color(0xFF14151A),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: ListView.builder(
        controller: _scrollController,
        itemCount: entries.length,
        itemBuilder: (ctx, i) => _LogLine(entry: entries[i]),
      ),
    );
  }
}

class _LogLine extends StatelessWidget {
  final LogEntry entry;
  const _LogLine({required this.entry});

  static const _timeStyle = TextStyle(
    color: Color(0xFF6B7280),
    fontFamily: 'monospace',
    fontSize: 11,
  );

  static const _sourceStyle = TextStyle(
    color: Color(0xFF8B95A1),
    fontFamily: 'monospace',
    fontSize: 11,
  );

  Color _levelColor(LogLevel level) {
    switch (level) {
      case LogLevel.debug:
        return const Color(0xFF6B7280);
      case LogLevel.info:
        return const Color(0xFFB8C5D1);
      case LogLevel.warn:
        return const Color(0xFFD9A85F);
      case LogLevel.error:
        return const Color(0xFFE87878);
    }
  }

  String _formatTime(DateTime t) {
    String pad2(int n) => n.toString().padLeft(2, '0');
    String pad3(int n) => n.toString().padLeft(3, '0');
    return '${pad2(t.hour)}:${pad2(t.minute)}:${pad2(t.second)}.${pad3(t.millisecond)}';
  }

  @override
  Widget build(BuildContext context) {
    final color = _levelColor(entry.level);
    final levelTag = entry.level.name.toUpperCase().padRight(5);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: SelectableText.rich(
        TextSpan(children: [
          TextSpan(text: '${_formatTime(entry.timestamp)} ', style: _timeStyle),
          TextSpan(
            text: '$levelTag ',
            style: TextStyle(
              color: color,
              fontFamily: 'monospace',
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          TextSpan(text: '${entry.source.padRight(8)} ', style: _sourceStyle),
          TextSpan(
            text: entry.message,
            style: TextStyle(
              color: color,
              fontFamily: 'monospace',
              fontSize: 11,
            ),
          ),
        ]),
      ),
    );
  }
}
