import { z } from 'zod';
import { CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import * as eventService from '../services/eventService';
import * as searchService from '../services/searchService';
import * as slotService from '../services/slotService';
import * as conflictService from '../services/conflictService';
import { parseVoiceInput } from '../services/voiceParser';
import { toMcpError } from './errors';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

// ────────────────────────────────────────────────────────────
// Zod Schemas
// ────────────────────────────────────────────────────────────

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?Z?)?$/;

const CreateEventArgsSchema = z.object({
  agentId: z.string().default('default'),
  title: z.string().optional(),
  date: z.string().regex(isoDateRegex, 'date must be YYYY-MM-DD').optional(),
  startTime: z.string().regex(isoDateTimeRegex, 'startTime must be ISO 8601').optional(),
  endTime: z.string().regex(isoDateTimeRegex, 'endTime must be ISO 8601').optional(),
  text: z.string().optional(),
  referenceDate: z.string().optional(),
});

const ListEventsArgsSchema = z.object({
  agentId: z.string().default('default'),
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const GetEventArgsSchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
});

const UpdateEventArgsSchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
  title: z.string().optional(),
  description: z.string().optional(),
  date: z.string().regex(isoDateRegex, 'date must be YYYY-MM-DD').optional(),
  startTime: z.string().regex(isoDateTimeRegex, 'startTime must be ISO 8601').optional(),
  endTime: z.string().regex(isoDateTimeRegex, 'endTime must be ISO 8601').optional(),
  color: z.string().optional(),
  reminderMinutes: z.number().optional(),
});

const DeleteEventArgsSchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
});

const DailySummaryArgsSchema = z.object({
  agentId: z.string().default('default'),
  date: z.string().min(1, 'date is required'),
});

const ParseEventTextArgsSchema = z.object({
  text: z.string().min(1, 'text is required'),
  referenceDate: z.string().optional(),
});

const SearchEventArgsSchema = z.object({
  agentId: z.string().default('default'),
  query: z.string().min(1, 'query is required'),
  limit: z.number().optional().default(20),
});

const FindFreeSlotsArgsSchema = z.object({
  agentId: z.string().default('default'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  durationMinutes: z.number().optional().default(60),
  startHour: z.number().optional().default(8),
  endHour: z.number().optional().default(20),
});

const CheckConflictsArgsSchema = z.object({
  agentId: z.string().default('default'),
  startTime: z.string().regex(isoDateTimeRegex, 'startTime must be ISO 8601'),
  endTime: z.string().regex(isoDateTimeRegex, 'endTime must be ISO 8601'),
  excludeEventId: z.string().optional(),
});

const GetAgendaArgsSchema = z.object({
  agentId: z.string().default('default'),
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  format: z.enum(['text', 'json']).optional().default('text'),
});

const GetUpcomingAgendaArgsSchema = z.object({
  agentId: z.string().default('default'),
  limit: z.number().optional().default(10),
});

// ────────────────────────────────────────────────────────────
// Handlers
// ────────────────────────────────────────────────────────────

async function handleCreateEvent(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = CreateEventArgsSchema.parse(args);

    if (parsed.text) {
      // NLP path: parse voice input then create
      const referenceDate = parsed.referenceDate ? new Date(parsed.referenceDate) : new Date();
      const parsedVoice = parseVoiceInput(parsed.text, referenceDate);

      const event = await eventService.createEvent({
        agentId: parsed.agentId,
        title: parsedVoice.title,
        date: parsedVoice.date,
        startTime: parsedVoice.startTime,
        endTime: parsedVoice.endTime,
        createdVia: 'voice',
        rawTranscription: parsed.text,
      });

      const responseObj: Record<string, unknown> = { ...event, confidence: parsedVoice.confidence };
      if (parsedVoice.confidence < 0.5) {
        responseObj.warning = 'Low NLP confidence — review parsed fields before confirming';
      }
      return { content: [{ type: 'text', text: JSON.stringify(responseObj) }] };
    }

    if (parsed.title && parsed.date && parsed.startTime && parsed.endTime) {
      // Structured path
      const event = await eventService.createEvent({
        agentId: parsed.agentId,
        title: parsed.title,
        date: parsed.date,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        createdVia: 'manual',
      });

      return { content: [{ type: 'text', text: JSON.stringify(event) }] };
    }

    throw new McpError(
      ErrorCode.InvalidParams,
      'Provide either { text } for NLP parsing or { title, date, startTime, endTime } for structured creation',
    );
  } catch (err) {
    throw toMcpError(err);
  }
}

async function handleListEvents(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = ListEventsArgsSchema.parse(args);

    let events;

    if (parsed.date) {
      events = await eventService.getEventsByDate(parsed.agentId, parsed.date);
    } else if (parsed.startDate && parsed.endDate) {
      events = await eventService.getEventsByDateRange(parsed.agentId, parsed.startDate, parsed.endDate);
    } else {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Provide either { date } or { startDate, endDate } to filter events',
      );
    }

    return { content: [{ type: 'text', text: JSON.stringify(events) }] };
  } catch (err) {
    throw toMcpError(err);
  }
}

async function handleGetEvent(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = GetEventArgsSchema.parse(args);
    const event = await eventService.getEventById(parsed.eventId);

    if (!event) {
      throw new Error(`Event ${parsed.eventId} not found`);
    }

    return { content: [{ type: 'text', text: JSON.stringify(event) }] };
  } catch (err) {
    throw toMcpError(err);
  }
}

async function handleUpdateEvent(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = UpdateEventArgsSchema.parse(args);

    // Remove eventId from update fields
    const { eventId, ...fields } = parsed;
    const event = await eventService.updateEvent(eventId, fields);

    return { content: [{ type: 'text', text: JSON.stringify(event) }] };
  } catch (err) {
    throw toMcpError(err);
  }
}

async function handleDeleteEvent(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = DeleteEventArgsSchema.parse(args);
    await eventService.deleteEvent(parsed.eventId);

    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, eventId: parsed.eventId }) }],
    };
  } catch (err) {
    throw toMcpError(err);
  }
}

async function handleGetDailySummary(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = DailySummaryArgsSchema.parse(args);
    const summary = await eventService.getDailySummary(parsed.agentId, parsed.date);

    return { content: [{ type: 'text', text: JSON.stringify(summary) }] };
  } catch (err) {
    throw toMcpError(err);
  }
}

async function handleParseEventText(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = ParseEventTextArgsSchema.parse(args);
    let referenceDate: Date | undefined;
    if (parsed.referenceDate) {
      referenceDate = new Date(parsed.referenceDate);
      if (isNaN(referenceDate.getTime())) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid referenceDate format' }) }],
          isError: true,
        };
      }
    }
    const result = parseVoiceInput(parsed.text, referenceDate);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            title: result.title,
            date: result.date,
            startTime: result.startTime,
            endTime: result.endTime,
            confidence: result.confidence,
            ...(result.confidence < 0.5 && { warning: 'Low NLP confidence — review parsed fields before confirming' }),
          }),
        },
      ],
    };
  } catch (err) {
    throw toMcpError(err);
  }
}

async function handleSearchEvents(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = SearchEventArgsSchema.parse(args);
    const events = searchService.searchEvents(parsed.agentId, parsed.query, parsed.limit);

    return { content: [{ type: 'text', text: JSON.stringify(events) }] };
  } catch (err) {
    throw toMcpError(err);
  }
}

async function handleFindFreeSlots(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = FindFreeSlotsArgsSchema.parse(args);
    const slots = slotService.findFreeSlots(
      parsed.agentId,
      parsed.date,
      parsed.durationMinutes,
      parsed.startHour,
      parsed.endHour,
    );

    return { content: [{ type: 'text', text: JSON.stringify(slots) }] };
  } catch (err) {
    throw toMcpError(err);
  }
}

async function handleCheckConflicts(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = CheckConflictsArgsSchema.parse(args);
    const result = conflictService.checkConflicts(
      parsed.agentId,
      parsed.startTime,
      parsed.endTime,
      parsed.excludeEventId,
    );

    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    throw toMcpError(err);
  }
}

async function handleGetAgenda(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = GetAgendaArgsSchema.parse(args);

    let events;

    if (parsed.date) {
      events = await eventService.getEventsByDate(parsed.agentId, parsed.date);
    } else if (parsed.startDate && parsed.endDate) {
      events = await eventService.getEventsByDateRange(parsed.agentId, parsed.startDate, parsed.endDate);
    } else {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Provide either { date } or { startDate, endDate } for the agenda',
      );
    }

    // Sort by startTime
    const sorted = [...events].sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (parsed.format === 'json') {
      return { content: [{ type: 'text', text: JSON.stringify(sorted) }] };
    }

    // Text format
    const text = sorted
      .map((e) => `${e.startTime.slice(11, 16)} \u2192 ${e.endTime.slice(11, 16)}: ${e.title}`)
      .join('\n');

    return { content: [{ type: 'text', text: text || 'No events found for the given date range.' }] };
  } catch (err) {
    throw toMcpError(err);
  }
}

async function handleGetUpcomingAgenda(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = GetUpcomingAgendaArgsSchema.parse(args);
    const events = await eventService.getUpcomingAgenda(parsed.agentId, parsed.limit);
    return { content: [{ type: 'text', text: JSON.stringify(events) }] };
  } catch (err) {
    throw toMcpError(err);
  }
}

// ────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────

export const toolHandlers: Record<string, ToolHandler> = {
  create_event: handleCreateEvent,
  list_events: handleListEvents,
  get_event: handleGetEvent,
  update_event: handleUpdateEvent,
  delete_event: handleDeleteEvent,
  get_daily_summary: handleGetDailySummary,
  parse_event_text: handleParseEventText,
  search_events: handleSearchEvents,
  find_free_slots: handleFindFreeSlots,
  check_conflicts: handleCheckConflicts,
  get_agenda: handleGetAgenda,
  get_upcoming_agenda: handleGetUpcomingAgenda,
};

export const toolDefinitions = [
  {
    name: 'create_event',
    description:
      'Create an event. Provide { agentId, text } for NLP parsing or { agentId, title, date, startTime, endTime } for structured creation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Agent identity (default: "default")' },
        title: { type: 'string', description: 'Event title' },
        date: { type: 'string', description: 'Event date (YYYY-MM-DD)' },
        startTime: { type: 'string', description: 'Start time (ISO 8601)' },
        endTime: { type: 'string', description: 'End time (ISO 8601)' },
        text: { type: 'string', description: 'Natural language text to parse via NLP' },
        referenceDate: { type: 'string', description: 'Reference date for relative expressions (ISO 8601)' },
      },
    },
  },
  {
    name: 'list_events',
    description: 'List events by date or date range. Provide { agentId, date } or { agentId, startDate, endDate }.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Agent identity (default: "default")' },
        date: { type: 'string', description: 'Date to filter (YYYY-MM-DD)' },
        startDate: { type: 'string', description: 'Range start (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'Range end (YYYY-MM-DD)' },
      },
    },
  },
  {
    name: 'get_event',
    description: 'Get a single event by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'Event ID (required)' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'update_event',
    description: 'Update an existing event. Provide eventId and at least one field to update.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'Event ID (required)' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        date: { type: 'string', description: 'New date (YYYY-MM-DD)' },
        startTime: { type: 'string', description: 'New start time (ISO 8601)' },
        endTime: { type: 'string', description: 'New end time (ISO 8601)' },
        color: { type: 'string', description: 'New hex color' },
        reminderMinutes: { type: 'number', description: 'New reminder minutes' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'delete_event',
    description: 'Delete an event by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'Event ID (required)' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'get_daily_summary',
    description: 'Get a daily summary for an agent and date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Agent identity (default: "default")' },
        date: { type: 'string', description: 'Date (YYYY-MM-DD, required)' },
      },
      required: ['date'],
    },
  },
  {
    name: 'parse_event_text',
    description: 'Parse natural language text into an event structure without persisting it.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Natural language text to parse (required)' },
        referenceDate: { type: 'string', description: 'Reference date for relative expressions (ISO 8601)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'search_events',
    description: 'Search events by text across title and description. Uses SQL LIKE query.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Agent identity (default: "default")' },
        query: { type: 'string', description: 'Search text (required)' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_free_slots',
    description: 'Find available time slots within business hours for a given date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Agent identity (default: "default")' },
        date: { type: 'string', description: 'Target date (YYYY-MM-DD, required)' },
        durationMinutes: { type: 'number', description: 'Minimum slot length in minutes (default: 60)' },
        startHour: { type: 'number', description: 'Business hour start (default: 8)' },
        endHour: { type: 'number', description: 'Business hour end (default: 20)' },
      },
      required: ['date'],
    },
  },
  {
    name: 'check_conflicts',
    description: 'Check if a proposed time conflicts with existing events.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Agent identity (default: "default")' },
        startTime: { type: 'string', description: 'Proposed start time (ISO 8601, required)' },
        endTime: { type: 'string', description: 'Proposed end time (ISO 8601, required)' },
        excludeEventId: { type: 'string', description: 'Event ID to exclude from conflict check (optional)' },
      },
      required: ['startTime', 'endTime'],
    },
  },
  {
    name: 'get_agenda',
    description: 'Get a formatted agenda for a date or date range. Returns human-readable text or JSON.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Agent identity (default: "default")' },
        date: { type: 'string', description: 'Specific date (YYYY-MM-DD)' },
        startDate: { type: 'string', description: 'Range start (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'Range end (YYYY-MM-DD)' },
        format: { type: 'string', description: 'Output format: "text" or "json" (default: "text")' },
      },
    },
  },
  {
    name: 'get_upcoming_agenda',
    description: 'Get upcoming events from today forward.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Agent identity (default: "default")' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
    },
  },
];
