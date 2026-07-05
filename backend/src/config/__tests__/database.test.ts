import path from 'path';
import fs from 'fs';
import os from 'os';

// Use a temp directory so we don't pollute the real data dir
const TEST_DIR = path.join(os.tmpdir(), 'mcp-agenda-test-' + Date.now());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let initialize: () => void;
let DB_DIR_export: string;

beforeAll(() => {
  process.env.AGENT_CALENDAR_DB_PATH = TEST_DIR;
  // Force re-evaluation of database.ts with the test env var
  jest.resetModules();
  const database = require('../database') as typeof import('../database');
  db = database.db;
  initialize = database.initialize;
  DB_DIR_export = database.DB_DIR;
});

afterAll(() => {
  delete process.env.AGENT_CALENDAR_DB_PATH;
  // Close the DB connection so we can delete the temp dir
  if (db) {
    try { db.close(); } catch { /* ignore */ }
  }
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('database schema', () => {
  test('DB_DIR points to test directory', () => {
    expect(DB_DIR_export).toBe(TEST_DIR);
  });

  test('events table exists', () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
      .get() as { name: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe('events');
  });

  test('events table has agentId column (no pushToken)', () => {
    const cols = db.prepare('PRAGMA table_info(events)').all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('agentId');
    expect(names).toContain('userId');
    expect(names).toContain('calendarId');
    expect(names).not.toContain('pushToken');
  });

  test('scheduled_notifications table does NOT exist', () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_notifications'")
      .get();
    expect(row).toBeUndefined();
  });

  test('user_settings table does NOT exist', () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_settings'")
      .get();
    expect(row).toBeUndefined();
  });

  test('agentId index exists', () => {
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_events_agentId_date'")
      .get() as { name: string } | undefined;
    expect(idx).toBeDefined();
  });

  test('date range index exists', () => {
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_events_agentId_date_range'")
      .get() as { name: string } | undefined;
    expect(idx).toBeDefined();
  });
});

describe('initialize()', () => {
  test('initialize is idempotent (multiple calls do not throw)', () => {
    expect(() => initialize()).not.toThrow();
    expect(() => initialize()).not.toThrow();
  });
});
