class Event {
  final String id;
  final String name;
  final int colorValue;
  final DateTime eventDate;
  final DateTime? reminderDate;
  final String notes;
  final DateTime createdAt;

  const Event({
    required this.id,
    this.name = '',
    required this.colorValue,
    required this.eventDate,
    this.reminderDate,
    this.notes = '',
    required this.createdAt,
  });

  Event copyWith({
    String? id,
    String? name,
    int? colorValue,
    DateTime? eventDate,
    Object? reminderDate = _sentinel,
    String? notes,
    DateTime? createdAt,
  }) {
    return Event(
      id: id ?? this.id,
      name: name ?? this.name,
      colorValue: colorValue ?? this.colorValue,
      eventDate: eventDate ?? this.eventDate,
      reminderDate: reminderDate == _sentinel
          ? this.reminderDate
          : reminderDate as DateTime?,
      notes: notes ?? this.notes,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'colorValue': colorValue,
        'eventDate': eventDate.toIso8601String(),
        if (reminderDate != null) 'reminderDate': reminderDate!.toIso8601String(),
        'notes': notes,
        'createdAt': createdAt.toIso8601String(),
      };

  factory Event.fromJson(Map<String, dynamic> json) => Event(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        colorValue: json['colorValue'] as int,
        eventDate: DateTime.parse(json['eventDate'] as String),
        reminderDate: json['reminderDate'] != null
            ? DateTime.parse(json['reminderDate'] as String)
            : null,
        notes: json['notes'] as String? ?? '',
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  static String generateId() =>
      DateTime.now().millisecondsSinceEpoch.toRadixString(36);
}

const _sentinel = Object();
