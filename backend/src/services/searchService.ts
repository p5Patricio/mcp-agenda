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

  const escaped = query.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escaped}%`;
  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE agentId = ?
      AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
    ORDER BY date DESC, startTime DESC
    LIMIT ?
  `);

  return stmt.all(agentId, pattern, pattern, limit) as Event[];
}
