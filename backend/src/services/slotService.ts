import { db } from '../config/database';
import { Event } from '../types';

function toLocalISO(dateStr: string, hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dateStr}T${pad(hour)}:${pad(minute)}:00`;
}

function parseTime(isoString: string): { hour: number; minute: number } {
  return {
    hour: parseInt(isoString.slice(11, 13), 10),
    minute: parseInt(isoString.slice(14, 16), 10),
  };
}

function toMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function findFreeSlots(
  agentId: string,
  date: string,
  durationMinutes: number = 60,
  startHour: number = 8,
  endHour: number = 20,
): Array<{ start: string; end: string }> {
  const events = db
    .prepare(
      'SELECT * FROM events WHERE agentId = ? AND date = ? ORDER BY startTime',
    )
    .all(agentId, date) as Event[];

  const businessStart = toMinutes(startHour, 0);
  const businessEnd = toMinutes(endHour, 0);
  const slots: Array<{ start: string; end: string }> = [];

  let currentMin = businessStart;

  for (const event of events) {
    const { hour: startH, minute: startM } = parseTime(event.startTime);
    const { hour: endH, minute: endM } = parseTime(event.endTime);

    const eventStartMin = toMinutes(startH, startM);
    const eventEndMin = toMinutes(endH, endM);

    // If the event starts before the current pointer, just advance past it
    const gapStart = Math.max(currentMin, businessStart);
    const eventEnd = Math.min(eventEndMin, businessEnd);

    if (eventEnd > gapStart) {
      const gapMinutes = eventStartMin - gapStart;
      if (gapMinutes >= durationMinutes && eventStartMin > gapStart) {
        const gapEnd = Math.min(eventStartMin, businessEnd);
        slots.push({
          start: toLocalISO(date, Math.floor(gapStart / 60), gapStart % 60),
          end: toLocalISO(date, Math.floor(gapEnd / 60), gapEnd % 60),
        });
      }
      currentMin = Math.max(currentMin, eventEnd);
    }
  }

  // Gap after the last event (or from start if no events)
  const finalGap = businessEnd - Math.max(currentMin, businessStart);
  if (finalGap >= durationMinutes) {
    const gapStart = Math.max(currentMin, businessStart);
    slots.push({
      start: toLocalISO(date, Math.floor(gapStart / 60), gapStart % 60),
      end: toLocalISO(date, Math.floor(businessEnd / 60), businessEnd % 60),
    });
  }

  return slots;
}
