import 'package:quark_core/quark_core.dart';

class QuarkRegistry {
  final Map<String, Quark> _quarks = {};

  List<Quark> get quarks => List.unmodifiable(_quarks.values);

  void register(Quark quark) {
    _quarks[quark.id] = quark;
  }

  void unregister(String quarkId) {
    _quarks.remove(quarkId)?.dispose();
  }

  Quark? getById(String quarkId) => _quarks[quarkId];

  Future<void> initializeAll() async {
    for (final quark in _quarks.values) {
      await quark.initialize();
    }
  }

  void disposeAll() {
    for (final quark in _quarks.values) {
      quark.dispose();
    }
    _quarks.clear();
  }
}
