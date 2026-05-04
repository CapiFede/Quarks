import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tz;
import 'package:timezone/timezone.dart' as tz;

import '../../domain/entities/event.dart';

class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;

    tz.initializeTimeZones();
    try {
      final localName = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(localName));
    } catch (_) {
      // Fallback to UTC if local zone resolution fails.
    }

    const initSettings = InitializationSettings(
      windows: WindowsInitializationSettings(
        appName: 'Quarks',
        appUserModelId: 'com.quarks.app',
        guid: '7a8e4c0e-4e2a-4e1a-9b3c-1e6c2a9b0a11',
      ),
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
      macOS: DarwinInitializationSettings(),
    );

    await _plugin.initialize(initSettings);
    _initialized = true;
  }

  int _idForEvent(String eventId) => eventId.hashCode & 0x7fffffff;

  Future<void> scheduleReminder(Event event) async {
    if (!_initialized) await initialize();
    final reminder = event.reminderDate;
    if (reminder == null) return;
    if (!reminder.isAfter(DateTime.now())) return;

    final scheduled = tz.TZDateTime.from(reminder, tz.local);
    const details = NotificationDetails(
      windows: WindowsNotificationDetails(),
      android: AndroidNotificationDetails(
        'quark_calendar_reminders',
        'Recordatorios',
        channelDescription: 'Recordatorios de eventos del Quark Calendar',
        importance: Importance.high,
        priority: Priority.high,
      ),
      iOS: DarwinNotificationDetails(),
      macOS: DarwinNotificationDetails(),
    );

    final title = event.name.trim().isEmpty ? 'Evento' : event.name;
    final body = _formatBody(event);

    await _plugin.zonedSchedule(
      _idForEvent(event.id),
      title,
      body,
      scheduled,
      details,
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
    );
  }

  Future<void> cancelReminder(String eventId) async {
    if (!_initialized) await initialize();
    await _plugin.cancel(_idForEvent(eventId));
  }

  String _formatBody(Event event) {
    final d = event.eventDate;
    final hh = d.hour.toString().padLeft(2, '0');
    final mm = d.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }
}
