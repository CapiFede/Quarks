import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../providers/calendar_providers.dart';
import 'event_detail_view.dart';
import 'event_list_view.dart';

class CalendarDrawer extends ConsumerWidget {
  const CalendarDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.quarksColors;
    final selectedEventId = ref.watch(selectedEventIdProvider);
    final state = ref.watch(eventsProvider).valueOrNull;
    final date = ref.watch(effectiveSelectedDateProvider);

    Widget body;
    if (selectedEventId != null && state != null) {
      final event =
          state.events.where((e) => e.id == selectedEventId).firstOrNull;
      if (event != null) {
        body = EventDetailView(event: event);
      } else {
        body = EventListView(date: date);
      }
    } else {
      body = EventListView(date: date);
    }

    return Container(
      color: colors.background,
      child: body,
    );
  }
}
