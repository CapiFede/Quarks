import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/event.dart';
import '../providers/calendar_providers.dart';

class EventDetailView extends ConsumerStatefulWidget {
  final Event event;

  const EventDetailView({super.key, required this.event});

  @override
  ConsumerState<EventDetailView> createState() => _EventDetailViewState();
}

class _EventDetailViewState extends ConsumerState<EventDetailView> {
  late TextEditingController _nameCtrl;
  late TextEditingController _notesCtrl;
  late DateTime _eventDate;
  late int _colorValue;
  DateTime? _reminderDate;
  String _lastEventId = '';

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController();
    _notesCtrl = TextEditingController();
    _hydrate(widget.event);
  }

  @override
  void didUpdateWidget(covariant EventDetailView old) {
    super.didUpdateWidget(old);
    if (widget.event.id != _lastEventId) {
      _hydrate(widget.event);
    }
  }

  void _hydrate(Event e) {
    _lastEventId = e.id;
    _nameCtrl.text = e.name;
    _notesCtrl.text = e.notes;
    _eventDate = e.eventDate;
    _colorValue = e.colorValue;
    _reminderDate = e.reminderDate;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickEventDateTime() async {
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: _eventDate,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (pickedDate == null) return;
    if (!mounted) return;
    final pickedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_eventDate),
    );
    if (pickedTime == null) return;
    setState(() {
      _eventDate = DateTime(
        pickedDate.year,
        pickedDate.month,
        pickedDate.day,
        pickedTime.hour,
        pickedTime.minute,
      );
    });
  }

  Future<void> _pickReminderDateTime() async {
    final base = _reminderDate ?? _eventDate.subtract(const Duration(hours: 2));
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: base,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (pickedDate == null) return;
    if (!mounted) return;
    final pickedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(base),
    );
    if (pickedTime == null) return;
    setState(() {
      _reminderDate = DateTime(
        pickedDate.year,
        pickedDate.month,
        pickedDate.day,
        pickedTime.hour,
        pickedTime.minute,
      );
    });
  }

  Future<void> _save() async {
    final updated = widget.event.copyWith(
      name: _nameCtrl.text.trim(),
      notes: _notesCtrl.text,
      eventDate: _eventDate,
      reminderDate: _reminderDate,
      colorValue: _colorValue,
    );
    await ref.read(eventsProvider.notifier).saveEvent(updated);
    if (!mounted) return;
    ref.read(selectedEventIdProvider.notifier).state = null;
  }

  Future<void> _delete() async {
    await ref.read(eventsProvider.notifier).deleteEvent(widget.event.id);
    if (!mounted) return;
    ref.read(selectedEventIdProvider.notifier).state = null;
  }

  void _back() {
    ref.read(selectedEventIdProvider.notifier).state = null;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
          child: Row(
            children: [
              _IconButton(
                icon: Icons.arrow_back,
                color: colors.textSecondary,
                onTap: _back,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Evento',
                  style: textTheme.titleMedium
                      ?.copyWith(color: colors.textPrimary),
                ),
              ),
              _IconButton(
                icon: Icons.delete_outline,
                color: colors.error,
                onTap: _delete,
              ),
            ],
          ),
        ),
        Container(height: 1, color: colors.border),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Label(text: 'Nombre', colors: colors, textTheme: textTheme),
                const SizedBox(height: 4),
                _Field(
                  controller: _nameCtrl,
                  hint: 'Nombre del evento',
                  colors: colors,
                  textTheme: textTheme,
                ),
                const SizedBox(height: 16),
                _Label(text: 'Fecha y hora', colors: colors, textTheme: textTheme),
                const SizedBox(height: 4),
                _DateRow(
                  date: _eventDate,
                  colors: colors,
                  textTheme: textTheme,
                  onTap: _pickEventDateTime,
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    _Label(
                        text: 'Recordatorio',
                        colors: colors,
                        textTheme: textTheme),
                    const Spacer(),
                    Switch(
                      value: _reminderDate != null,
                      activeThumbColor: colors.primary,
                      onChanged: (v) {
                        setState(() {
                          if (v) {
                            _reminderDate = _eventDate
                                .subtract(const Duration(hours: 2));
                          } else {
                            _reminderDate = null;
                          }
                        });
                      },
                    ),
                  ],
                ),
                if (_reminderDate != null) ...[
                  const SizedBox(height: 4),
                  _DateRow(
                    date: _reminderDate!,
                    colors: colors,
                    textTheme: textTheme,
                    onTap: _pickReminderDateTime,
                  ),
                ],
                const SizedBox(height: 16),
                _Label(text: 'Notas', colors: colors, textTheme: textTheme),
                const SizedBox(height: 4),
                _Field(
                  controller: _notesCtrl,
                  hint: 'Notas...',
                  colors: colors,
                  textTheme: textTheme,
                  maxLines: 4,
                ),
                const SizedBox(height: 16),
                _Label(text: 'Color', colors: colors, textTheme: textTheme),
                const SizedBox(height: 6),
                QuarkColorPicker(
                  selectedColorValue: _colorValue,
                  onColorSelected: (v) => setState(() => _colorValue = v),
                ),
              ],
            ),
          ),
        ),
        Container(height: 1, color: colors.border),
        Padding(
          padding: const EdgeInsets.all(12),
          child: GestureDetector(
            onTap: _save,
            child: PixelBorder(
              backgroundColor: colors.primary,
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Center(
                child: Text(
                  'Guardar',
                  style: textTheme.bodyMedium
                      ?.copyWith(color: colors.surface),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  final QuarksColorExtension colors;
  final TextTheme textTheme;
  const _Label(
      {required this.text, required this.colors, required this.textTheme});
  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: textTheme.labelMedium?.copyWith(
        color: colors.textSecondary,
        letterSpacing: 1.2,
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final int maxLines;
  final QuarksColorExtension colors;
  final TextTheme textTheme;

  const _Field({
    required this.controller,
    required this.hint,
    required this.colors,
    required this.textTheme,
    this.maxLines = 1,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      style: textTheme.bodyMedium?.copyWith(color: colors.textPrimary),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: textTheme.bodyMedium?.copyWith(color: colors.textLight),
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: colors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: colors.primary),
        ),
      ),
    );
  }
}

const _monthNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

class _DateRow extends StatelessWidget {
  final DateTime date;
  final QuarksColorExtension colors;
  final TextTheme textTheme;
  final VoidCallback onTap;

  const _DateRow({
    required this.date,
    required this.colors,
    required this.textTheme,
    required this.onTap,
  });

  String _format(DateTime d) {
    final hh = d.hour.toString().padLeft(2, '0');
    final mm = d.minute.toString().padLeft(2, '0');
    return '${_monthNames[d.month - 1]} ${d.day}, ${d.year}  ·  $hh:$mm';
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            border: Border.all(color: colors.border, width: 1),
          ),
          child: Row(
            children: [
              Icon(Icons.event, size: 14, color: colors.textSecondary),
              const SizedBox(width: 8),
              Text(
                _format(date),
                style: textTheme.bodyMedium
                    ?.copyWith(color: colors.textPrimary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _IconButton extends StatefulWidget {
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _IconButton({
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  State<_IconButton> createState() => _IconButtonState();
}

class _IconButtonState extends State<_IconButton> {
  bool _hovering = false;
  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Icon(
            widget.icon,
            size: 16,
            color: widget.color.withValues(alpha: _hovering ? 1.0 : 0.7),
          ),
        ),
      ),
    );
  }
}
