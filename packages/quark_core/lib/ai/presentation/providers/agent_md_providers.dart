import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/services/agent_md_service.dart';

final agentMdServiceProvider =
    Provider<AgentMdService>((ref) => AgentMdService());

// ── General agent.md ──────────────────────────────────────────────────────────

final generalAgentMdProvider =
    AsyncNotifierProvider<GeneralAgentMdNotifier, String>(
  GeneralAgentMdNotifier.new,
);

class GeneralAgentMdNotifier extends AsyncNotifier<String> {
  @override
  Future<String> build() {
    return ref.read(agentMdServiceProvider).read('general.md');
  }

  Future<void> save(String md) async {
    await ref.read(agentMdServiceProvider).write('general.md', md);
    state = AsyncData(md);
  }
}

// ── Per-quark agent.md ────────────────────────────────────────────────────────

final quarkAgentMdProvider =
    AsyncNotifierProvider.family<QuarkAgentMdNotifier, String, String>(
  QuarkAgentMdNotifier.new,
);

class QuarkAgentMdNotifier extends FamilyAsyncNotifier<String, String> {
  @override
  Future<String> build(String quarkId) {
    return ref.read(agentMdServiceProvider).read('$quarkId.md');
  }

  Future<void> save(String md) async {
    await ref.read(agentMdServiceProvider).write('$arg.md', md);
    state = AsyncData(md);
  }
}
