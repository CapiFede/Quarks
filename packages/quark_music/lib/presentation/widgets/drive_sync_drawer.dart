import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../data/services/drive_sync_service.dart';
import '../providers/drive_sync_providers.dart';
import '../providers/drive_sync_state.dart';
import 'drawer_widgets.dart';

class DriveSyncDrawer extends ConsumerWidget {
  const DriveSyncDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(driveSyncProvider);
    if (!state.drawerOpen) return const SizedBox.shrink();

    final colors = context.quarksColors;

    return Positioned(
      top: 0,
      bottom: 0,
      right: 0,
      child: Container(
        width: 320,
        decoration: BoxDecoration(
          color: colors.background,
          border: Border(
            left: BorderSide(color: colors.borderDark, width: 2),
          ),
          boxShadow: [
            BoxShadow(
              color: colors.cardShadow,
              offset: const Offset(-4, 0),
              blurRadius: 8,
            ),
          ],
        ),
        child: _DriveSyncContent(state: state),
      ),
    );
  }
}

class _DriveSyncContent extends ConsumerWidget {
  final DriveSyncState state;

  const _DriveSyncContent({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final notifier = ref.read(driveSyncProvider.notifier);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DrawerTitleBar(
            title: 'GOOGLE DRIVE',
            onClose: notifier.closeDrawer,
          ),
          const SizedBox(height: 24),
          if (state.isInitializing) ...[
            Text(
              'Cargando...',
              style: textTheme.bodySmall
                  ?.copyWith(color: colors.textSecondary),
            ),
          ] else if (state.isConnected) ...[
            Text(
              'CONECTADO COMO',
              style:
                  textTheme.labelSmall?.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: 6),
            Text(
              state.connectedEmail ?? '',
              style:
                  textTheme.bodySmall?.copyWith(color: colors.textPrimary),
            ),
            const SizedBox(height: 20),
            ActionButton(
              label: state.isSyncing ? 'SINCRONIZANDO...' : 'SINCRONIZAR AHORA',
              onTap: state.isSyncing ? null : () => notifier.syncNow(),
            ),
            if (state.isSyncing && state.syncProgress != null) ...[
              const SizedBox(height: 12),
              _SyncProgressView(progress: state.syncProgress!),
            ],
            const SizedBox(height: 8),
            ActionButton(
              label: 'DESCONECTAR',
              isDestructive: true,
              onTap: state.isSyncing ? null : () => notifier.disconnect(),
            ),
          ] else if (state.authUrl != null) ...[
            _AuthUrlSection(authUrl: state.authUrl!),
            const SizedBox(height: 16),
            ActionButton(
              label: 'CANCELAR',
              isDestructive: true,
              onTap: notifier.cancelConnect,
            ),
          ] else ...[
            Text(
              'Conectá tu cuenta de Google para sincronizar tu biblioteca entre dispositivos.',
              style: textTheme.bodySmall
                  ?.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: 16),
            ActionButton(
              label: state.isConnecting ? 'INICIANDO...' : 'CONECTAR DRIVE',
              onTap: state.isConnecting ? null : () => notifier.connect(),
            ),
            if (state.isConnecting) ...[
              const SizedBox(height: 8),
              ActionButton(
                label: 'CANCELAR',
                isDestructive: true,
                onTap: notifier.cancelConnect,
              ),
            ],
          ],
          const SizedBox(height: 16),
          if (state.successMessage != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                state.successMessage!,
                style:
                    textTheme.bodySmall?.copyWith(color: colors.success),
              ),
            ),
          if (state.errorMessage != null)
            Text(
              state.errorMessage!,
              style: textTheme.bodySmall?.copyWith(color: colors.error),
            ),
        ],
      ),
    );
  }
}

class _AuthUrlSection extends StatefulWidget {
  final String authUrl;
  const _AuthUrlSection({required this.authUrl});

  @override
  State<_AuthUrlSection> createState() => _AuthUrlSectionState();
}

class _AuthUrlSectionState extends State<_AuthUrlSection> {
  bool _copied = false;

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.authUrl));
    setState(() => _copied = true);
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _copied = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'ABRÍ ESTE LINK EN TU NAVEGADOR:',
          style: textTheme.labelSmall?.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: colors.surfaceAlt,
            border: Border.all(color: colors.borderDark, width: 1.5),
          ),
          child: SelectableText(
            widget.authUrl,
            style: textTheme.bodySmall?.copyWith(
              color: colors.textSecondary,
              fontSize: 9,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: ActionButton(
                label: _copied ? 'COPIADO' : 'COPIAR',
                onTap: _copy,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ActionButton(
                label: 'ABRIR',
                onTap: () => launchUrl(
                  Uri.parse(widget.authUrl),
                  mode: LaunchMode.externalApplication,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _SyncProgressView extends StatelessWidget {
  final SyncProgress progress;

  const _SyncProgressView({required this.progress});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    final phaseLabel = switch (progress.phase) {
      SyncPhase.scanning => 'Escaneando...',
      SyncPhase.uploading =>
        'Subiendo${progress.totalItems > 1 ? ' ${progress.currentItem}/${progress.totalItems}' : ''}',
      SyncPhase.downloading =>
        'Descargando${progress.totalItems > 1 ? ' ${progress.currentItem}/${progress.totalItems}' : ''}',
      SyncPhase.deleting => 'Eliminando...',
      SyncPhase.done => 'Listo',
      SyncPhase.error => 'Error',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          phaseLabel,
          style: textTheme.bodySmall?.copyWith(color: colors.textSecondary),
        ),
        if (progress.title.isNotEmpty) ...[
          const SizedBox(height: 2),
          Text(
            progress.title,
            style: textTheme.bodySmall
                ?.copyWith(color: colors.textLight, fontSize: 10),
            overflow: TextOverflow.ellipsis,
          ),
        ],
        const SizedBox(height: 6),
        PixelProgressBar(value: progress.percent),
      ],
    );
  }
}
