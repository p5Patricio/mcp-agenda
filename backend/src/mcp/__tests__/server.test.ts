// Integration test for MCP Server
// Mocks services to avoid loading Firebase and uuid (ESM) during test

jest.mock('../../services/eventService', () => ({
  createEvent: jest.fn(),
  getEventsByDate: jest.fn(),
  getEventsByDateRange: jest.fn(),
  getEventById: jest.fn(),
  updateEvent: jest.fn(),
  deleteEvent: jest.fn(),
  getDailySummary: jest.fn(),
}));

jest.mock('../../services/voiceParser', () => ({
  parseVoiceInput: jest.fn(),
}));

jest.mock('../../services/searchService', () => ({
  searchEvents: jest.fn(),
}));

jest.mock('../../services/slotService', () => ({
  findFreeSlots: jest.fn(),
}));

jest.mock('../../services/conflictService', () => ({
  checkConflicts: jest.fn(),
}));

jest.mock('../../config/database', () => ({
  db: {
    prepare: jest.fn(() => ({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(() => []),
    })),
  },
}));

import { toolHandlers } from '../tools';
import { toolDefinitions } from '../tools';
import { resourceTemplates } from '../resources';
import { runServer } from '../server';

describe('MCP Server Integration', () => {
  test('all 11 tool handlers are registered', () => {
    const names = Object.keys(toolHandlers);
    expect(names).toHaveLength(11);
    expect(names).toEqual([
      'create_event',
      'list_events',
      'get_event',
      'update_event',
      'delete_event',
      'get_daily_summary',
      'parse_event_text',
      'search_events',
      'find_free_slots',
      'check_conflicts',
      'get_agenda',
    ]);
  });

  test('tool definitions match registered handlers', () => {
    const definitionNames = toolDefinitions.map((t) => t.name).sort();
    const handlerNames = Object.keys(toolHandlers).sort();
    expect(definitionNames).toEqual(handlerNames);
  });

  test('each tool definition has required fields', () => {
    for (const def of toolDefinitions) {
      expect(def.name).toBeDefined();
      expect(def.description).toBeDefined();
      expect(def.inputSchema).toBeDefined();
      expect(def.inputSchema.type).toBe('object');
    }
  });

  test('3 resource templates are defined', () => {
    expect(resourceTemplates).toHaveLength(3);
    const uris = resourceTemplates.map((t) => t.uriTemplate);
    expect(uris).toContain('mcp-agenda://events/{date}');
    expect(uris).toContain('mcp-agenda://events/{date}/summary');
    expect(uris).toContain('mcp-agenda://event/{id}');
  });

  test('each resource template has required fields', () => {
    for (const tmpl of resourceTemplates) {
      expect(tmpl.uriTemplate).toBeDefined();
      expect(tmpl.name).toBeDefined();
      expect(tmpl.description).toBeDefined();
    }
  });

  test('runServer is exported as a function', () => {
    expect(typeof runServer).toBe('function');
  });
});
