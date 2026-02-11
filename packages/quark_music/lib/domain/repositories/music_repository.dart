import '../entities/track.dart';

abstract class MusicRepository {
  /// Scan a directory for music files and return found tracks
  Future<List<Track>> scanFolder(String folderPath);

  /// Get the last scanned folder path (if any)
  String? get lastScannedFolder;

  /// Save the scanned folder path for persistence
  Future<void> saveScannedFolder(String folderPath);
}
