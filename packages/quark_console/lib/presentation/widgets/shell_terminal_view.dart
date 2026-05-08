import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xterm/xterm.dart';

import '../../domain/entities/shell_session.dart';
import '../providers/sessions_providers.dart';

class ShellTerminalView extends ConsumerStatefulWidget {
  final ShellSession session;
  const ShellTerminalView({super.key, required this.session});

  @override
  ConsumerState<ShellTerminalView> createState() => _ShellTerminalViewState();
}

class _ShellTerminalViewState extends ConsumerState<ShellTerminalView> {
  late final TerminalController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TerminalController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final runner = PtyRunnerCache.instance.getOrCreate(
      widget.session.id,
      cwd: widget.session.cwd,
      onCwdChanged: (cwd) {
        ref.read(sessionsProvider.notifier).updateCwd(widget.session.id, cwd);
      },
    );

    return Container(
      color: const Color(0xFF14151A),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: TerminalView(
        runner.terminal,
        controller: _controller,
        autofocus: true,
        backgroundOpacity: 0,
        padding: const EdgeInsets.all(6),
        textStyle: const TerminalStyle(
          fontFamily: 'monospace',
          fontSize: 13,
        ),
      ),
    );
  }
}
