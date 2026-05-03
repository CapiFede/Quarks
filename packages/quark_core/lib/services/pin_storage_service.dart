import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Persists the set of pinned setting/dynamic items per Quark to disk.
///
/// File layout (single JSON):
/// ```json
/// {
///   "quark_music": {
///     "settings": ["rescan", "open_folder"],
///     "dynamic":  ["playlist_xyz"]
///   }
/// }
/// ```
class PinStorageService {
  static const _fileName = 'quarks_pins.json';

  Future<File> _file() async {
    final Directory root;
    if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
      root = File(Platform.resolvedExecutable).parent;
    } else {
      root = await getApplicationDocumentsDirectory();
    }
    return File(p.join(root.path, _fileName));
  }

  Future<Map<String, PinSet>> load() async {
    final file = await _file();
    if (!await file.exists()) return {};
    try {
      final json = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      return json.map((quarkId, raw) {
        final data = raw as Map<String, dynamic>;
        return MapEntry(
          quarkId,
          PinSet(
            settings: (data['settings'] as List?)?.cast<String>().toSet() ?? {},
            dynamicItems:
                (data['dynamic'] as List?)?.cast<String>().toSet() ?? {},
          ),
        );
      });
    } catch (_) {
      return {};
    }
  }

  Future<void> save(Map<String, PinSet> pins) async {
    final file = await _file();
    final json = pins.map((quarkId, set) => MapEntry(quarkId, {
          'settings': set.settings.toList(),
          'dynamic': set.dynamicItems.toList(),
        }));
    await file.writeAsString(jsonEncode(json));
  }
}

class PinSet {
  final Set<String> settings;
  final Set<String> dynamicItems;

  const PinSet({this.settings = const {}, this.dynamicItems = const {}});

  PinSet copyWith({Set<String>? settings, Set<String>? dynamicItems}) =>
      PinSet(
        settings: settings ?? this.settings,
        dynamicItems: dynamicItems ?? this.dynamicItems,
      );

  bool get isEmpty => settings.isEmpty && dynamicItems.isEmpty;
}
