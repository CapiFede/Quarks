import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../data/repositories/calendar_repository_impl.dart';
import '../../data/services/calendar_storage_service.dart';
import '../../data/services/notification_service.dart';
import '../../domain/entities/event.dart';
import '../../domain/repositories/calendar_repository.dart';
import 'calendar_state.dart';

final calendarStorageServiceProvider = Provider<CalendarStorageService>((ref) {
  return CalendarStorageService();
});

final notificationServiceProvider = Provider<NotificationService>((ref) {
  return NotificationService.instance;
});

final calendarRepositoryProvider = Provider<CalendarRepository>((ref) {
  return CalendarRepositoryImpl(
    ref.read(calendarStorageServiceProvider),
    ref.read(notificationServiceProvider),
  );
});

final eventsProvider =
    AsyncNotifierProvider<EventsNotifier, CalendarState>(EventsNotifier.new);

/// null => use today
final selectedDateProvider = StateProvider<DateTime?>((ref) => null);

/// null => list mode, 'new' => draft, otherwise existing event id
final selectedEventIdProvider = StateProvider<String?>((ref) => null);

/// First-of-month for the currently displayed grid.
final displayedMonthProvider = StateProvider<DateTime>((ref) {
  final now = DateTime.now();
  return DateTime(now.year, now.month, 1);
});

DateTime _normalize(DateTime d) => DateTime(d.year, d.month, d.day);

final effectiveSelectedDateProvider = Provider<DateTime>((ref) {
  final selected = ref.watch(selectedDateProvider);
  return selected != null ? _normalize(selected) : _normalize(DateTime.now());
});

final eventsForDateProvider =
    Provider.family<List<Event>, DateTime>((ref, date) {
  final state = ref.watch(eventsProvider).valueOrNull;
  if (state == null) return const [];
  final target = _normalize(date);
  final filtered = state.events.where((e) {
    final d = _normalize(e.eventDate);
    return d == target;
  }).toList();
  filtered.sort((a, b) => a.eventDate.compareTo(b.eventDate));
  return filtered;
});

class EventsNotifier extends AsyncNotifier<CalendarState> {
  late final CalendarRepository _repo;

  @override
  Future<CalendarState> build() async {
    _repo = ref.read(calendarRepositoryProvider);
    final events = await _repo.getEvents();
    return CalendarState(events: List<Event>.from(events));
  }

  Future<Event> createEvent({DateTime? on}) async {
    final base = on ?? ref.read(selectedDateProvider) ?? DateTime.now();
    final eventDate =
        DateTime(base.year, base.month, base.day, 9, 0);
    final event = Event(
      id: Event.generateId(),
      colorValue: quarkPastelColors[7].toARGB32(), // Sage
      eventDate: eventDate,
      createdAt: DateTime.now(),
    );
    await _repo.saveEvent(event);
    final current = state.requireValue;
    state = AsyncData(
      current.copyWith(events: [...current.events, event]),
    );
    return event;
  }

  Future<void> saveEvent(Event event) async {
    await _repo.saveEvent(event);
    final current = state.requireValue;
    final list = List<Event>.from(current.events);
    final index = list.indexWhere((e) => e.id == event.id);
    if (index >= 0) {
      list[index] = event;
    } else {
      list.add(event);
    }
    state = AsyncData(current.copyWith(events: list));
  }

  Future<void> deleteEvent(String id) async {
    await _repo.deleteEvent(id);
    final current = state.requireValue;
    state = AsyncData(
      current.copyWith(
        events: current.events.where((e) => e.id != id).toList(),
      ),
    );
  }
}
