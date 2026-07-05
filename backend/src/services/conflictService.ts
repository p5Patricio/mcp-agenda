import { db } from '../config/database';
import { Event } from '../types';

export function checkConflicts(
  agentId: string,
  startTime: string,
  endTime: string,
  excludeEventId?: string,
): { hasConflict: boolean; conflicts: Event[] } {
  let sql = `
    SELECT * FROM events
    WHERE agentId = ?
      AND startTime < ?
      AND endTime > ?
  `;
  const params: unknown[] = [agentId, endTime, startTime];

  if (excludeEventId) {
    sql += ' AND id != ?';
    params.push(excludeEventId);
  }

  const conflicts = db.prepare(sql).all(...params) as Event[];

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
}
