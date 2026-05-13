import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

class AgentMdSection extends ConsumerStatefulWidget {
  const AgentMdSection({
    super.key,
    required this.fileName,
    required this.title,
    this.icon,
  });

  final String fileName;
  final String title;
  final IconData? icon;

  @override
  ConsumerState<AgentMdSection> createState() => _AgentMdSectionState();
}

class _AgentMdSectionState extends ConsumerState<AgentMdSection> {
  late TextEditingController _controller;
  bool _dirty = false;

  bool get _isGeneral => widget.fileName == 'general.md';
  String get _quarkId => widget.fileName.replaceAll('.md', '');

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onLoaded(String value) {
    if (_controller.text != value) {
      _controller.text = value;
      _dirty = false;
    }
  }

  Future<void> _save() async {
    if (_isGeneral) {
      await ref.read(generalAgentMdProvider.notifier).save(_controller.text);
    } else {
      await ref.read(quarkAgentMdProvider(_quarkId).notifier).save(_controller.text);
    }
    if (mounted) setState(() => _dirty = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;

    final AsyncValue<String> asyncValue = _isGeneral
        ? ref.watch(generalAgentMdProvider)
        : ref.watch(quarkAgentMdProvider(_quarkId));

    asyncValue.whenData(_onLoaded);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (widget.icon != null) ...[
                  Icon(widget.icon, size: 16, color: colors.textPrimary),
                  const SizedBox(width: 8),
                ],
                Text(
                  widget.title,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        color: colors.textPrimary,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _controller,
              minLines: 6,
              maxLines: null,
              onChanged: (_) => setState(() => _dirty = true),
              style: const TextStyle(fontSize: 13),
              decoration: InputDecoration(
                hintText: 'Instrucciones para el asistente…',
                hintStyle: TextStyle(
                  color: colors.textSecondary.withValues(alpha: 0.6),
                ),
                border: const OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: _dirty ? _save : null,
                child: const Text('Guardar'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
