import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../theme/quarks_color_extension.dart';
import '../../../domain/llm_model.dart';
import '../../providers/llm_providers.dart';

const Map<String, String> _kProviderLabels = {
  'anthropic': 'Claude',
  'google': 'Google',
  'ollama': 'Local',
};

String _providerLabel(String id) => _kProviderLabels[id] ?? id;

/// Compact pill that picks the active LLM provider. Hidden when no provider
/// is configured.
class ProviderSelector extends ConsumerWidget {
  const ProviderSelector({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final providers = ref.watch(llmProviderRegistryProvider).providers;
    final activeId = ref.watch(activeProviderIdProvider);

    if (providers.isEmpty) {
      return Text(
        'Sin IA',
        style: TextStyle(fontSize: 10, color: colors.textSecondary),
      );
    }

    return PopupMenuButton<String>(
      tooltip: 'Provider',
      initialValue: activeId,
      elevation: 0,
      color: colors.surface,
      shape: Border.all(color: colors.borderDark, width: 1),
      onSelected: (id) =>
          ref.read(activeProviderIdProvider.notifier).select(id),
      itemBuilder: (ctx) => [
        for (final p in providers)
          PopupMenuItem<String>(
            value: p.providerId,
            height: 28,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (p.providerId == activeId)
                  Icon(Icons.check, size: 10, color: colors.primary)
                else
                  const SizedBox(width: 10),
                const SizedBox(width: 4),
                Text(
                  _providerLabel(p.providerId),
                  style:
                      TextStyle(fontSize: 11, color: colors.textPrimary),
                ),
              ],
            ),
          ),
      ],
      child: _PillButton(
        label: activeId != null ? _providerLabel(activeId) : 'Provider',
        colors: colors,
      ),
    );
  }
}

/// Compact pill that picks a model within the active provider. Hidden when
/// the active provider exposes a single forced model (e.g. Ollama uses
/// whatever model is loaded locally).
class ModelSelector extends ConsumerWidget {
  const ModelSelector({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final providerId = ref.watch(activeProviderIdProvider);
    final models = ref.watch(modelsForActiveProviderProvider);
    final active = ref.watch(activeModelProvider);

    // Ollama is "Local" and resolves the actual model at request time —
    // no point in showing a single-item dropdown.
    if (providerId == 'ollama' || models.length <= 1) {
      return const SizedBox.shrink();
    }

    return PopupMenuButton<LlmModel>(
      tooltip: 'Modelo',
      initialValue: active,
      elevation: 0,
      color: colors.surface,
      shape: Border.all(color: colors.borderDark, width: 1),
      onSelected: (m) => ref.read(activeModelProvider.notifier).select(m),
      itemBuilder: (ctx) => [
        for (final m in models)
          PopupMenuItem<LlmModel>(
            value: m,
            height: 28,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (m == active)
                  Icon(Icons.check, size: 10, color: colors.primary)
                else
                  const SizedBox(width: 10),
                const SizedBox(width: 4),
                Text(
                  m.displayName,
                  style:
                      TextStyle(fontSize: 11, color: colors.textPrimary),
                ),
              ],
            ),
          ),
      ],
      child: _PillButton(
        label: active?.displayName ?? 'Modelo',
        colors: colors,
      ),
    );
  }
}

class _PillButton extends StatelessWidget {
  final String label;
  final QuarksColorExtension colors;

  const _PillButton({required this.label, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        border: Border.all(color: colors.borderLight, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 140),
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
              style: TextStyle(fontSize: 10, color: colors.textPrimary),
            ),
          ),
          Icon(Icons.arrow_drop_down, size: 12, color: colors.textPrimary),
        ],
      ),
    );
  }
}
