import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;

import 'binary_manager.dart';

enum DownloadPhase { probing, downloading, normalizing, done, error }

class DownloadProgress {
  final int currentItem;
  final int totalItems;
  final String title;
  final double percent;
  final DownloadPhase phase;
  final String? error;
  final List<String> completedPaths;

  const DownloadProgress({
    this.currentItem = 0,
    this.totalItems = 0,
    this.title = '',
    this.percent = 0,
    this.phase = DownloadPhase.probing,
    this.error,
    this.completedPaths = const [],
  });
}

class VideoInfo {
  final String title;
  final String? thumbnail;
  final bool isPlaylist;
  final int videoCount;

  const VideoInfo({
    required this.title,
    this.thumbnail,
    this.isPlaylist = false,
    this.videoCount = 1,
  });
}

class YtdlpService {
  final BinaryManager _binaryManager;
  Process? _activeProcess;

  YtdlpService(this._binaryManager);

  void cancel() {
    _activeProcess?.kill();
    _activeProcess = null;
  }

  Future<VideoInfo?> scan(String url) async {
    final ytdlp = await _binaryManager.ytdlpPath;
    debugPrint('[ytdlp] Scanning: $url');

    final result = await Process.run(ytdlp, [
      '--flat-playlist',
      '--dump-json',
      url,
    ]);

    if (result.exitCode != 0) {
      debugPrint('[ytdlp] Scan failed: ${result.stderr}');
      return null;
    }

    final lines = (result.stdout as String)
        .split('\n')
        .where((l) => l.trim().isNotEmpty)
        .toList();

    if (lines.isEmpty) return null;

    final entries = <Map<String, dynamic>>[];
    for (final line in lines) {
      try {
        entries.add(jsonDecode(line) as Map<String, dynamic>);
      } catch (_) {}
    }

    if (entries.isEmpty) return null;

    final isPlaylist = entries.length > 1;
    final first = entries.first;

    return VideoInfo(
      title: first['title'] as String? ?? 'Unknown',
      thumbnail: first['thumbnail'] as String? ?? first['thumbnails']?.last?['url'] as String?,
      isPlaylist: isPlaylist,
      videoCount: entries.length,
    );
  }

  Stream<DownloadProgress> download({
    required String url,
    required String outputFolder,
    String? customFilename,
  }) async* {
    final ytdlp = await _binaryManager.ytdlpPath;
    final ffmpeg = await _binaryManager.ffmpegPath;

    final tempDir = Directory(p.join(outputFolder, '_ytdl_temp'));
    if (!tempDir.existsSync()) tempDir.createSync();

    try {
      final useCustomName = customFilename != null && customFilename.isNotEmpty;
      final template = useCustomName
          ? '$customFilename.%(ext)s'
          : '%(title)s.%(ext)s';

      yield const DownloadProgress(
        phase: DownloadPhase.downloading,
        currentItem: 1,
        title: 'Starting download...',
      );

      final downloadArgs = [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '320K',
        '--no-continue',
        '--ffmpeg-location', ffmpeg,
        '-o', p.join(tempDir.path, template),
        url,
      ];

      debugPrint('[ytdlp] Starting: $ytdlp ${downloadArgs.join(' ')}');
      final process = await Process.start(ytdlp, downloadArgs);
      _activeProcess = process;

      var currentItem = 0;
      final progressRegex = RegExp(r'\[download\]\s+(\d+\.?\d*)%');
      final destRegex = RegExp(r'\[download\] Destination: (.+)');
      var currentTitle = '';

      // Listen to both stdout and stderr concurrently to avoid deadlock
      final controller = StreamController<String>();
      final stdoutSub = process.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(controller.add);
      final stderrSub = process.stderr
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(controller.add);

      var doneCount = 0;
      void onStreamDone() {
        doneCount++;
        if (doneCount == 2) controller.close();
      }
      stdoutSub.onDone(onStreamDone);
      stderrSub.onDone(onStreamDone);

      await for (final line in controller.stream) {
        debugPrint('[ytdlp] $line');
        final progressMatch = progressRegex.firstMatch(line);
        final destMatch = destRegex.firstMatch(line);

        if (destMatch != null) {
          currentItem++;
          final filename = destMatch.group(1) ?? '';
          currentTitle = p.basename(filename).replaceAll(RegExp(r'\.\w+$'), '');
        }

        if (progressMatch != null) {
          final pct = double.tryParse(progressMatch.group(1) ?? '0') ?? 0;
          yield DownloadProgress(
            phase: DownloadPhase.downloading,
            currentItem: currentItem.clamp(1, currentItem),
            totalItems: currentItem,
            title: currentTitle,
            percent: pct / 100,
          );
        }
      }

      final exitCode = await process.exitCode;
      _activeProcess = null;
      debugPrint('[ytdlp] Process exited with code $exitCode');

      if (exitCode != 0) {
        yield DownloadProgress(
          phase: DownloadPhase.error,
          error: 'yt-dlp exited with code $exitCode',
        );
        return;
      }

      // Phase: Normalize
      final mp3Files = tempDir.listSync().whereType<File>().where(
        (f) => f.path.toLowerCase().endsWith('.mp3'),
      ).toList();

      if (mp3Files.isEmpty) {
        yield const DownloadProgress(
          phase: DownloadPhase.error,
          error: 'No MP3 files were downloaded',
        );
        return;
      }

      final completedPaths = <String>[];

      for (var i = 0; i < mp3Files.length; i++) {
        final file = mp3Files[i];
        final filename = p.basename(file.path);
        final outputPath = p.join(outputFolder, filename);

        yield DownloadProgress(
          phase: DownloadPhase.normalizing,
          currentItem: i + 1,
          totalItems: mp3Files.length,
          title: filename.replaceAll('.mp3', ''),
          percent: i / mp3Files.length,
        );

        final normProcess = await Process.run(ffmpeg, [
          '-i', file.path,
          '-af', 'loudnorm=I=-14:TP=-2.0:LRA=7',
          '-ar', '44100',
          '-loglevel', 'warning',
          '-y',
          outputPath,
        ]);

        if (normProcess.exitCode == 0) {
          completedPaths.add(outputPath);
        }
      }

      // Cleanup temp
      tempDir.deleteSync(recursive: true);

      yield DownloadProgress(
        phase: DownloadPhase.done,
        totalItems: mp3Files.length,
        completedPaths: completedPaths,
        percent: 1,
        title: '${completedPaths.length} tracks downloaded',
      );
    } catch (e) {
      if (tempDir.existsSync()) tempDir.deleteSync(recursive: true);
      yield DownloadProgress(
        phase: DownloadPhase.error,
        error: e.toString(),
      );
    }
  }
}
