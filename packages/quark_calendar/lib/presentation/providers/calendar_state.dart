import '../../domain/entities/event.dart';

class CalendarState {
  final List<Event> events;

  const CalendarState({this.events = const []});

  CalendarState copyWith({List<Event>? events}) {
    return CalendarState(events: events ?? this.events);
  }
}
