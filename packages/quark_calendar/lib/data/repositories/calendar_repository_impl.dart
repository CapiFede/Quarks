import '../../domain/entities/event.dart';
import '../../domain/repositories/calendar_repository.dart';
import '../services/calendar_storage_service.dart';
import '../services/notification_service.dart';

class CalendarRepositoryImpl implements CalendarRepository {
  final CalendarStorageService _storage;
  final NotificationService _notifications;

  List<Event>? _cache;

  CalendarRepositoryImpl(this._storage, this._notifications);

  @override
  Future<List<Event>> getEvents() async {
    final cached = _cache;
    if (cached != null) return List.unmodifiable(cached);
    final loaded = await _storage.loadEvents();
    _cache = loaded;
    return List.unmodifiable(loaded);
  }

  @override
  Future<void> saveEvent(Event event) async {
    final list = _cache ??= await _storage.loadEvents();
    final index = list.indexWhere((e) => e.id == event.id);
    if (index >= 0) {
      list[index] = event;
    } else {
      list.add(event);
    }
    await _storage.saveEvents(list);

    await _notifications.cancelReminder(event.id);
    if (event.reminderDate != null) {
      await _notifications.scheduleReminder(event);
    }
  }

  @override
  Future<void> deleteEvent(String id) async {
    final list = _cache ??= await _storage.loadEvents();
    list.removeWhere((e) => e.id == id);
    await _storage.saveEvents(list);
    await _notifications.cancelReminder(id);
  }
}
