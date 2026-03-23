import 'dart:io';

import 'binary_manager.dart';

class AudioEditService {
  final BinaryManager _binaryManager;

  AudioEditService(this._binaryManager);

  Future<Duration?> probeDuration(String filePath) async {
    final ffmpeg = await _binaryManager.ffmpegPath;
    final result = await Process.run(ffmpeg, ['-i', filePath, '-f', 'null', '-']);

    // ffmpeg prints info to stderr
    final output = result.stderr as String;
    final match = RegExp(r'Duration:\s*(\d+):(\d+):(\d+)\.(\d+)').firstMatch(output);
    if (match == null) return null;

    final hours = int.parse(match.group(1)!);
    final minutes = int.parse(match.group(2)!);
    final seconds = int.parse(match.group(3)!);
    final centiseconds = int.parse(match.group(4)!.padRight(2, '0').substring(0, 2));

    return Duration(
      hours: hours,
      minutes: minutes,
      seconds: seconds,
      milliseconds: centiseconds * 10,
    );
  }

  Future<bool> trimAudio(String filePath, Duration start, Duration end) async {
    final ffmpeg = await _binaryManager.ffmpegPath;
    final tempPath = '$filePath.trim_temp.mp3';

    final result = await Process.run(ffmpeg, [
      '-y',
      '-i', filePath,
      '-ss', _formatDuration(start),
      '-to', _formatDuration(end),
      '-c', 'copy',
      tempPath,
    ]);

    if (result.exitCode != 0) return false;

    final tempFile = File(tempPath);
    if (!tempFile.existsSync()) return false;

    await File(filePath).delete();
    await tempFile.rename(filePath);
    return true;
  }

  String _formatDuration(Duration d) {
    final hours = d.inHours.toString().padLeft(2, '0');
    final minutes = (d.inMinutes % 60).toString().padLeft(2, '0');
    final seconds = (d.inSeconds % 60).toString().padLeft(2, '0');
    final millis = (d.inMilliseconds % 1000).toString().padLeft(3, '0');
    return '$hours:$minutes:$seconds.$millis';
  }
}
