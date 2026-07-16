import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { MCP_NOT_FOUND } from '../errors';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Mock services BEFORE importing the tool handlers
jest.mock('../../services/eventService', () => ({
  createEvent: jest.fn(),
  getEventsByDate: jest.fn(),
  getEventsByDateRange: jest.fn(),
  getEventById: jest.fn(),
  updateEvent: jest.fn(),
  deleteEvent: jest.fn(),
  getDailySummary: jest.fn(),
  getUpcomingAgenda: jest.fn(),
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

import { toolHandlers, toolDefinitions } from '../tools';
import * as eventService from '../../services/eventService';
import * as voiceParser from '../../services/voiceParser';
import * as searchService from '../../services/searchService';
import * as slotService from '../../services/slotService';
import * as conflictService from '../../services/conflictService';

const mockEventService = jest.mocked(eventService);
const mockVoiceParser = jest.mocked(voiceParser);
const mockSearchService = jest.mocked(searchService);
const mockSlotService = jest.mocked(slotService);
const mockConflictService = jest.mocked(conflictService);

// Helper: extract text content from a CallToolResult (narrows the union)
function textContent(result: CallToolResult): string {
  const item = result.content[0];
  if (item.type === 'text') return item.text;
  return '';
}

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

const mockEvent = {
  id: 'evt-123',
  userId: 'user1',
  agentId: 'user1',
  title: 'Test Event',
  description: undefined,
  date: '2026-07-03',
  startTime: '2026-07-03T10:00:00',
  endTime: '2026-07-03T11:00:00',
  color: '#4A90D9',
  reminderMinutes: 15,
  pushToken: undefined,
  createdVia: 'manual' as const,
  rawTranscription: undefined,
  createdAt: '2026-07-03T00:00:00',
  updatedAt: '2026-07-03T00:00:00',
};

const mockParsedVoice = {
  title: 'Reunión',
  date: '2026-07-04',
  startTime: '2026-07-04T15:00:00',
  endTime: '2026-07-04T16:00:00',
  confidence: 0.95,
  rawText: 'mañana reunión de 3 a 4',
};

// ────────────────────────────────────────────────────────────
// create_event
// ────────────────────────────────────────────────────────────

describe('create_event', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('structured input creates event', async () => {
    mockEventService.createEvent.mockResolvedValue(mockEvent);

    const result = await toolHandlers.create_event({
      agentId: 'user1',
      title: 'Test Event',
      date: '2026-07-03',
      startTime: '2026-07-03T10:00:00',
      endTime: '2026-07-03T11:00:00',
    });

    expect(mockEventService.createEvent).toHaveBeenCalledWith({
      agentId: 'user1',
      title: 'Test Event',
      date: '2026-07-03',
      startTime: '2026-07-03T10:00:00',
      endTime: '2026-07-03T11:00:00',
      createdVia: 'manual',
    });
    expect(textContent(result)).toContain('evt-123');
    expect(result.isError).toBeUndefined();
  });

  test('NLP path parses text before creating', async () => {
    mockVoiceParser.parseVoiceInput.mockReturnValue(mockParsedVoice);
    mockEventService.createEvent.mockResolvedValue({
      ...mockEvent,
      id: 'evt-456',
      createdVia: 'voice',
      rawTranscription: 'mañana reunión de 3 a 4',
    });

    const result = await toolHandlers.create_event({
      agentId: 'user1',
      text: 'mañana reunión de 3 a 4',
    });

    expect(mockVoiceParser.parseVoiceInput).toHaveBeenCalledWith(
      'mañana reunión de 3 a 4',
      expect.any(Date),
    );
    expect(mockEventService.createEvent).toHaveBeenCalledWith({
      agentId: 'user1',
      title: 'Reunión',
      date: '2026-07-04',
      startTime: '2026-07-04T15:00:00',
      endTime: '2026-07-04T16:00:00',
      createdVia: 'voice',
      rawTranscription: 'mañana reunión de 3 a 4',
    });
    expect(textContent(result)).toContain('evt-456');
  });

  test('validation error when neither text nor structured fields provided', async () => {
    await expect(
      toolHandlers.create_event({ agentId: 'user1' }),
    ).rejects.toThrow(McpError);
  });

  test('uses default agentId when not provided', async () => {
    mockEventService.createEvent.mockResolvedValue(mockEvent);

    await toolHandlers.create_event({
      title: 'Test Event',
      date: '2026-07-03',
      startTime: '2026-07-03T10:00:00',
      endTime: '2026-07-03T11:00:00',
    });

    expect(mockEventService.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'default' }),
    );
  });
});

// ────────────────────────────────────────────────────────────
// list_events
// ────────────────────────────────────────────────────────────

describe('list_events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('by date calls getEventsByDate', async () => {
    mockEventService.getEventsByDate.mockResolvedValue([mockEvent]);

    const result = await toolHandlers.list_events({
      agentId: 'user1',
      date: '2026-07-03',
    });

    expect(mockEventService.getEventsByDate).toHaveBeenCalledWith('user1', '2026-07-03');
    expect(textContent(result)).toContain('evt-123');
  });

  test('by range calls getEventsByDateRange', async () => {
    mockEventService.getEventsByDateRange.mockResolvedValue([mockEvent]);

    const result = await toolHandlers.list_events({
      agentId: 'user1',
      startDate: '2026-07-01',
      endDate: '2026-07-07',
    });

    expect(mockEventService.getEventsByDateRange).toHaveBeenCalledWith(
      'user1', '2026-07-01', '2026-07-07',
    );
    expect(textContent(result)).toContain('evt-123');
  });

  test('empty result returns empty array', async () => {
    mockEventService.getEventsByDate.mockResolvedValue([]);

    const result = await toolHandlers.list_events({
      agentId: 'user1',
      date: '2026-07-05',
    });

    expect(textContent(result)).toBe('[]');
  });

  test('error without date or range', async () => {
    await expect(
      toolHandlers.list_events({ agentId: 'user1' }),
    ).rejects.toThrow(McpError);
  });
});

// ────────────────────────────────────────────────────────────
// get_event
// ────────────────────────────────────────────────────────────

describe('get_event', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('existing event returns it', async () => {
    mockEventService.getEventById.mockResolvedValue(mockEvent);

    const result = await toolHandlers.get_event({ eventId: 'evt-123' });
    expect(textContent(result)).toContain('Test Event');
  });

  test('non-existent event throws NotFound', async () => {
    mockEventService.getEventById.mockResolvedValue(null);

    try {
      await toolHandlers.get_event({ eventId: 'nonexistent' });
      throw new Error('Expected error was not thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).code).toBe(MCP_NOT_FOUND);
    }
  });
});

// ────────────────────────────────────────────────────────────
// update_event
// ────────────────────────────────────────────────────────────

describe('update_event', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('updates partial fields', async () => {
    const updated = { ...mockEvent, title: 'Updated Title', updatedAt: '2026-07-03T12:00:00' };
    mockEventService.updateEvent.mockResolvedValue(updated);

    const result = await toolHandlers.update_event({
      eventId: 'evt-123',
      title: 'Updated Title',
    });

    expect(mockEventService.updateEvent).toHaveBeenCalledWith('evt-123', { title: 'Updated Title' });
    expect(textContent(result)).toContain('Updated Title');
  });
});

// ────────────────────────────────────────────────────────────
// delete_event
// ────────────────────────────────────────────────────────────

describe('delete_event', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('existing event returns success', async () => {
    mockEventService.deleteEvent.mockResolvedValue(undefined);

    const result = await toolHandlers.delete_event({ eventId: 'evt-123' });
    expect(textContent(result)).toContain('success');
    expect(textContent(result)).toContain('evt-123');
  });

  test('non-existent event throws NotFound', async () => {
    mockEventService.deleteEvent.mockRejectedValue(new Error('Event nonexistent not found'));

    try {
      await toolHandlers.delete_event({ eventId: 'nonexistent' });
      throw new Error('Expected error was not thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).code).toBe(MCP_NOT_FOUND);
    }
  });
});

// ────────────────────────────────────────────────────────────
// get_daily_summary
// ────────────────────────────────────────────────────────────

describe('get_daily_summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns daily summary', async () => {
    const summary = {
      date: '2026-07-03',
      events: [mockEvent],
      totalEvents: 1,
      firstEventTime: '2026-07-03T10:00:00',
      lastEventTime: '2026-07-03T10:00:00',
    };
    mockEventService.getDailySummary.mockResolvedValue(summary);

    const result = await toolHandlers.get_daily_summary({
      agentId: 'user1',
      date: '2026-07-03',
    });

    expect(mockEventService.getDailySummary).toHaveBeenCalledWith('user1', '2026-07-03');
    expect(textContent(result)).toContain('totalEvents');
  });
});

// ────────────────────────────────────────────────────────────
// parse_event_text
// ────────────────────────────────────────────────────────────

describe('parse_event_text', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('parses text without persisting', async () => {
    mockVoiceParser.parseVoiceInput.mockReturnValue(mockParsedVoice);

    const result = await toolHandlers.parse_event_text({
      text: 'mañana reunión de 3 a 4',
    });

    expect(mockVoiceParser.parseVoiceInput).toHaveBeenCalled();
    expect(mockEventService.createEvent).not.toHaveBeenCalled();
    expect(textContent(result)).toContain('Reunión');
    expect(textContent(result)).toContain('0.95');
  });

  test('parses with reference date', async () => {
    mockVoiceParser.parseVoiceInput.mockReturnValue(mockParsedVoice);

    await toolHandlers.parse_event_text({
      text: 'reunión de 3 a 4',
      referenceDate: '2026-07-10T00:00:00',
    });

    expect(mockVoiceParser.parseVoiceInput).toHaveBeenCalledWith(
      'reunión de 3 a 4',
      expect.any(Date),
    );
  });

  test('rejects empty text', async () => {
    await expect(
      toolHandlers.parse_event_text({ text: '' }),
    ).rejects.toThrow(McpError);
  });
});

// ────────────────────────────────────────────────────────────
// search_events
// ────────────────────────────────────────────────────────────

describe('search_events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('basic text search returns matching events', async () => {
    mockSearchService.searchEvents.mockReturnValue([mockEvent]);

    const result = await toolHandlers.search_events({
      agentId: 'user1',
      query: 'dentista',
    });

    expect(mockSearchService.searchEvents).toHaveBeenCalledWith('user1', 'dentista', 20);
    expect(textContent(result)).toContain('evt-123');
    expect(result.isError).toBeUndefined();
  });

  test('empty results return empty array', async () => {
    mockSearchService.searchEvents.mockReturnValue([]);

    const result = await toolHandlers.search_events({
      agentId: 'user1',
      query: 'nonexistent',
    });

    expect(textContent(result)).toBe('[]');
  });

  test('validation error when query is empty string', async () => {
    await expect(
      toolHandlers.search_events({ query: '' }),
    ).rejects.toThrow(McpError);
  });

  test('uses default agentId when not provided', async () => {
    mockSearchService.searchEvents.mockReturnValue([]);

    await toolHandlers.search_events({ query: 'test' });

    expect(mockSearchService.searchEvents).toHaveBeenCalledWith('default', 'test', 20);
  });

  test('custom limit is passed through', async () => {
    mockSearchService.searchEvents.mockReturnValue([]);

    await toolHandlers.search_events({
      agentId: 'user1',
      query: 'test',
      limit: 5,
    });

    expect(mockSearchService.searchEvents).toHaveBeenCalledWith('user1', 'test', 5);
  });
});

// ────────────────────────────────────────────────────────────
// find_free_slots
// ────────────────────────────────────────────────────────────

describe('find_free_slots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns free slots for a date', async () => {
    mockSlotService.findFreeSlots.mockReturnValue([
      { start: '2026-07-03T11:00:00', end: '2026-07-03T14:00:00' },
      { start: '2026-07-03T15:00:00', end: '2026-07-03T20:00:00' },
    ]);

    const result = await toolHandlers.find_free_slots({
      agentId: 'user1',
      date: '2026-07-03',
    });

    expect(mockSlotService.findFreeSlots).toHaveBeenCalledWith(
      'user1', '2026-07-03', 60, 8, 20,
    );
    expect(textContent(result)).toContain('11:00');
    expect(textContent(result)).toContain('15:00');
  });

  test('no free slots returns empty array', async () => {
    mockSlotService.findFreeSlots.mockReturnValue([]);

    const result = await toolHandlers.find_free_slots({
      agentId: 'user1',
      date: '2026-07-03',
    });

    expect(textContent(result)).toBe('[]');
  });

  test('custom duration and hours are passed through', async () => {
    mockSlotService.findFreeSlots.mockReturnValue([]);

    await toolHandlers.find_free_slots({
      agentId: 'user1',
      date: '2026-07-03',
      durationMinutes: 30,
      startHour: 9,
      endHour: 17,
    });

    expect(mockSlotService.findFreeSlots).toHaveBeenCalledWith(
      'user1', '2026-07-03', 30, 9, 17,
    );
  });

  test('validation error on bad date format', async () => {
    await expect(
      toolHandlers.find_free_slots({ date: 'not-a-date' }),
    ).rejects.toThrow(McpError);
  });
});

// ────────────────────────────────────────────────────────────
// check_conflicts
// ────────────────────────────────────────────────────────────

describe('check_conflicts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('when conflict exists, returns hasConflict true', async () => {
    mockConflictService.checkConflicts.mockReturnValue({
      hasConflict: true,
      conflicts: [mockEvent],
    });

    const result = await toolHandlers.check_conflicts({
      agentId: 'user1',
      startTime: '2026-07-03T09:30:00',
      endTime: '2026-07-03T10:30:00',
    });

    expect(mockConflictService.checkConflicts).toHaveBeenCalledWith(
      'user1', '2026-07-03T09:30:00', '2026-07-03T10:30:00', undefined,
    );
    expect(textContent(result)).toContain('true');
    expect(textContent(result)).toContain('evt-123');
  });

  test('no conflict returns hasConflict false', async () => {
    mockConflictService.checkConflicts.mockReturnValue({
      hasConflict: false,
      conflicts: [],
    });

    const result = await toolHandlers.check_conflicts({
      agentId: 'user1',
      startTime: '2026-07-03T12:00:00',
      endTime: '2026-07-03T13:00:00',
    });

    expect(textContent(result)).toContain('false');
  });

  test('excludeEventId is passed through', async () => {
    mockConflictService.checkConflicts.mockReturnValue({
      hasConflict: false,
      conflicts: [],
    });

    await toolHandlers.check_conflicts({
      agentId: 'user1',
      startTime: '2026-07-03T14:00:00',
      endTime: '2026-07-03T15:00:00',
      excludeEventId: 'evt-999',
    });

    expect(mockConflictService.checkConflicts).toHaveBeenCalledWith(
      'user1', '2026-07-03T14:00:00', '2026-07-03T15:00:00', 'evt-999',
    );
  });
});

// ────────────────────────────────────────────────────────────
// get_agenda
// ────────────────────────────────────────────────────────────

describe('get_agenda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('text format returns human-readable agenda', async () => {
    mockEventService.getEventsByDate.mockResolvedValue([mockEvent]);

    const result = await toolHandlers.get_agenda({
      agentId: 'user1',
      date: '2026-07-03',
      format: 'text',
    });

    expect(mockEventService.getEventsByDate).toHaveBeenCalledWith('user1', '2026-07-03');
    expect(textContent(result)).toContain('10:00');
    expect(textContent(result)).toContain('Test Event');
  });

  test('json format returns raw events', async () => {
    mockEventService.getEventsByDate.mockResolvedValue([mockEvent]);

    const result = await toolHandlers.get_agenda({
      agentId: 'user1',
      date: '2026-07-03',
      format: 'json',
    });

    expect(textContent(result)).toContain('evt-123');
    // JSON format should include all event fields
    expect(textContent(result)).toContain('"agentId"');
  });

  test('by date range calls getEventsByDateRange', async () => {
    mockEventService.getEventsByDateRange.mockResolvedValue([mockEvent]);

    const result = await toolHandlers.get_agenda({
      agentId: 'user1',
      startDate: '2026-07-01',
      endDate: '2026-07-07',
    });

    expect(mockEventService.getEventsByDateRange).toHaveBeenCalledWith(
      'user1', '2026-07-01', '2026-07-07',
    );
    expect(textContent(result)).toContain('Test Event');
  });

  test('no events returns placeholder text', async () => {
    mockEventService.getEventsByDate.mockResolvedValue([]);

    const result = await toolHandlers.get_agenda({
      agentId: 'user1',
      date: '2026-07-05',
    });

    expect(textContent(result)).toBe('No events found for the given date range.');
  });

  test('uses default agentId when not provided', async () => {
    mockEventService.getEventsByDate.mockResolvedValue([]);

    await toolHandlers.get_agenda({ date: '2026-07-03' });

    expect(mockEventService.getEventsByDate).toHaveBeenCalledWith('default', '2026-07-03');
  });

  test('validation error without date or range', async () => {
    await expect(
      toolHandlers.get_agenda({ agentId: 'user1' }),
    ).rejects.toThrow(McpError);
  });
});

// ────────────────────────────────────────────────────────────
// T-001: ISO regex validation (Bug #1)
// ────────────────────────────────────────────────────────────

describe('ISO datetime regex validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEventService.createEvent.mockResolvedValue(mockEvent);
  });

  test('accepts timestamp without seconds (2026-07-10T09:00)', async () => {
    const result = await toolHandlers.create_event({
      agentId: 'user1',
      title: 'Test',
      date: '2026-07-03',
      startTime: '2026-07-10T09:00',
      endTime: '2026-07-10T10:00',
    });
    expect(result.isError).toBeUndefined();
    expect(mockEventService.createEvent).toHaveBeenCalled();
  });

  test('accepts timestamp with seconds (2026-07-10T09:00:00)', async () => {
    const result = await toolHandlers.create_event({
      agentId: 'user1',
      title: 'Test',
      date: '2026-07-03',
      startTime: '2026-07-10T09:00:00',
      endTime: '2026-07-10T10:00:00',
    });
    expect(result.isError).toBeUndefined();
    expect(mockEventService.createEvent).toHaveBeenCalled();
  });

  test('accepts timestamp with milliseconds (2026-07-10T09:00:00.000Z)', async () => {
    const result = await toolHandlers.create_event({
      agentId: 'user1',
      title: 'Test',
      date: '2026-07-03',
      startTime: '2026-07-10T09:00:00.000Z',
      endTime: '2026-07-10T10:00:00.000Z',
    });
    expect(result.isError).toBeUndefined();
    expect(mockEventService.createEvent).toHaveBeenCalled();
  });

  test('rejects invalid format without T separator (2026/07/10 09:00)', async () => {
    await expect(
      toolHandlers.create_event({
        agentId: 'user1',
        title: 'Test',
        date: '2026-07-03',
        startTime: '2026/07/10 09:00',
        endTime: '2026/07/10 10:00',
      }),
    ).rejects.toThrow(McpError);
  });

  test('rejects completely invalid format (abcd)', async () => {
    await expect(
      toolHandlers.create_event({
        agentId: 'user1',
        title: 'Test',
        date: '2026-07-03',
        startTime: 'abcd',
        endTime: '2026-07-10T10:00',
      }),
    ).rejects.toThrow(McpError);
  });
});

// ────────────────────────────────────────────────────────────
// T-002: referenceDate validation (Bug #7)
// ────────────────────────────────────────────────────────────

describe('parse_event_text referenceDate validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('invalid referenceDate returns error response', async () => {
    const result = await toolHandlers.parse_event_text({
      text: 'mañana reunión',
      referenceDate: 'not-a-date',
    });

    expect(result.isError).toBe(true);
    const body = JSON.parse(textContent(result));
    expect(body.error).toBe('Invalid referenceDate format');
  });
});

// ────────────────────────────────────────────────────────────
// T-007: Confidence warning in NLP responses (Bug #3)
// ────────────────────────────────────────────────────────────

describe('confidence warning in NLP responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('low confidence (< 0.5) includes warning in create_event NLP response', async () => {
    mockVoiceParser.parseVoiceInput.mockReturnValue({
      ...mockParsedVoice,
      confidence: 0.3,
    });
    mockEventService.createEvent.mockResolvedValue({
      ...mockEvent,
      createdVia: 'voice',
    });

    const result = await toolHandlers.create_event({
      agentId: 'user1',
      text: 'some ambiguous text',
    });

    const body = JSON.parse(textContent(result));
    expect(body.confidence).toBe(0.3);
    expect(body.warning).toBe('Low NLP confidence — review parsed fields before confirming');
  });

  test('high confidence (>= 0.5) has no warning in create_event NLP response', async () => {
    mockVoiceParser.parseVoiceInput.mockReturnValue({
      ...mockParsedVoice,
      confidence: 0.8,
    });
    mockEventService.createEvent.mockResolvedValue({
      ...mockEvent,
      createdVia: 'voice',
    });

    const result = await toolHandlers.create_event({
      agentId: 'user1',
      text: 'clear text with time',
    });

    const body = JSON.parse(textContent(result));
    expect(body.confidence).toBe(0.8);
    expect(body.warning).toBeUndefined();
  });

  test('low confidence includes warning in parse_event_text response', async () => {
    mockVoiceParser.parseVoiceInput.mockReturnValue({
      ...mockParsedVoice,
      confidence: 0.3,
    });

    const result = await toolHandlers.parse_event_text({
      text: 'ambiguous text',
    });

    const body = JSON.parse(textContent(result));
    expect(body.confidence).toBe(0.3);
    expect(body.warning).toBe('Low NLP confidence — review parsed fields before confirming');
  });

  test('high confidence has no warning in parse_event_text response', async () => {
    mockVoiceParser.parseVoiceInput.mockReturnValue({
      ...mockParsedVoice,
      confidence: 0.8,
    });

    const result = await toolHandlers.parse_event_text({
      text: 'clear text',
    });

    const body = JSON.parse(textContent(result));
    expect(body.confidence).toBe(0.8);
    expect(body.warning).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// T-008: get_upcoming_agenda tool (Bug #6)
// ────────────────────────────────────────────────────────────

describe('get_upcoming_agenda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('tool handler exists and is callable', async () => {
    mockEventService.getUpcomingAgenda.mockResolvedValue([mockEvent]);

    const result = await toolHandlers.get_upcoming_agenda({
      agentId: 'test',
      limit: 5,
    });

    expect(mockEventService.getUpcomingAgenda).toHaveBeenCalledWith('test', 5);
    expect(textContent(result)).toContain('evt-123');
  });

  test('returns only future events from service', async () => {
    const futureEvent = { ...mockEvent, id: 'evt-future', date: '2026-08-01' };
    mockEventService.getUpcomingAgenda.mockResolvedValue([futureEvent]);

    const result = await toolHandlers.get_upcoming_agenda({
      agentId: 'test',
    });

    expect(mockEventService.getUpcomingAgenda).toHaveBeenCalledWith('test', 10);
    const body = JSON.parse(textContent(result));
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('evt-future');
  });
});

// ────────────────────────────────────────────────────────────
// T-009: Tool descriptions ≤2 sentences (Bug #8)
// ────────────────────────────────────────────────────────────

describe('tool description length (Bug #8)', () => {
  test('all tool descriptions are ≤ 2 sentences', () => {
    for (const tool of toolDefinitions) {
      const sentences = tool.description.split('. ').filter((s: string) => s.trim().length > 0);
      expect(sentences.length).toBeLessThanOrEqual(2);
    }
  });
});
