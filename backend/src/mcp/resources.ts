import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import * as eventService from '../services/eventService';
import { MCP_NOT_FOUND } from './errors';

// ────────────────────────────────────────────────────────────
// Resource Template Definitions
// ────────────────────────────────────────────────────────────

export const resourceTemplates = [
  {
    uriTemplate: 'mcp-agenda://events/{date}',
    name: 'Events by Date',
    description: 'List events for a specific date. Query parameter: agentId (default: "default").',
    mimeType: 'text/plain' as const,
  },
  {
    uriTemplate: 'mcp-agenda://events/{date}/summary',
    name: 'Daily Summary',
    description: 'Daily summary for a specific date. Query parameter: agentId (default: "default").',
    mimeType: 'text/plain' as const,
  },
  {
    uriTemplate: 'mcp-agenda://event/{id}',
    name: 'Event Detail',
    description: 'Get a single event by ID.',
    mimeType: 'text/plain' as const,
  },
];

// ────────────────────────────────────────────────────────────
// Resource Read Handler
// ────────────────────────────────────────────────────────────

export async function handleReadResource(uri: string): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
  try {
    // Normalize URI for URL parsing
    const url = new URL(uri.replace(/^mcp-agenda:\/\//, 'https://mcp-agenda/'));
    const pathname = url.pathname;
    const agentId = url.searchParams.get('agentId') ?? 'default';

    // Match: /events/{date}
    const eventsMatch = pathname.match(/^\/events\/(\d{4}-\d{2}-\d{2})$/);
    // Match: /events/{date}/summary
    const summaryMatch = pathname.match(/^\/events\/(\d{4}-\d{2}-\d{2})\/summary$/);
    // Match: /event/{id}
    const eventMatch = pathname.match(/^\/event\/(.+)$/);

    if (eventsMatch) {
      const date = eventsMatch[1];
      const events = await eventService.getEventsByDate(agentId, date);

      if (events.length === 0) {
        return {
          contents: [{ uri, mimeType: 'text/plain', text: `No events found for ${date}.` }],
        };
      }

      const text = events
        .map(
          (e, i) =>
            `${i + 1}. ${e.title} — ${e.startTime?.slice(11, 16) ?? '?'} → ${e.endTime?.slice(11, 16) ?? '?'}`,
        )
        .join('\n');

      return { contents: [{ uri, mimeType: 'text/plain', text }] };
    }

    if (summaryMatch) {
      const date = summaryMatch[1];
      const summary = await eventService.getDailySummary(agentId, date);

      const text = [
        `Daily Summary for ${date}`,
        `Total Events: ${summary.totalEvents}`,
        summary.firstEventTime ? `First: ${summary.firstEventTime.slice(11, 16)}` : '',
        summary.lastEventTime ? `Last: ${summary.lastEventTime.slice(11, 16)}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      return { contents: [{ uri, mimeType: 'text/plain', text }] };
    }

    if (eventMatch) {
      const id = eventMatch[1];
      const event = await eventService.getEventById(id);

      if (!event) {
        throw new Error(`Event ${id} not found`);
      }

      const text = [
        `Title: ${event.title}`,
        `Date: ${event.date}`,
        `Time: ${event.startTime?.slice(11, 16)} → ${event.endTime?.slice(11, 16)}`,
        event.description ? `Description: ${event.description}` : '',
        `Color: ${event.color}`,
        `Created via: ${event.createdVia}`,
      ]
        .filter(Boolean)
        .join('\n');

      return { contents: [{ uri, mimeType: 'text/plain', text }] };
    }

    throw new McpError(MCP_NOT_FOUND, `Unknown resource URI: ${uri}`);
  } catch (err) {
    if (err instanceof McpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new McpError(
      /not found/i.test(message) ? MCP_NOT_FOUND : ErrorCode.InternalError,
      message,
    );
  }
}
