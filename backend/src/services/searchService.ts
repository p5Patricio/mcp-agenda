import { db } from '../config/database';
import { Event } from '../types';

export function searchEvents(
  agentId: string,
  query: string,
  limit: number = 20,
): Event[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const pattern = `%${query}%`;
  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE agentId = ?
      AND (title LIKE ? OR description LIKE ?)
    ORDER BY date DESC, startTime DESC
    LIMIT ?
  `);

  return stmt.all(agentId, pattern, pattern, limit) as Event[];
}
