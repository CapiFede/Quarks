import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../theme/quarks_color_extension.dart';
import '../../../domain/provider_config.dart';
import '../../providers/secret_providers.dart';

Future<void> showAiSettingsDialog(BuildContext context) {
  return showDialog(
    context: context,
    builder: (ctx) => const _AiSettingsDialog(),
  );
}

class _AiSettingsDialog extends ConsumerStatefulWidget {
  const _AiSettingsDialog();

  @override
  ConsumerState<_AiSettingsDialog> createState() => _AiSettingsDialogState();
}

class _AiSettingsDialogState extends ConsumerState<_AiSettingsDialog> {
  int _activeTab = 0;

  static const _tabs = [
    _TabSpec(id: 'anthropic', label: 'Claude'),
    _TabSpec(id: 'google', label: 'Google'),
    _TabSpec(id: 'ollama', label: 'Local'),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final tab = _tabs[_activeTab];

    return Dialog(
      backgroundColor: colors.surface,
      shape: Border.all(color: colors.borderDark, width: 2),
      child: SizedBox(
        width: 520,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: colors.primary,
                border: Border(
                  bottom: BorderSide(color: colors.borderDark, width: 1),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Settings IA',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: colors.textPrimary,
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child:
                        Icon(Icons.close, size: 16, color: colors.textPrimary),
                  ),
                ],
              ),
            ),
            Container(
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: colors.borderLight, width: 1),
                ),
              ),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (var i = 0; i < _tabs.length; i++)
                      _TabBtn(
                        label: _tabs[i].label,
                        active: i == _activeTab,
                        onTap: () => setState(() => _activeTab = i),
                      ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: switch (tab.id) {
                'anthropic' => const _AnthropicSection(),
                'ollama' => const _OllamaSection(),
                _ => _ApiKeySection(providerId: tab.id),
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _TabSpec {
  final String id;
  final String label;

  const _TabSpec({required this.id, required this.label});
}

class _TabBtn extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _TabBtn({
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: active ? colors.surfaceAlt : Colors.transparent,
          border: Border(
            bottom: BorderSide(
              color: active ? colors.primary : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: active ? FontWeight.w600 : FontWeight.normal,
            color: colors.textPrimary,
          ),
        ),
      ),
    );
  }
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

class _AnthropicSection extends ConsumerStatefulWidget {
  const _AnthropicSection();

  @override
  ConsumerState<_AnthropicSection> createState() => _AnthropicSectionState();
}

class _AnthropicSectionState extends ConsumerState<_AnthropicSection> {
  late final TextEditingController _apiKeyCtrl;
  bool _obscure = true;
  bool _busy = false;
  // null = derive from stored config; true = user picked OAuth; false = API key
  bool? _oauthPicked;

  @override
  void initState() {
    super.initState();
    _apiKeyCtrl = TextEditingController(text: _storedApiKey());
  }

  @override
  void dispose() {
    _apiKeyCtrl.dispose();
    super.dispose();
  }

  String? _storedApiKey() {
    final c = ref.read(providerConfigsProvider).valueOrNull?['anthropic'];
    return c?.apiKey;
  }

  bool _isOauthMode(ProviderConfig? config) {
    if (_oauthPicked != null) return _oauthPicked!;
    if (config == null) return false;
    return config.authMode == ProviderAuthMode.oauth;
  }

  Future<void> _connect() async {
    setState(() => _busy = true);
    try {
      final service = ref.read(claudeOauthServiceProvider);
      final tokens = await service.connect();
      await ref.read(providerConfigsProvider.notifier).setOauth(
            'anthropic',
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
            accountLabel: tokens.accountLabel,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Conectado a Claude'),
            duration: Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _disconnect() async {
    await ref
        .read(providerConfigsProvider.notifier)
        .clearProvider('anthropic');
    setState(() => _oauthPicked = null);
    _apiKeyCtrl.clear();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Desconectado'),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _saveApiKey() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(providerConfigsProvider.notifier)
          .setApiKey('anthropic', _apiKeyCtrl.text.trim());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Guardado'),
            duration: Duration(seconds: 2),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final ProviderConfig? config =
        ref.watch(providerConfigsProvider).valueOrNull?['anthropic'];
    final useOauth = _isOauthMode(config);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Auth mode radio
        _RadioRow(
          label: 'Claude OAuth (suscripción)',
          selected: useOauth,
          onTap: () => setState(() => _oauthPicked = true),
          colors: colors,
        ),
        const SizedBox(height: 6),
        _RadioRow(
          label: 'API key',
          selected: !useOauth,
          onTap: () => setState(() => _oauthPicked = false),
          colors: colors,
        ),
        const SizedBox(height: 12),
        if (useOauth) ..._buildOauthBody(colors, config),
        if (!useOauth) ..._buildApiKeyBody(colors),
      ],
    );
  }

  List<Widget> _buildOauthBody(QuarksColorExtension colors, ProviderConfig? config) {
    final email = config?.oauthAccountLabel;
    final connected = config?.oauthAccessToken != null;

    return [
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: colors.surfaceAlt,
          border: Border.all(color: colors.borderLight),
        ),
        child: Text(
          '⚠ Esto usa un trick no oficial. Anthropic puede cambiar su comportamiento o banear la cuenta. Usarlo bajo propio riesgo.',
          style: TextStyle(fontSize: 11, color: colors.textSecondary),
        ),
      ),
      const SizedBox(height: 10),
      if (connected && email != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            'Conectado como $email',
            style: TextStyle(fontSize: 12, color: colors.textPrimary),
          ),
        ),
      Row(
        children: [
          if (!connected)
            TextButton(
              onPressed: _busy ? null : _connect,
              child: Text(_busy ? 'Conectando…' : 'Conectar'),
            ),
          if (connected)
            TextButton(
              onPressed: _busy ? null : _disconnect,
              child: const Text('Desconectar'),
            ),
        ],
      ),
    ];
  }

  List<Widget> _buildApiKeyBody(QuarksColorExtension colors) {
    return [
      Text(
        'API key',
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: colors.textPrimary,
        ),
      ),
      const SizedBox(height: 8),
      _MaskedTextField(
        controller: _apiKeyCtrl,
        obscure: _obscure,
        enabled: !_busy,
        hint: 'sk-ant-...',
        onToggleObscure: () => setState(() => _obscure = !_obscure),
        colors: colors,
      ),
      const SizedBox(height: 12),
      Row(
        children: [
          TextButton(
            onPressed: _busy ? null : _saveApiKey,
            child: Text(_busy ? 'Guardando…' : 'Guardar'),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: _disconnect,
            child: const Text('Borrar'),
          ),
        ],
      ),
    ];
  }
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

class _OllamaSection extends ConsumerStatefulWidget {
  const _OllamaSection();

  @override
  ConsumerState<_OllamaSection> createState() => _OllamaSectionState();
}

class _OllamaSectionState extends ConsumerState<_OllamaSection> {
  late final TextEditingController _urlCtrl;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final stored = ref
            .read(providerConfigsProvider)
            .valueOrNull?['ollama']
            ?.baseUrl ??
        '';
    _urlCtrl = TextEditingController(text: stored);
  }

  @override
  void dispose() {
    _urlCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(providerConfigsProvider.notifier)
          .setBaseUrl('ollama', _urlCtrl.text.trim());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Guardado'),
            duration: Duration(seconds: 2),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Base URL',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: colors.textPrimary,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Dejá vacío para usar el default: http://localhost:11434/v1',
          style: TextStyle(fontSize: 11, color: colors.textSecondary),
        ),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: colors.surfaceAlt,
            border: Border.all(color: colors.borderLight, width: 1),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: TextField(
            controller: _urlCtrl,
            enabled: !_busy,
            style: TextStyle(fontSize: 13, color: colors.textPrimary),
            decoration: InputDecoration.collapsed(
              hintText: 'http://localhost:11434/v1',
              hintStyle:
                  TextStyle(fontSize: 13, color: colors.textLight),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Los modelos en el selector son los más comunes. '
          'Si tenés otros instalados, seleccioná cualquiera y Ollama usará el que hayas configurado.',
          style: TextStyle(fontSize: 11, color: colors.textSecondary),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            TextButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Guardando…' : 'Guardar'),
            ),
          ],
        ),
      ],
    );
  }
}

// ─── Generic API key (Gemini) ─────────────────────────────────────────────────

class _ApiKeySection extends ConsumerStatefulWidget {
  final String providerId;

  const _ApiKeySection({required this.providerId});

  @override
  ConsumerState<_ApiKeySection> createState() => _ApiKeySectionState();
}

class _ApiKeySectionState extends ConsumerState<_ApiKeySection> {
  late final TextEditingController _controller;
  bool _obscure = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: _initialApiKey());
  }

  @override
  void didUpdateWidget(covariant _ApiKeySection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.providerId != widget.providerId) {
      _controller.text = _initialApiKey();
    }
  }

  String _initialApiKey() {
    final configs =
        ref.read(providerConfigsProvider).valueOrNull?[widget.providerId];
    return configs?.apiKey ?? '';
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ref
          .read(providerConfigsProvider.notifier)
          .setApiKey(widget.providerId, _controller.text.trim());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Guardado'),
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _clear() async {
    await ref
        .read(providerConfigsProvider.notifier)
        .clearProvider(widget.providerId);
    _controller.clear();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Borrado'),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'API key',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: colors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        _MaskedTextField(
          controller: _controller,
          obscure: _obscure,
          enabled: !_saving,
          hint: 'sk-...',
          onToggleObscure: () => setState(() => _obscure = !_obscure),
          colors: colors,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            TextButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Guardando…' : 'Guardar'),
            ),
            const SizedBox(width: 8),
            TextButton(
              onPressed: _clear,
              child: const Text('Borrar'),
            ),
          ],
        ),
      ],
    );
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

class _RadioRow extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final QuarksColorExtension colors;

  const _RadioRow({
    required this.label,
    required this.selected,
    required this.onTap,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 14,
            height: 14,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: selected ? colors.primary : colors.textSecondary,
                width: 1.5,
              ),
              color: selected ? colors.primary : Colors.transparent,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: TextStyle(fontSize: 12, color: colors.textPrimary),
          ),
        ],
      ),
    );
  }
}

class _MaskedTextField extends StatelessWidget {
  final TextEditingController controller;
  final bool obscure;
  final bool enabled;
  final String hint;
  final VoidCallback onToggleObscure;
  final QuarksColorExtension colors;

  const _MaskedTextField({
    required this.controller,
    required this.obscure,
    required this.enabled,
    required this.hint,
    required this.onToggleObscure,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        border: Border.all(color: colors.borderLight, width: 1),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              obscureText: obscure,
              enabled: enabled,
              style: TextStyle(fontSize: 13, color: colors.textPrimary),
              decoration: InputDecoration.collapsed(
                hintText: hint,
                hintStyle: TextStyle(fontSize: 13, color: colors.textLight),
              ),
            ),
          ),
          IconButton(
            icon: Icon(
              obscure ? Icons.visibility : Icons.visibility_off,
              size: 14,
              color: colors.textSecondary,
            ),
            onPressed: onToggleObscure,
          ),
        ],
      ),
    );
  }
}
