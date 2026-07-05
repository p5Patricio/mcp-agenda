import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { Event, DailySummary } from '../types';

const EVENT_COLORS = [
  '#4A90D9', '#7B68EE', '#50C878', '#FF6B6B', '#FFB347',
  '#87CEEB', '#DDA0DD', '#98FB98', '#F0E68C', '#FA8072',
];

function randomColor(): string {
  return EVENT_COLORS[Math.floor(Math.random() * EVENT_COLORS.length)];
}

function nowISO(): string {
  return new Date().toISOString();
}

const insertStmt = db.prepare(`
  INSERT INTO events (id, userId, agentId, title, description, startTime, endTime, date, color, reminderMinutes, pushToken, createdVia, rawTranscription, createdAt, updatedAt)
  VALUES (@id, @userId, @agentId, @title, @description, @startTime, @endTime, @date, @color, @reminderMinutes, @pushToken, @createdVia, @rawTranscription, @createdAt, @updatedAt)
`);

const getByIdStmt = db.prepare('SELECT * FROM events WHERE id = ?');
const deleteStmt = db.prepare('DELETE FROM events WHERE id = ?');

export async function createEvent(eventData: Partial<Event>): Promise<Event> {
  const now = nowISO();
  const event: Event = {
    id: uuidv4(),
    userId: eventData.userId ?? '',
    agentId: eventData.agentId ?? eventData.userId ?? '',
    title: eventData.title ?? '',
    description: eventData.description,
    startTime: eventData.startTime ?? now,
    endTime: eventData.endTime ?? now,
    date: eventData.date ?? now.slice(0, 10),
    color: eventData.color ?? randomColor(),
    reminderMinutes: eventData.reminderMinutes ?? 15,
    pushToken: eventData.pushToken,
    createdVia: eventData.createdVia ?? 'manual',
    rawTranscription: eventData.rawTranscription,
    createdAt: now,
    updatedAt: now,
  };

  insertStmt.run(event);
  return event;
}

export async function getEventsByDate(agentId: string, date: string): Promise<Event[]> {
  return db.prepare(
    'SELECT * FROM events WHERE agentId = ? AND date = ? ORDER BY startTime',
  ).all(agentId, date) as Event[];
}

export async function getEventsByDateRange(
  agentId: string,
  startDate: string,
  endDate: string,
): Promise<Event[]> {
  return db.prepare(
    'SELECT * FROM events WHERE agentId = ? AND date >= ? AND date <= ? ORDER BY date, startTime',
  ).all(agentId, startDate, endDate) as Event[];
}

export async function getUpcomingAgenda(
  agentId: string,
  limitDays: number = 7,
): Promise<Event[]> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const future = new Date(now.getTime() + limitDays * 86400000).toISOString().slice(0, 10);

  return db.prepare(`
    SELECT * FROM events
    WHERE agentId = ?
      AND date >= ?
      AND date <= ?
    ORDER BY startTime ASC
  `).all(agentId, today, future) as Event[];
}

export async function getEventById(id: string): Promise<Event | null> {
  const event = getByIdStmt.get(id) as Event | undefined;
  return event ?? null;
}

export async function updateEvent(id: string, data: Partial<Event>): Promise<Event> {
  const existing = getByIdStmt.get(id);
  if (!existing) {
    throw new Error(`Event ${id} not found`);
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === 'id' || value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length === 0) {
    return existing as Event;
  }

  fields.push('updatedAt = ?');
  values.push(nowISO());
  values.push(id);

  db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getByIdStmt.get(id) as Event;
}

export async function deleteEvent(id: string): Promise<void> {
  const existing = getByIdStmt.get(id);
  if (!existing) {
    throw new Error(`Event ${id} not found`);
  }
  deleteStmt.run(id);
}

export async function getDailySummary(agentId: string, date: string): Promise<DailySummary> {
  const events = await getEventsByDate(agentId, date);

  const sorted = [...events].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return {
    date,
    events: sorted,
    totalEvents: sorted.length,
    firstEventTime: sorted.length > 0 ? sorted[0].startTime : '',
    lastEventTime: sorted.length > 0 ? sorted[sorted.length - 1].startTime : '',
  };
}
