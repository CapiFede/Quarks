import 'dart:async';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:path_provider/path_provider.dart';

enum BinarySetupPhase { checking, downloadingYtdlp, downloadingFfmpeg, extracting, done, error }

class BinarySetupProgress {
  final BinarySetupPhase phase;
  final double percent;
  final String? error;

  const BinarySetupProgress({
    required this.phase,
    this.percent = 0,
    this.error,
  });
}

class BinaryManager {
  static const _ytdlpUrl =
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
  static const _ffmpegUrl =
      'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';

  String? _binDir;

  Future<String> get _binDirectory async {
    if (_binDir != null) return _binDir!;
    final appDir = await getApplicationSupportDirectory();
    _binDir = '${appDir.path}${Platform.pathSeparator}bin';
    return _binDir!;
  }

  Future<String> get ytdlpPath async => '${await _binDirectory}${Platform.pathSeparator}yt-dlp.exe';
  Future<String> get ffmpegPath async => '${await _binDirectory}${Platform.pathSeparator}ffmpeg.exe';

  Future<bool> areBinariesReady() async {
    final ytdlp = File(await ytdlpPath);
    final ffmpeg = File(await ffmpegPath);
    return ytdlp.existsSync() && ffmpeg.existsSync();
  }

  Stream<BinarySetupProgress> ensureBinaries() async* {
    yield const BinarySetupProgress(phase: BinarySetupPhase.checking);

    final binDir = Directory(await _binDirectory);
    if (!binDir.existsSync()) {
      binDir.createSync(recursive: true);
    }

    final ytdlpFile = File(await ytdlpPath);
    final ffmpegFile = File(await ffmpegPath);

    try {
      if (!ytdlpFile.existsSync()) {
        yield* _downloadFile(
          _ytdlpUrl,
          ytdlpFile.path,
          BinarySetupPhase.downloadingYtdlp,
        );
      }

      if (!ffmpegFile.existsSync()) {
        final zipPath = '${await _binDirectory}${Platform.pathSeparator}ffmpeg.zip';
        yield* _downloadFile(
          _ffmpegUrl,
          zipPath,
          BinarySetupPhase.downloadingFfmpeg,
        );

        yield const BinarySetupProgress(phase: BinarySetupPhase.extracting);
        await _extractFfmpeg(zipPath, ffmpegFile.path);
        File(zipPath).deleteSync();
      }

      yield const BinarySetupProgress(phase: BinarySetupPhase.done, percent: 1);
    } catch (e) {
      yield BinarySetupProgress(
        phase: BinarySetupPhase.error,
        error: e.toString(),
      );
    }
  }

  Stream<BinarySetupProgress> _downloadFile(
    String url,
    String destPath,
    BinarySetupPhase phase,
  ) async* {
    yield BinarySetupProgress(phase: phase, percent: 0);

    final client = HttpClient();
    try {
      final request = await client.getUrl(Uri.parse(url));
      final response = await request.close();

      // Follow redirects manually if needed
      if (response.statusCode != 200) {
        throw Exception('Download failed with status ${response.statusCode}');
      }

      final totalBytes = response.contentLength;
      var receivedBytes = 0;

      final file = File(destPath);
      final sink = file.openWrite();

      await for (final chunk in response) {
        sink.add(chunk);
        receivedBytes += chunk.length;
        if (totalBytes > 0) {
          yield BinarySetupProgress(
            phase: phase,
            percent: receivedBytes / totalBytes,
          );
        }
      }

      await sink.close();
    } finally {
      client.close();
    }
  }

  Future<void> _extractFfmpeg(String zipPath, String destPath) async {
    final bytes = await File(zipPath).readAsBytes();
    final archive = ZipDecoder().decodeBytes(bytes);

    for (final file in archive) {
      if (file.isFile && file.name.endsWith('bin/ffmpeg.exe')) {
        final output = File(destPath);
        output.writeAsBytesSync(file.content as List<int>);
        return;
      }
    }

    throw Exception('ffmpeg.exe not found in archive');
  }
}
