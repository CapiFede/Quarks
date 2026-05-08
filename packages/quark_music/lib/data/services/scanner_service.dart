import 'dart:io';

import '../../domain/entities/track.dart';

class ScannerService {
  static const _supportedExtensions = {'.mp3', '.wav', '.flac', '.ogg', '.m4a'};

  /// Recursively scan a directory for music files. A single unreadable file or
  /// subdirectory should not abort the entire scan, so per-entry errors are
  /// caught and skipped instead of propagating up and putting the library in
  /// an error state with no tracks shown.
  Future<List<Track>> scanDirectory(String directoryPath) async {
    final dir = Directory(directoryPath);
    if (!await dir.exists()) return [];

    final tracks = <Track>[];
    final stream = dir
        .list(recursive: true, followLinks: false)
        .handleError((_) {}, test: (_) => true);

    await for (final entity in stream) {
      if (entity is File) {
        final ext = _extensionOf(entity.path);
        if (_supportedExtensions.contains(ext)) {
          tracks.add(Track.fromPath(entity.path));
        }
      }
    }

    tracks.sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
    return tracks;
  }

  String _extensionOf(String path) {
    final dot = path.lastIndexOf('.');
    if (dot == -1) return '';
    return path.substring(dot).toLowerCase();
  }
}
