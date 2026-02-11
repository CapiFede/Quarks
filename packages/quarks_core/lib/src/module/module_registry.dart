import 'quark_module.dart';

class ModuleRegistry {
  final Map<String, QuarkModule> _modules = {};

  List<QuarkModule> get modules => List.unmodifiable(_modules.values);

  void register(QuarkModule module) {
    _modules[module.id] = module;
  }

  void unregister(String moduleId) {
    _modules.remove(moduleId)?.dispose();
  }

  QuarkModule? getById(String moduleId) => _modules[moduleId];

  Future<void> initializeAll() async {
    for (final module in _modules.values) {
      await module.initialize();
    }
  }

  void disposeAll() {
    for (final module in _modules.values) {
      module.dispose();
    }
    _modules.clear();
  }
}
