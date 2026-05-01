import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:googleapis/drive/v3.dart' as drive;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'drive_auth_service.dart';

enum SyncPhase { scanning, uploading, downloading, deleting, done, error }

class SyncProgress {
  final SyncPhase phase;
  final int currentItem;
  final int totalItems;
  final String title;
  final double percent;
  final String? error;

  const SyncProgress({
    required this.phase,
    this.currentItem = 0,
    this.totalItems = 0,
    this.title = '',
    this.percent = 0.0,
    this.error,
  });
}

class DriveSyncService {
  final DriveAuthService _auth;

  static const _manifestFilename = 'drive_sync_manifest.json';

  DriveSyncService(this._auth);

  Future<drive.DriveApi?> _getApi() async {
    final client = await _auth.getAuthenticatedClient();
    if (client == null) return null;
    return drive.DriveApi(client);
  }

  Future<String> _ensureFolder(
    drive.DriveApi api,
    String name,
    String? parentId,
  ) async {
    final parent = parentId ?? 'root';
    final q = "name = '$name' and '$parent' in parents"
        " and mimeType = 'application/vnd.google-apps.folder'"
        " and trashed = false";
    final result = await api.files.list(q: q, $fields: 'files(id)');
    if (result.files?.isNotEmpty == true) return result.files!.first.id!;

    final metadata = drive.File()
      ..name = name
      ..mimeType = 'application/vnd.google-apps.folder';
    if (parentId != null) metadata.parents = [parentId];
    final created = await api.files.create(metadata, $fields: 'id');
    return created.id!;
  }

  Future<Map<String, drive.File>> _listFolder(
    drive.DriveApi api,
    String folderId,
    String prefix,
  ) async {
    final result = <String, drive.File>{};
    String? pageToken;
    do {
      final res = await api.files.list(
        q: "'$folderId' in parents and trashed = false",
        $fields: 'nextPageToken, files(id, name, modifiedTime)',
        pageToken: pageToken,
      );
      for (final f in res.files ?? []) {
        if (f.name != null) result['$prefix/${f.name}'] = f;
      }
      pageToken = res.nextPageToken;
    } while (pageToken != null);
    return result;
  }

  Stream<SyncProgress> sync({
    required String musicDirPath,
    required String playlistsDirPath,
  }) async* {
    yield const SyncProgress(
      phase: SyncPhase.scanning,
      title: 'Escaneando...',
      percent: 0,
    );

    try {
      final api = await _getApi();
      if (api == null) {
        yield const SyncProgress(
          phase: SyncPhase.error,
          error: 'No autenticado. Conectá tu Drive primero.',
        );
        return;
      }

      final quarksId = await _ensureFolder(api, 'Quarks', null);
      final musicFolderId = await _ensureFolder(api, 'music', quarksId);
      final playlistsFolderId =
          await _ensureFolder(api, 'playlists', quarksId);

      final remoteFiles = <String, drive.File>{
        ...await _listFolder(api, musicFolderId, 'music'),
        ...await _listFolder(api, playlistsFolderId, 'playlists'),
      };

      final localFiles = <String, File>{};
      final musicDir = Directory(musicDirPath);
      if (await musicDir.exists()) {
        await for (final e in musicDir.list()) {
          if (e is File && e.path.endsWith('.mp3')) {
            localFiles['music/${p.basename(e.path)}'] = e;
          }
        }
      }
      final playlistsDir = Directory(playlistsDirPath);
      if (await playlistsDir.exists()) {
        await for (final e in playlistsDir.list()) {
          if (e is File && e.path.endsWith('.json')) {
            localFiles['playlists/${p.basename(e.path)}'] = e;
          }
        }
      }

      final manifest = await _loadManifest();

      final allPaths = {
        ...localFiles.keys,
        ...remoteFiles.keys,
        ...manifest.keys,
      };

      final ops = <_Op>[];
      final nextManifest = <String, _ManifestEntry>{};

      for (final path in allPaths) {
        final local = localFiles[path];
        final remote = remoteFiles[path];
        final entry = manifest[path];

        if (local != null && remote != null) {
          final localMtime = await local.lastModified();
          final remoteMtime = remote.modifiedTime!;
          if (localMtime.isAfter(remoteMtime)) {
            ops.add(_Op.upload(path, local, driveId: remote.id!));
            nextManifest[path] = _ManifestEntry(
              driveId: remote.id!,
              mtime: localMtime,
            );
          } else if (remoteMtime.isAfter(localMtime)) {
            ops.add(_Op.download(
              path,
              remote.id!,
              _resolveLocal(path, musicDirPath, playlistsDirPath),
              remoteMtime,
            ));
            nextManifest[path] = _ManifestEntry(
              driveId: remote.id!,
              mtime: remoteMtime,
            );
          } else {
            nextManifest[path] =
                _ManifestEntry(driveId: remote.id!, mtime: localMtime);
          }
        } else if (local != null) {
          if (entry == null) {
            final parentId = path.startsWith('music/')
                ? musicFolderId
                : playlistsFolderId;
            ops.add(_Op.upload(path, local, parentFolderId: parentId));
          } else {
            ops.add(_Op.deleteLocal(path, local));
          }
        } else if (remote != null) {
          if (entry == null) {
            ops.add(_Op.download(
              path,
              remote.id!,
              _resolveLocal(path, musicDirPath, playlistsDirPath),
              remote.modifiedTime!,
            ));
            nextManifest[path] = _ManifestEntry(
              driveId: remote.id!,
              mtime: remote.modifiedTime!,
            );
          } else {
            ops.add(_Op.deleteRemote(path, remote.id!));
          }
        }
      }

      if (ops.isEmpty) {
        await _saveManifest(nextManifest);
        yield const SyncProgress(
          phase: SyncPhase.done,
          percent: 1.0,
          title: 'Sin cambios',
        );
        return;
      }

      final total = ops.length;
      int done = 0;
      for (final op in ops) {
        done++;
        final percent = done / total;

        switch (op.type) {
          case _OpType.upload:
            yield SyncProgress(
              phase: SyncPhase.uploading,
              currentItem: done,
              totalItems: total,
              title: p.basename(op.path),
              percent: (done - 1) / total,
            );
            final mtime = await op.localFile!.lastModified();
            final driveId = await _upload(
              api,
              op.localFile!,
              p.basename(op.path),
              op.driveId,
              op.parentFolderId,
              mtime,
            );
            nextManifest[op.path] = _ManifestEntry(driveId: driveId, mtime: mtime);

          case _OpType.download:
            yield SyncProgress(
              phase: SyncPhase.downloading,
              currentItem: done,
              totalItems: total,
              title: p.basename(op.path),
              percent: (done - 1) / total,
            );
            await _download(api, op.driveId!, op.localPath!);
            await File(op.localPath!).setLastModified(op.remoteMtime!);
            nextManifest[op.path] = _ManifestEntry(
              driveId: op.driveId!,
              mtime: op.remoteMtime!,
            );

          case _OpType.deleteLocal:
            yield SyncProgress(
              phase: SyncPhase.deleting,
              currentItem: done,
              totalItems: total,
              title: p.basename(op.path),
              percent: percent,
            );
            try {
              await op.localFile!.delete();
            } catch (_) {}

          case _OpType.deleteRemote:
            yield SyncProgress(
              phase: SyncPhase.deleting,
              currentItem: done,
              totalItems: total,
              title: p.basename(op.path),
              percent: percent,
            );
            try {
              await api.files.delete(op.driveId!);
            } catch (_) {}
        }
      }

      await _saveManifest(nextManifest);
      yield SyncProgress(
        phase: SyncPhase.done,
        percent: 1.0,
        currentItem: total,
        totalItems: total,
        title: 'Sincronizado',
      );
    } catch (e) {
      yield SyncProgress(phase: SyncPhase.error, error: e.toString());
    }
  }

  String _resolveLocal(
    String relativePath,
    String musicDirPath,
    String playlistsDirPath,
  ) {
    if (relativePath.startsWith('music/')) {
      return p.join(musicDirPath, relativePath.substring('music/'.length));
    }
    return p.join(
      playlistsDirPath,
      relativePath.substring('playlists/'.length),
    );
  }

  Future<String> _upload(
    drive.DriveApi api,
    File file,
    String name,
    String? existingId,
    String? parentId,
    DateTime mtime,
  ) async {
    final media = drive.Media(file.openRead(), await file.length());
    if (existingId != null) {
      await api.files.update(
        drive.File()..modifiedTime = mtime,
        existingId,
        uploadMedia: media,
      );
      return existingId;
    }
    final metadata = drive.File()
      ..name = name
      ..parents = [parentId!]
      ..modifiedTime = mtime;
    final result =
        await api.files.create(metadata, uploadMedia: media, $fields: 'id');
    return result.id!;
  }

  Future<void> _download(
    drive.DriveApi api,
    String driveId,
    String localPath,
  ) async {
    final media = await api.files.get(
      driveId,
      downloadOptions: drive.DownloadOptions.fullMedia,
    ) as drive.Media;
    final file = File(localPath);
    await file.parent.create(recursive: true);
    final sink = file.openWrite();
    await sink.addStream(media.stream);
    await sink.close();
  }

  Future<Map<String, _ManifestEntry>> _loadManifest() async {
    try {
      final dir = await getApplicationSupportDirectory();
      final file = File(p.join(dir.path, _manifestFilename));
      if (!await file.exists()) return {};
      final json =
          jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      final files = json['files'] as Map<String, dynamic>? ?? {};
      return {
        for (final e in files.entries)
          e.key: _ManifestEntry.fromJson(e.value as Map<String, dynamic>),
      };
    } catch (_) {
      return {};
    }
  }

  Future<void> _saveManifest(Map<String, _ManifestEntry> files) async {
    final dir = await getApplicationSupportDirectory();
    final file = File(p.join(dir.path, _manifestFilename));
    await file.writeAsString(jsonEncode({
      'lastSync': DateTime.now().toUtc().toIso8601String(),
      'files': {for (final e in files.entries) e.key: e.value.toJson()},
    }));
  }
}

class _ManifestEntry {
  final String driveId;
  final DateTime mtime;

  const _ManifestEntry({required this.driveId, required this.mtime});

  Map<String, dynamic> toJson() => {
        'driveId': driveId,
        'mtime': mtime.toIso8601String(),
      };

  factory _ManifestEntry.fromJson(Map<String, dynamic> j) => _ManifestEntry(
        driveId: j['driveId'] as String,
        mtime: DateTime.parse(j['mtime'] as String),
      );
}

enum _OpType { upload, download, deleteLocal, deleteRemote }

class _Op {
  final _OpType type;
  final String path;
  final File? localFile;
  final String? localPath;
  final String? driveId;
  final String? parentFolderId;
  final DateTime? remoteMtime;

  const _Op._({
    required this.type,
    required this.path,
    this.localFile,
    this.localPath,
    this.driveId,
    this.parentFolderId,
    this.remoteMtime,
  });

  factory _Op.upload(
    String path,
    File localFile, {
    String? driveId,
    String? parentFolderId,
  }) =>
      _Op._(
        type: _OpType.upload,
        path: path,
        localFile: localFile,
        driveId: driveId,
        parentFolderId: parentFolderId,
      );

  factory _Op.download(
    String path,
    String driveId,
    String localPath,
    DateTime remoteMtime,
  ) =>
      _Op._(
        type: _OpType.download,
        path: path,
        driveId: driveId,
        localPath: localPath,
        remoteMtime: remoteMtime,
      );

  factory _Op.deleteLocal(String path, File localFile) =>
      _Op._(type: _OpType.deleteLocal, path: path, localFile: localFile);

  factory _Op.deleteRemote(String path, String driveId) =>
      _Op._(type: _OpType.deleteRemote, path: path, driveId: driveId);
}
