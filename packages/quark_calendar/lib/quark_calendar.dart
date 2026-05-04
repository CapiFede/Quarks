import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import 'data/services/notification_service.dart';
import 'presentation/pages/calendar_page.dart';
import 'presentation/providers/calendar_providers.dart';

class CalendarModule extends Quark {
  @override
  String get id => 'quark_calendar';

  @override
  String get name => 'Quark Calendar';

  @override
  IconData get icon => Icons.calendar_today_outlined;

  @override
  Widget buildPage() => const CalendarPage();

  @override
  List<QuarkSettingOption> buildSettings(BuildContext context, WidgetRef ref) {
    return [
      QuarkSettingOption(
        id: 'new_event',
        label: 'Nuevo evento',
        icon: Icons.add,
        onTap: () async {
          final event = await ref
              .read(eventsProvider.notifier)
              .createEvent(on: ref.read(effectiveSelectedDateProvider));
          ref.read(selectedEventIdProvider.notifier).state = event.id;
        },
      ),
    ];
  }

  @override
  Future<void> initialize() async {
    await NotificationService.instance.initialize();
  }

  @override
  void dispose() {}
}
