import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/event.dart';
import '../providers/calendar_providers.dart';

class DayCell extends ConsumerStatefulWidget {
  final DateTime date;
  final bool inMonth;

  const DayCell({super.key, required this.date, required this.inMonth});

  @override
  ConsumerState<DayCell> createState() => _DayCellState();
}

class _DayCellState extends ConsumerState<DayCell> {
  bool _hovering = false;

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  String _formatHour(DateTime d) {
    final hh = d.hour.toString().padLeft(2, '0');
    final mm = d.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final today = DateTime.now();
    final selected = ref.watch(selectedDateProvider);
    final events = ref.watch(eventsForDateProvider(widget.date));

    final isToday = _sameDay(widget.date, today);
    final isSelected = selected != null && _sameDay(widget.date, selected);

    final Color background;
    final Color borderColor;
    final double borderWidth;

    if (isSelected) {
      background = colors.primary.withValues(alpha: 0.12);
      borderColor = colors.primary;
      borderWidth = 2;
    } else if (isToday) {
      background = colors.primary.withValues(alpha: 0.08);
      borderColor = colors.primary.withValues(alpha: 0.6);
      borderWidth = 2;
    } else if (_hovering) {
      background = colors.cardHover;
      borderColor = colors.border;
      borderWidth = 1;
    } else {
      background = Colors.transparent;
      borderColor = colors.border.withValues(alpha: 0.5);
      borderWidth = 1;
    }

    final dayNumColor = !widget.inMonth
        ? colors.textLight.withValues(alpha: 0.5)
        : isToday
            ? colors.primaryDark
            : colors.textPrimary;

    return GestureDetector(
      onTap: () {
        ref.read(selectedDateProvider.notifier).state = widget.date;
        ref.read(selectedEventIdProvider.notifier).state = null;
      },
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hovering = true),
        onExit: (_) => setState(() => _hovering = false),
        child: Container(
          decoration: BoxDecoration(
            color: background,
            border: Border.all(color: borderColor, width: borderWidth),
          ),
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.only(left: 2, bottom: 2),
                child: Row(
                  children: [
                    if (isToday)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: colors.primary,
                        ),
                        child: Text(
                          '${widget.date.day}',
                          style: textTheme.bodyMedium?.copyWith(
                            color: colors.surface,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      )
                    else
                      Text(
                        '${widget.date.day}',
                        style: textTheme.bodyMedium
                            ?.copyWith(color: dayNumColor),
                      ),
                  ],
                ),
              ),
              if (events.isNotEmpty && widget.inMonth)
                Expanded(
                  child: _EventRows(
                    events: events,
                    colors: colors,
                    textTheme: textTheme,
                    formatHour: _formatHour,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EventRows extends StatelessWidget {
  final List<Event> events;
  final QuarksColorExtension colors;
  final TextTheme textTheme;
  final String Function(DateTime) formatHour;

  const _EventRows({
    required this.events,
    required this.colors,
    required this.textTheme,
    required this.formatHour,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const rowHeight = 16.0;
        const spacing = 2.0;
        final maxRows =
            ((constraints.maxHeight + spacing) / (rowHeight + spacing))
                .floor();
        if (maxRows <= 0) return const SizedBox.shrink();

        final hasOverflow = events.length > maxRows;
        final visibleCount = hasOverflow ? maxRows - 1 : events.length;
        final visible = events.take(visibleCount).toList();
        final extra = events.length - visibleCount;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (int i = 0; i < visible.length; i++) ...[
              if (i > 0) const SizedBox(height: spacing),
              _EventRow(
                event: visible[i],
                colors: colors,
                textTheme: textTheme,
                formatHour: formatHour,
                height: rowHeight,
              ),
            ],
            if (hasOverflow) ...[
              const SizedBox(height: spacing),
              SizedBox(
                height: rowHeight,
                child: Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: Text(
                    '+$extra más',
                    style: textTheme.bodySmall?.copyWith(
                      color: colors.textLight,
                      fontSize: 10,
                    ),
                  ),
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _EventRow extends StatelessWidget {
  final Event event;
  final QuarksColorExtension colors;
  final TextTheme textTheme;
  final String Function(DateTime) formatHour;
  final double height;

  const _EventRow({
    required this.event,
    required this.colors,
    required this.textTheme,
    required this.formatHour,
    required this.height,
  });

  @override
  Widget build(BuildContext context) {
    final color = Color(event.colorValue);
    final name = event.name.trim().isEmpty ? 'Sin título' : event.name;
    return Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        color: color,
        border: Border.all(
          color: Color.lerp(color, Colors.black, 0.15)!,
          width: 1,
        ),
      ),
      alignment: Alignment.centerLeft,
      child: Row(
        children: [
          Text(
            formatHour(event.eventDate),
            style: textTheme.bodySmall?.copyWith(
              color: colors.textPrimary,
              fontSize: 9,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: textTheme.bodySmall?.copyWith(
                color: colors.textPrimary,
                fontSize: 9,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
