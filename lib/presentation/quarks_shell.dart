import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:auto_updater/auto_updater.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
    ref.watch(appVersionProvider); // preload so menu renders it immediately
    final registry = ref.watch(quarkRegistryProvider);
    final tabs = ref.watch(tabsProvider);

    // Active quark — drives toolbars and overlay.
    final quark =
        tabs.isHome ? null : registry.getById(tabs.openTabs[tabs.activeIndex]);

    // ALL pages kept alive: index 0 = home, 1..n = quark tabs (never unmounted).
    final contentIndex = tabs.isHome ? 0 : tabs.activeIndex + 1;
    final persistentContent = _ContentArea(
      child: IndexedStack(
        index: contentIndex,
        children: [
          _LauncherGrid(quarks: registry.quarks, ref: ref),
          for (final tabId in tabs.openTabs)
            _QuarkPage(
              key: ValueKey(tabId),
              quark: registry.getById(tabId)!,
            ),
        ],
      ),
    );

    return Scaffold(
      body: _WindowFrame(
        child: Column(
          children: [
            _TitleBar(tabs: tabs, registry: registry, ref: ref),
            // Toolbars appear here when a quark is active — BEFORE the content
            // so they don't change the content's position in the tree.
            if (quark != null) ...[
              QuarkToolbar(quark: quark),
              QuarkPinnedBar(quark: quark),
            ],
            // Content is ALWAYS at this position with a stable key so Flutter
            // never remounts it (preserves scroll, text, etc. across tab/home switches).
            Expanded(
              key: const ValueKey('quark_content'),
              child: Stack(
                children: [
                  Positioned.fill(child: persistentContent),
                  if (quark != null)
                    Positioned.fill(
                      child: Consumer(
                        builder: (ctx, ref, _) =>
                            quark.buildOverlay(ctx, ref) ??
                            const SizedBox.shrink(),
                      ),
                    ),
                ],
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
        border: Border.all(color: colors.borderDark, width: 1),
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
    final messenger = ScaffoldMessenger.of(context);
    final current = ref.read(themeModeProvider);
    final isDark = current == ThemeMode.dark;
    final version = ref.read(appVersionProvider).valueOrNull ?? '';

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
        if (_isDesktop)
          PopupMenuItem<String>(
            value: 'check_updates',
            height: 32,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.system_update_alt, size: 13, color: colors.textPrimary),
                const SizedBox(width: 8),
                Text(
                  'Buscar actualizaciones',
                  style: TextStyle(fontSize: 12, color: colors.textPrimary),
                ),
              ],
            ),
          ),
        if (version.isNotEmpty) ...[
          _MenuDivider(color: colors.primary),
          PopupMenuItem<String>(
            value: 'version',
            enabled: false,
            height: 26,
            padding: EdgeInsets.zero,
            child: Center(
              child: Text(
                'v$version',
                style: TextStyle(fontSize: 11, color: colors.textLight),
              ),
            ),
          ),
        ],
      ],
    ).then((value) {
      if (value == 'theme') {
        ref.read(themeModeProvider.notifier).state =
            isDark ? ThemeMode.light : ThemeMode.dark;
      } else if (value == 'check_updates') {
        _checkForUpdatesManually(messenger);
      }
    });
  }

  Future<void> _checkForUpdatesManually(
      ScaffoldMessengerState messenger) async {
    if (!_isDesktop) return;
    messenger.showSnackBar(
      const SnackBar(
        content: Text('Buscando actualizaciones...'),
        duration: Duration(seconds: 2),
      ),
    );

    // The Windows side of auto_updater swallows the underlying error and only
    // emits an opaque "error" event with no payload, so a manual check fetches
    // the appcast directly to surface a meaningful diagnostic.
    final currentVersion = ref.read(appVersionProvider).valueOrNull ?? '';
    String? errorDetail;
    String? latestVersion;

    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 10);
    try {
      final request = await client.getUrl(Uri.parse(
          'https://raw.githubusercontent.com/CapiFede/Quarks/main/appcast.xml'));
      final response =
          await request.close().timeout(const Duration(seconds: 10));
      if (response.statusCode != 200) {
        errorDetail = 'HTTP ${response.statusCode} al leer appcast.xml';
      } else {
        final body = await response.transform(utf8.decoder).join();
        final match =
            RegExp(r'<sparkle:version>(.*?)</sparkle:version>').firstMatch(body);
        if (match == null) {
          errorDetail = 'appcast.xml sin <sparkle:version>';
        } else {
          latestVersion = match.group(1)!.trim();
        }
      }
    } on TimeoutException {
      errorDetail = 'tiempo de espera agotado al contactar GitHub';
    } catch (e) {
      errorDetail = e.toString();
    } finally {
      client.close(force: true);
    }

    messenger.hideCurrentSnackBar();

    if (errorDetail != null) {
      final detail = errorDetail;
      messenger.showSnackBar(
        SnackBar(
          content: Text('No se pudo verificar: $detail'),
          duration: const Duration(seconds: 12),
          action: SnackBarAction(
            label: 'Copiar',
            onPressed: () =>
                Clipboard.setData(ClipboardData(text: detail)),
          ),
        ),
      );
      return;
    }

    if (latestVersion != null &&
        _isNewerVersion(latestVersion, currentVersion)) {
      messenger.showSnackBar(
        SnackBar(
          content: Text('Hay una nueva versión disponible: v$latestVersion'),
          duration: const Duration(seconds: 8),
          action: SnackBarAction(
            label: 'Actualizar',
            onPressed: () =>
                autoUpdater.checkForUpdates(inBackground: false),
          ),
        ),
      );
    } else {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Ya tenés la última versión.'),
          duration: Duration(seconds: 3),
        ),
      );
    }
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
                  bottom: BorderSide(color: colors.borderDark, width: 1),
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
                    isClose: true,
                    child: Text(
                      'X',
                      style: TextStyle(
                        fontSize: 14,
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

class _MenuDivider extends PopupMenuEntry<String> {
  const _MenuDivider({required this.color});

  final Color color;

  @override
  double get height => 9;

  @override
  bool represents(String? value) => false;

  @override
  State<_MenuDivider> createState() => _MenuDividerState();
}

class _MenuDividerState extends State<_MenuDivider> {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: widget.height,
      alignment: Alignment.center,
      child: Container(
        height: 1,
        margin: const EdgeInsets.symmetric(horizontal: 10),
        color: widget.color,
      ),
    );
  }
}

/// Compares two dotted version strings (e.g. "2.1.0" vs "2.0.1") and returns
/// true when [latest] is strictly greater than [current]. Missing components
/// are treated as 0; non-numeric components fall through to 0 as well.
bool _isNewerVersion(String latest, String current) {
  final l = latest.split('.').map((s) => int.tryParse(s) ?? 0).toList();
  final c = current.split('.').map((s) => int.tryParse(s) ?? 0).toList();
  final len = l.length > c.length ? l.length : c.length;
  for (var i = 0; i < len; i++) {
    final lv = i < l.length ? l[i] : 0;
    final cv = i < c.length ? c[i] : 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
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
        child: Padding(
          padding: const EdgeInsets.only(top: 6),
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
                  top: BorderSide(
                    color: isActive ? colors.border : Colors.transparent,
                    width: 1,
                  ),
                  left: BorderSide(
                    color: isActive ? colors.border : Colors.transparent,
                    width: 1,
                  ),
                  right: BorderSide(
                    color: isActive ? colors.border : Colors.transparent,
                    width: 1,
                  ),
                  bottom: BorderSide(
                    color: isActive ? colors.surface : Colors.transparent,
                    width: 1,
                  ),
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
      ),
    );
  }
}

class _WindowButton extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final bool isClose;

  const _WindowButton({
    required this.child,
    this.onTap,
    this.isClose = false,
  });

  @override
  State<_WindowButton> createState() => _WindowButtonState();
}

class _WindowButtonState extends State<_WindowButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    final hoverColor = widget.isClose
        ? colors.error
        : colors.primaryDark;

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        child: Container(
          width: 30,
          height: 24,
          color: _hovering ? hoverColor : Colors.transparent,
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
      margin: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.border, width: 1),
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
  final Quark quark;

  const _QuarkPage({super.key, required this.quark});

  @override
  Widget build(BuildContext context) => quark.buildPage();
}

