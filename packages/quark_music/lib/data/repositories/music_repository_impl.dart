import '../../domain/entities/track.dart';
import '../../domain/repositories/music_repository.dart';
import '../services/scanner_service.dart';

class MusicRepositoryImpl implements MusicRepository {
  final ScannerService _scannerService;
  String? _lastScannedFolder;

  MusicRepositoryImpl({ScannerService? scannerService})
      : _scannerService = scannerService ?? ScannerService();

  @override
  Future<List<Track>> scanFolder(String folderPath) async {
    _lastScannedFolder = folderPath;
    return _scannerService.scanDirectory(folderPath);
  }

  @override
  String? get lastScannedFolder => _lastScannedFolder;

  @override
  Future<void> saveScannedFolder(String folderPath) async {
    _lastScannedFolder = folderPath;
  }
}
