import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../widgets/calendar_drawer.dart';
import '../widgets/month_grid_view.dart';

class CalendarPage extends ConsumerWidget {
  const CalendarPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    return Container(
      color: colors.background,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Expanded(child: MonthGridView()),
          VerticalDivider(width: 1, thickness: 1, color: colors.borderDark),
          const SizedBox(width: 360, child: CalendarDrawer()),
        ],
      ),
    );
  }
}
