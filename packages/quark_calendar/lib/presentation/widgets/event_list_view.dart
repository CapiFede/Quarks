import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/calendar_providers.dart';
import 'event_tile.dart';

const _monthNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

class EventListView extends ConsumerWidget {
  final DateTime date;

  const EventListView({super.key, required this.date});

  bool _isToday(DateTime d) {
    final t = DateTime.now();
    return d.year == t.year && d.month == t.month && d.day == t.day;
  }

  String _formatDate(DateTime d) {
    if (_isToday(d)) return 'Hoy';
    return '${_monthNames[d.month - 1]} ${d.day}, ${d.year}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final events = ref.watch(eventsForDateProvider(date));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
          child: Row(
            children: [
              Icon(Icons.calendar_today_outlined,
                  size: 16, color: colors.textSecondary),
              const SizedBox(width: 8),
              Text(
                _formatDate(date),
                style: textTheme.titleMedium
                    ?.copyWith(color: colors.textPrimary),
              ),
            ],
          ),
        ),
        Container(height: 1, color: colors.border),
        Expanded(
          child: events.isEmpty
              ? _EmptyState(date: date)
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: events.length,
                  itemBuilder: (_, i) => EventTile(event: events[i]),
                ),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: _AddEventButton(date: date),
        ),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  final DateTime date;

  const _EmptyState({required this.date});

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.event_busy_outlined, size: 32, color: colors.textLight),
          const SizedBox(height: 8),
          Text(
            'Sin eventos',
            style:
                textTheme.bodyMedium?.copyWith(color: colors.textLight),
          ),
        ],
      ),
    );
  }
}

class _AddEventButton extends ConsumerStatefulWidget {
  final DateTime date;

  const _AddEventButton({required this.date});

  @override
  ConsumerState<_AddEventButton> createState() => _AddEventButtonState();
}

class _AddEventButtonState extends ConsumerState<_AddEventButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    return GestureDetector(
      onTap: () async {
        final event = await ref
            .read(eventsProvider.notifier)
            .createEvent(on: widget.date);
        ref.read(selectedEventIdProvider.notifier).state = event.id;
      },
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: _hovering ? colors.cardHover : colors.surface,
            border: Border.all(color: colors.border, width: 1),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.add, size: 14, color: colors.textSecondary),
              const SizedBox(width: 6),
              Text(
                'Nuevo evento',
                style: textTheme.bodySmall
                    ?.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
