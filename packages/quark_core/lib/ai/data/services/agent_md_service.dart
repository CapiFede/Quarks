import 'dart:io';

import 'package:path/path.dart' as p;

class AgentMdService {
  static const _dirName = 'agents';

  Future<Directory> _agentsDir() async {
    final root = File(Platform.resolvedExecutable).parent;
    final dir = Directory(p.join(root.path, _dirName));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  Future<String> read(String fileName) async {
    final dir = await _agentsDir();
    final file = File(p.join(dir.path, fileName));
    if (!await file.exists()) return '';
    return file.readAsString();
  }

  Future<void> write(String fileName, String content) async {
    final dir = await _agentsDir();
    final file = File(p.join(dir.path, fileName));
    final tmp = File('${file.path}.tmp');
    await tmp.writeAsString(content);
    if (await file.exists()) await file.delete();
    await tmp.rename(file.path);
  }

  Future<void> delete(String fileName) async {
    final dir = await _agentsDir();
    final file = File(p.join(dir.path, fileName));
    if (await file.exists()) await file.delete();
  }
}
