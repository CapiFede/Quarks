import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/calendar_providers.dart';
import 'day_cell.dart';

const _monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const _weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

class MonthGridView extends ConsumerWidget {
  const MonthGridView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final month = ref.watch(displayedMonthProvider);

    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Header(month: month, textTheme: textTheme, colors: colors),
          const SizedBox(height: 12),
          _WeekdayRow(textTheme: textTheme, colors: colors),
          const SizedBox(height: 4),
          Expanded(child: _DaysGrid(month: month)),
        ],
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  final DateTime month;
  final TextTheme textTheme;
  final QuarksColorExtension colors;

  const _Header({
    required this.month,
    required this.textTheme,
    required this.colors,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final label = '${_monthNames[month.month - 1]} ${month.year}';
    return Row(
      children: [
        Text(
          label,
          style: textTheme.titleLarge?.copyWith(color: colors.textPrimary),
        ),
        const SizedBox(width: 12),
        _IconButton(
          icon: Icons.chevron_left,
          color: colors.textSecondary,
          onTap: () => ref.read(displayedMonthProvider.notifier).state =
              DateTime(month.year, month.month - 1, 1),
        ),
        const SizedBox(width: 4),
        _TextButton(
          label: 'Today',
          colors: colors,
          textTheme: textTheme,
          onTap: () {
            final now = DateTime.now();
            ref.read(displayedMonthProvider.notifier).state =
                DateTime(now.year, now.month, 1);
            ref.read(selectedDateProvider.notifier).state = null;
            ref.read(selectedEventIdProvider.notifier).state = null;
          },
        ),
        const SizedBox(width: 4),
        _IconButton(
          icon: Icons.chevron_right,
          color: colors.textSecondary,
          onTap: () => ref.read(displayedMonthProvider.notifier).state =
              DateTime(month.year, month.month + 1, 1),
        ),
        const Spacer(),
        _NewEventButton(colors: colors, textTheme: textTheme),
      ],
    );
  }
}

class _NewEventButton extends ConsumerWidget {
  final QuarksColorExtension colors;
  final TextTheme textTheme;

  const _NewEventButton({required this.colors, required this.textTheme});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: () async {
          final event = await ref
              .read(eventsProvider.notifier)
              .createEvent(on: ref.read(effectiveSelectedDateProvider));
          ref.read(selectedEventIdProvider.notifier).state = event.id;
        },
        child: PixelBorder(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          backgroundColor: colors.primary,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.add, size: 13, color: colors.surface),
              const SizedBox(width: 4),
              Text(
                'New event',
                style:
                    textTheme.bodySmall?.copyWith(color: colors.surface),
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
            size: 18,
            color: widget.color.withValues(alpha: _hovering ? 1.0 : 0.7),
          ),
        ),
      ),
    );
  }
}

class _TextButton extends StatefulWidget {
  final String label;
  final QuarksColorExtension colors;
  final TextTheme textTheme;
  final VoidCallback onTap;

  const _TextButton({
    required this.label,
    required this.colors,
    required this.textTheme,
    required this.onTap,
  });

  @override
  State<_TextButton> createState() => _TextButtonState();
}

class _TextButtonState extends State<_TextButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            border: Border.all(
              color: _hovering
                  ? widget.colors.borderDark
                  : widget.colors.border,
              width: 1,
            ),
          ),
          child: Text(
            widget.label,
            style: widget.textTheme.bodySmall
                ?.copyWith(color: widget.colors.textSecondary),
          ),
        ),
      ),
    );
  }
}

class _WeekdayRow extends StatelessWidget {
  final TextTheme textTheme;
  final QuarksColorExtension colors;

  const _WeekdayRow({required this.textTheme, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final label in _weekdayLabels)
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 4),
              alignment: Alignment.center,
              child: Text(
                label,
                style: textTheme.bodySmall
                    ?.copyWith(color: colors.textLight, letterSpacing: 0.5),
              ),
            ),
          ),
      ],
    );
  }
}

class _DaysGrid extends ConsumerWidget {
  final DateTime month;

  const _DaysGrid({required this.month});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Sunday = weekday 7 in DateTime; we want Sunday-first columns.
    final firstDayOfMonth = DateTime(month.year, month.month, 1);
    final firstWeekday = firstDayOfMonth.weekday % 7; // 0..6 (Sun..Sat)
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    const totalCells = 42; // 6 weeks * 7

    return LayoutBuilder(
      builder: (context, constraints) {
        final cellWidth = constraints.maxWidth / 7;
        final cellHeight = constraints.maxHeight / 6;
        return Stack(
          children: [
            for (int i = 0; i < totalCells; i++)
              Positioned(
                left: (i % 7) * cellWidth,
                top: (i ~/ 7) * cellHeight,
                width: cellWidth,
                height: cellHeight,
                child: _CellAt(
                  index: i,
                  firstWeekday: firstWeekday,
                  daysInMonth: daysInMonth,
                  month: month,
                ),
              ),
          ],
        );
      },
    );
  }
}

class _CellAt extends ConsumerWidget {
  final int index;
  final int firstWeekday;
  final int daysInMonth;
  final DateTime month;

  const _CellAt({
    required this.index,
    required this.firstWeekday,
    required this.daysInMonth,
    required this.month,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dayNum = index - firstWeekday + 1;
    DateTime date;
    bool inMonth;
    if (dayNum < 1) {
      final prevMonth = DateTime(month.year, month.month, 0);
      date = DateTime(prevMonth.year, prevMonth.month, prevMonth.day + dayNum);
      inMonth = false;
    } else if (dayNum > daysInMonth) {
      date = DateTime(month.year, month.month + 1, dayNum - daysInMonth);
      inMonth = false;
    } else {
      date = DateTime(month.year, month.month, dayNum);
      inMonth = true;
    }
    return DayCell(date: date, inMonth: inMonth);
  }
}
