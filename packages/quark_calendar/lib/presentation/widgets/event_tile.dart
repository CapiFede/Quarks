import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import '../../domain/entities/event.dart';
import '../providers/calendar_providers.dart';

class EventTile extends ConsumerStatefulWidget {
  final Event event;

  const EventTile({super.key, required this.event});

  @override
  ConsumerState<EventTile> createState() => _EventTileState();
}

class _EventTileState extends ConsumerState<EventTile> {
  bool _hovering = false;

  String _formatHour(DateTime d) {
    final hh = d.hour.toString().padLeft(2, '0');
    final mm = d.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.quarksColors;
    final textTheme = Theme.of(context).textTheme;
    final event = widget.event;
    final eventColor = Color(event.colorValue);
    final name = event.name.trim().isEmpty ? 'Sin título' : event.name;

    final borderTopLeft = _hovering
        ? Color.lerp(colors.borderDark, Colors.white, 0.3)!
        : Color.lerp(eventColor, Colors.white, 0.4)!;
    final borderBottomRight = _hovering
        ? colors.borderDark
        : Color.lerp(eventColor, Colors.black, 0.12)!;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: GestureDetector(
        onTap: () =>
            ref.read(selectedEventIdProvider.notifier).state = event.id,
        child: MouseRegion(
          cursor: SystemMouseCursors.click,
          onEnter: (_) => setState(() => _hovering = true),
          onExit: (_) => setState(() => _hovering = false),
          child: Container(
            decoration: BoxDecoration(
              color: eventColor,
              border: Border(
                top: BorderSide(color: borderTopLeft, width: 2),
                left: BorderSide(color: borderTopLeft, width: 2),
                bottom: BorderSide(color: borderBottomRight, width: 2),
                right: BorderSide(color: borderBottomRight, width: 2),
              ),
              boxShadow: [
                BoxShadow(
                  color: colors.cardShadow,
                  offset: const Offset(2, 2),
                  blurRadius: 0,
                ),
              ],
            ),
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Row(
              children: [
                Text(
                  _formatHour(event.eventDate),
                  style: textTheme.bodySmall?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.bodyMedium
                        ?.copyWith(color: colors.textPrimary),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
