import 'dart:convert';
import 'dart:io';

import 'package:flutter_pty/flutter_pty.dart';
import 'package:xterm/xterm.dart';

class PtyShellRunner {
  final void Function(String cwd) onCwdChanged;
  late final Pty _pty;
  late final Terminal terminal;
  String _residual = '';
  bool _disposed = false;

  PtyShellRunner({
    required String shell,
    required List<String> arguments,
    required String workingDirectory,
    required this.onCwdChanged,
  }) {
    terminal = Terminal(maxLines: 10000);

    _pty = Pty.start(
      shell,
      arguments: arguments,
      workingDirectory: workingDirectory,
      environment: Platform.environment,
      columns: terminal.viewWidth,
      rows: terminal.viewHeight,
    );

    _pty.output.cast<List<int>>().listen((bytes) {
      _scanForOsc7(bytes);
      terminal.write(utf8.decode(bytes, allowMalformed: true));
    });

    _pty.exitCode.then((code) {
      if (_disposed) return;
      terminal.write('\r\n\x1b[90m[shell exited: $code]\x1b[0m\r\n');
    });

    terminal.onOutput = (data) {
      if (_disposed) return;
      _pty.write(const Utf8Encoder().convert(data));
    };

    terminal.onResize = (w, h, pw, ph) {
      if (_disposed) return;
      _pty.resize(h, w);
    };
  }

  static final RegExp _osc7Re = RegExp(
    r'\x1b\]7;file://([^/]*)/([^\x1b\x07]*?)(?:\x1b\\|\x07)',
  );

  void _scanForOsc7(List<int> bytes) {
    final chunk = utf8.decode(bytes, allowMalformed: true);
    final text = _residual + chunk;
    int lastEnd = 0;
    for (final m in _osc7Re.allMatches(text)) {
      lastEnd = m.end;
      try {
        final encoded = m.group(2) ?? '';
        final decoded = Uri.decodeComponent(encoded);
        final path = Platform.isWindows
            ? decoded.replaceAll('/', r'\')
            : '/$decoded';
        onCwdChanged(path);
      } catch (_) {
        // malformed sequence, ignore
      }
    }
    final tail = text.substring(lastEnd);
    final partial = tail.lastIndexOf('\x1b]7;');
    if (partial >= 0) {
      _residual = tail.substring(partial);
      if (_residual.length > 4096) {
        _residual = _residual.substring(_residual.length - 4096);
      }
    } else {
      _residual = '';
    }
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    try {
      _pty.kill();
    } catch (_) {}
  }
}

class ShellLauncher {
  static String resolveShell() {
    if (Platform.isWindows) {
      // Use bare executable names (no full path) so CreateProcess resolves
      // them via PATH. Full paths like "C:\Program Files\..." get mangled
      // by flutter_pty's command-line construction on spaces.
      try {
        final r = Process.runSync('where.exe', ['pwsh']);
        if (r.exitCode == 0 && r.stdout.toString().trim().isNotEmpty) {
          return 'pwsh.exe';
        }
      } catch (_) {}
      return 'powershell.exe';
    }
    return Platform.environment['SHELL'] ?? '/bin/bash';
  }

  static List<String> argsFor(String shell) {
    final lower = shell.toLowerCase();
    if (lower.contains('pwsh') || lower.contains('powershell')) {
      return ['-NoLogo', '-NoExit', '-Command', _powershellBootstrap];
    }
    if (lower.contains('bash') || lower.contains('zsh')) {
      return ['-i'];
    }
    return const [];
  }

  /// Wraps the user's existing prompt to emit an OSC 7 sequence carrying
  /// the current working directory. The OSC 7 is sent as a side-effect
  /// via Write-Host so PSReadLine's prompt-width calculation isn't thrown
  /// off by escape bytes embedded in the returned prompt string.
  ///
  /// Quote escaping: `\"` survives Windows CRT argv parsing as a literal
  /// `"`; `\\\"` survives as a literal `\"` (the OSC 7 string in PowerShell
  /// ends with `\` and the closing quote, so we need `\\\"` to produce the
  /// `\"` pair in argv).
  static const String _powershellBootstrap =
      r"""$global:_qPrev=(Get-Item Function:prompt).ScriptBlock; function global:prompt { $p=(Get-Location).Path -replace '\\','/'; $e=[char]27; [Console]::Write(\"$e]7;file:///$p$e\\\"); & $global:_qPrev }""";
}
