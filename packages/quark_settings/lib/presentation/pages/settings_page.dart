import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../widgets/agent_md_section.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final registry = ref.watch(quarkRegistryProvider);
    final quarks = registry.quarks.where((q) => q.id != 'quark_settings').toList();

    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 16),
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Text(
            'General',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: context.quarksColors.textSecondary,
                  letterSpacing: 1.2,
                ),
          ),
        ),
        const AgentMdSection(
          fileName: 'general.md',
          title: 'Instrucciones generales',
          icon: Icons.public_outlined,
        ),
        const SizedBox(height: 16),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Text(
            'Por Quark',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: context.quarksColors.textSecondary,
                  letterSpacing: 1.2,
                ),
          ),
        ),
        for (final q in quarks)
          AgentMdSection(
            fileName: '${q.id}.md',
            title: q.name,
            icon: q.icon,
          ),
      ],
    );
  }
}
