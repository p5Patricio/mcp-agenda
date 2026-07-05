import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = process.env.AGENT_CALENDAR_DB_PATH
  ?? process.env.DB_PATH
  ?? path.resolve(__dirname, '../../data');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(DB_DIR);

const DB_FILE = path.join(DB_DIR, 'mcp-agenda.db');

const db = new Database(DB_FILE);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initialize(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id              TEXT PRIMARY KEY,
      userId          TEXT,
      agentId         TEXT NOT NULL DEFAULT 'default',
      calendarId      TEXT,
      title           TEXT NOT NULL,
      description     TEXT,
      startTime       TEXT NOT NULL,
      endTime         TEXT NOT NULL,
      date            TEXT NOT NULL,
      color           TEXT NOT NULL DEFAULT '#6C63FF',
      reminderMinutes INTEGER NOT NULL DEFAULT 15,
      createdVia      TEXT NOT NULL DEFAULT 'manual',
      rawTranscription TEXT,
      createdAt       TEXT NOT NULL,
      updatedAt       TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_agentId_date
      ON events(agentId, date);
    CREATE INDEX IF NOT EXISTS idx_events_agentId_date_range
      ON events(agentId, date, startTime);
  `);
}

// Run initialization at module load (keeps existing behavior for tests)
initialize();

export { db, DB_DIR };
