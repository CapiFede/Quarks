import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../data/services/binary_manager.dart';
import '../../data/services/ytdlp_service.dart';
import '../providers/download_providers.dart';
import '../providers/download_state.dart';
import '../providers/library_providers.dart';
import 'drawer_widgets.dart';

class DownloadDrawer extends ConsumerWidget {
  const DownloadDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(downloadProvider);
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
        child: state.binariesReady
            ? _DownloadForm(state: state)
            : _SetupView(state: state),
      ),
    );
  }
}

class _SetupView extends ConsumerWidget {
  final DownloadState state;

  const _SetupView({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DrawerTitleBar(title: 'DOWNLOAD', onClose: () => ref.read(downloadProvider.notifier).closeDrawer()),
          const SizedBox(height: 24),
          Text(
            'FIRST TIME SETUP',
            style: textTheme.titleSmall?.copyWith(color: colors.textPrimary),
          ),
          const SizedBox(height: 12),
          Text(
            'This feature requires yt-dlp and ffmpeg. They will be downloaded automatically (~90MB total).',
            style: textTheme.bodySmall?.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: 20),
          if (state.setupProgress != null) ...[
            _SetupProgressIndicator(progress: state.setupProgress!),
            const SizedBox(height: 12),
          ],
          if (state.errorMessage != null) ...[
            Text(
              state.errorMessage!,
              style: textTheme.bodySmall?.copyWith(color: colors.error),
            ),
            const SizedBox(height: 12),
          ],
          if (!state.isSettingUp)
            ActionButton(
              label: 'SETUP',
              onTap: () => ref.read(downloadProvider.notifier).setupBinaries(),
            ),
        ],
      ),
    );
  }
}

class _SetupProgressIndicator extends StatelessWidget {
  final BinarySetupProgress progress;

  const _SetupProgressIndicator({required this.progress});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    final label = switch (progress.phase) {
      BinarySetupPhase.checking => 'Checking...',
      BinarySetupPhase.downloadingYtdlp => 'Downloading yt-dlp...',
      BinarySetupPhase.downloadingFfmpeg => 'Downloading ffmpeg...',
      BinarySetupPhase.extracting => 'Extracting...',
      BinarySetupPhase.done => 'Ready!',
      BinarySetupPhase.error => 'Error',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: textTheme.bodySmall?.copyWith(color: colors.textSecondary)),
        const SizedBox(height: 6),
        PixelProgressBar(value: progress.percent),
      ],
    );
  }
}

class _DownloadForm extends ConsumerStatefulWidget {
  final DownloadState state;

  const _DownloadForm({required this.state});

  @override
  ConsumerState<_DownloadForm> createState() => _DownloadFormState();
}

class _DownloadFormState extends ConsumerState<_DownloadForm> {
  late final TextEditingController _urlController;
  late final TextEditingController _filenameController;

  @override
  void initState() {
    super.initState();
    _urlController = TextEditingController(text: widget.state.url);
    _filenameController = TextEditingController(text: widget.state.customFilename ?? '');
  }

  @override
  void didUpdateWidget(_DownloadForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.state.url != _urlController.text) {
      _urlController.text = widget.state.url;
    }
    final newFilename = widget.state.customFilename ?? '';
    if (newFilename != _filenameController.text) {
      _filenameController.text = newFilename;
    }
  }

  @override
  void dispose() {
    _urlController.dispose();
    _filenameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final state = widget.state;
    final libraryAsync = ref.watch(libraryProvider);
    final playlists = libraryAsync.valueOrNull?.playlists ?? [];
    final busy = state.isDownloading || state.isScanning;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DrawerTitleBar(
                title: 'DOWNLOAD',
                onClose: () => ref.read(downloadProvider.notifier).closeDrawer(),
              ),
              const SizedBox(height: 16),

              // URL field + Scan button
              Text('URL', style: textTheme.labelSmall?.copyWith(color: colors.textSecondary)),
              const SizedBox(height: 4),
              Row(
                children: [
                  Expanded(
                    child: PixelBorder(
                      inset: true,
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      backgroundColor: colors.surface,
                      child: TextField(
                        controller: _urlController,
                        enabled: !busy,
                        style: textTheme.bodySmall?.copyWith(color: colors.textPrimary),
                        decoration: InputDecoration(
                          hintText: 'YouTube URL...',
                          hintStyle: TextStyle(color: colors.textLight),
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(vertical: 8),
                        ),
                        onChanged: (v) => ref.read(downloadProvider.notifier).setUrl(v),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  SmallButton(
                    label: state.isScanning ? '...' : 'SCAN',
                    onTap: busy || state.url.isEmpty
                        ? null
                        : () => ref.read(downloadProvider.notifier).scanUrl(),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Thumbnail + Video info (after scan)
              if (state.videoInfo != null) ...[
                _VideoInfoCard(info: state.videoInfo!),
                const SizedBox(height: 12),
              ],

              // Custom filename (only for single videos, after scan)
              if (state.isScanned && !(state.videoInfo?.isPlaylist ?? false)) ...[
                Text('FILENAME', style: textTheme.labelSmall?.copyWith(color: colors.textSecondary)),
                const SizedBox(height: 4),
                PixelBorder(
                  inset: true,
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  backgroundColor: colors.surface,
                  child: TextField(
                    controller: _filenameController,
                    enabled: !busy,
                    style: textTheme.bodySmall?.copyWith(color: colors.textPrimary),
                    decoration: InputDecoration(
                      hintText: 'Filename',
                      hintStyle: TextStyle(color: colors.textLight),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 8),
                    ),
                    onChanged: (v) => ref.read(downloadProvider.notifier).setCustomFilename(v),
                  ),
                ),
                const SizedBox(height: 12),
              ],

              // Playlists (after scan)
              if (state.isScanned && playlists.isNotEmpty) ...[
                Text('ADD TO PLAYLISTS', style: textTheme.labelSmall?.copyWith(color: colors.textSecondary)),
                const SizedBox(height: 8),
                for (final pl in playlists)
                  PlaylistCheckbox(
                    name: pl.name,
                    checked: state.selectedPlaylistIds.contains(pl.id),
                    onChanged: busy
                        ? null
                        : () => ref.read(downloadProvider.notifier).togglePlaylist(pl.id),
                  ),
                const SizedBox(height: 16),
              ],

              // Progress
              if (state.progress != null && state.isDownloading) ...[
                _DownloadProgressView(progress: state.progress!),
                const SizedBox(height: 12),
              ],

              // Success message
              if (state.successMessage != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    state.successMessage!,
                    style: textTheme.bodySmall?.copyWith(color: colors.success),
                  ),
                ),

              // Error message
              if (state.errorMessage != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    state.errorMessage!,
                    style: textTheme.bodySmall?.copyWith(color: colors.error),
                  ),
                ),
            ],
          ),
        ),

        // Bottom action bar
        if (state.isScanned)
          Padding(
            padding: const EdgeInsets.all(16),
            child: state.isDownloading
                ? ActionButton(
                    label: 'CANCEL',
                    onTap: () => ref.read(downloadProvider.notifier).cancelDownload(),
                    isDestructive: true,
                  )
                : ActionButton(
                    label: 'DOWNLOAD',
                    onTap: state.url.isEmpty
                        ? null
                        : () => ref.read(downloadProvider.notifier).startDownload(),
                  ),
          ),
      ],
    );
  }
}

class _VideoInfoCard extends StatelessWidget {
  final VideoInfo info;

  const _VideoInfoCard({required this.info});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    return PixelBorder(
      padding: const EdgeInsets.all(8),
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (info.thumbnail != null)
            ClipRect(
              child: SizedBox(
                width: double.infinity,
                height: 160,
                child: Image.network(
                  info.thumbnail!,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    color: colors.surfaceAlt,
                    child: Icon(Icons.music_note, color: colors.textLight, size: 40),
                  ),
                ),
              ),
            ),
          if (info.thumbnail != null) const SizedBox(height: 8),
          Text(
            info.title,
            style: textTheme.bodySmall?.copyWith(color: colors.textPrimary),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          if (info.isPlaylist) ...[
            const SizedBox(height: 4),
            Text(
              'Playlist - ${info.videoCount} videos',
              style: textTheme.bodySmall?.copyWith(color: colors.textSecondary, fontSize: 10),
            ),
          ],
        ],
      ),
    );
  }
}

class _DownloadProgressView extends StatelessWidget {
  final DownloadProgress progress;

  const _DownloadProgressView({required this.progress});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    final phaseLabel = switch (progress.phase) {
      DownloadPhase.probing => 'Analyzing...',
      DownloadPhase.downloading => 'Downloading${progress.totalItems > 1 ? ' ${progress.currentItem}/${progress.totalItems}' : ''}',
      DownloadPhase.normalizing => 'Normalizing${progress.totalItems > 1 ? ' ${progress.currentItem}/${progress.totalItems}' : ''}',
      DownloadPhase.done => 'Done!',
      DownloadPhase.error => 'Error',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(phaseLabel, style: textTheme.bodySmall?.copyWith(color: colors.textSecondary)),
        if (progress.title.isNotEmpty) ...[
          const SizedBox(height: 2),
          Text(
            progress.title,
            style: textTheme.bodySmall?.copyWith(color: colors.textLight, fontSize: 10),
            overflow: TextOverflow.ellipsis,
          ),
        ],
        const SizedBox(height: 6),
        PixelProgressBar(value: progress.percent),
      ],
    );
  }
}
