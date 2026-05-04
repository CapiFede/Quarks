import '../entities/event.dart';

abstract class CalendarRepository {
  Future<List<Event>> getEvents();
  Future<void> saveEvent(Event event);
  Future<void> deleteEvent(String id);
}
