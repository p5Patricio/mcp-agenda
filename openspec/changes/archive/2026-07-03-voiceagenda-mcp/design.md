# Design: VoiceAgenda MCP Server

## Technical Approach

Standalone MCP server (stdio transport) wrapping existing `eventService.ts` and `voiceParser.ts` as MCP tools/resources. Zero changes to existing Express API or services — pure additive layer in `src/mcp/`. All tools scope by `userId`. Entry point: `src/mcp/index.ts` → `src/mcp/server.ts`.

## Architecture Decisions

### Decision: Handler organization

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `tools/` directory (file per tool) | 7 files for ~30-line handlers | **Single `tools.ts`** — all handlers co-located |
| Single `tools.ts` | Cleaner for small handler count | ✅ Chosen |

### Decision: Input validation

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Zod schemas | Type-safe, MCP SDK native integration | ✅ **Zod** — idiomatic with `@modelcontextprotocol/sdk` v1.x |
| Hand-rolled | Less deps but verbose | Rejected — more boilerplate |

### Decision: Build config

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Separate `outDir` (`dist/mcp/`) | Clean separation but duplicates compiled shared files | **Same `dist/` as base** — override `include` only |
| Override `include` only | Simpler, both builds target `dist/` | ✅ Chosen — no file conflict (MCP entry `dist/mcp/index.js`, Express entry `dist/index.js`) |

### Decision: Reuse without modification

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Direct imports from `../services/eventService` | Zero changes to existing code | ✅ **Direct import** — MCP entry imports same services as Express |
| Adapter layer | Adds indirection, maintenance cost | Rejected — unnecessary abstraction |

## Data Flow

```
Agent (MCP Client)
    │  stdin/stdout (JSON-RPC)
    ▼
src/mcp/index.ts  ──►  server.ts
    │                      │
    │              ┌───────┴────────┐
    │              │                │
    ▼              ▼                ▼
tools.ts      resources.ts     errors.ts
│  │  │  ...       │
│  │  │             │
▼  ▼  ▼             ▼
eventService.ts / voiceParser.ts   (reused, untouched)
│
▼
Firestore (same db, collections, credentials)
```

### Tool call flow (create_event via NLP)

```
CallToolRequest { name: "create_event", args: { userId, text: "mañana reunión de 3 a 4" } }
  → server.ts dispatches to handleCreateEvent()
  → detects `text` param → voiceParser.parseVoiceInput(text) → ParsedVoiceEvent
  → merges parsed fields + sets createdVia: 'voice'
  → calls eventService.createEvent(data)
  → returns CallToolResult with JSON Event
```

### Resource flow

```
ReadResourceRequest { uri: "voiceagenda://events/2026-07-03?userId=abc" }
  → server.ts matches ResourceTemplate → extracts date, userId query param
  → calls eventService.getEventsByDate(userId, date)
  → returns ResourceContents as formatted text
```

## Tool Schemas

| Tool | Input | Service Call |
|------|-------|--------------|
| `create_event` | `{ userId, title?, date?, startTime?, endTime?, text?, referenceDate? }` | `voiceParser.parseVoiceInput()` then `eventService.createEvent()` |
| `list_events` | `{ userId }` + `date?` **or** `startDate?` + `endDate?` | `getEventsByDate()` or `getEventsByDateRange()` |
| `get_event` | `{ eventId }` | `getEventById()` |
| `update_event` | `{ eventId, ...partial }` | `updateEvent()` |
| `delete_event` | `{ eventId }` | `deleteEvent()` |
| `get_daily_summary` | `{ userId, date }` | `getDailySummary()` |
| `parse_event_text` | `{ text, referenceDate? }` | `voiceParser.parseVoiceInput()` — no persistence |

## Resource URIs

| URI Template | Params | Backend |
|--------------|--------|---------|
| `voiceagenda://events/{date}` | `?userId=` | `getEventsByDate(userId, date)` |
| `voiceagenda://events/{date}/summary` | `?userId=` | `getDailySummary(userId, date)` |
| `voiceagenda://event/{id}` | — | `getEventById(id)` |

## Error Handling Strategy

| Condition | MCP Error | Behavior |
|-----------|-----------|----------|
| Missing required param | `InvalidParams` | Return descriptive text |
| Event not found (CRUD) | `NotFound` | Catch `eventService` thrown errors |
| Invalid date/format | `InvalidParams` | Validate via Zod before service call |
| Firebase/DB failure | `InternalError` | Log, return generic message |
| Unknown tool | `MethodNotFound` | Handled by SDK automatically |

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/mcp/index.ts` | Create | Entry point — imports and runs server |
| `src/mcp/server.ts` | Create | MCP Server bootstrap + handler registration |
| `src/mcp/tools.ts` | Create | All 7 tool handlers with Zod schemas |
| `src/mcp/resources.ts` | Create | Resource template matchers + read handlers |
| `src/mcp/errors.ts` | Create | Error mapping: service errors → MCP error codes |
| `tsconfig.mcp.json` | Create | Extends base `tsconfig.json`; includes MCP + deps |
| `package.json` | Modify | Add deps + `build:mcp` / `mcp` scripts |

## Interfaces / Contracts

```typescript
// Error mapper contract
function toMcpError(err: unknown): McpError;  // NotFound for "not found" strings, InvalidParams for validation, InternalError for rest

// Tool handler signature (internal dispatch table)
type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;
const toolHandlers: Record<string, ToolHandler> = { ... };
```

## Build & Run

```bash
# One-time setup
npm install @modelcontextprotocol/sdk zod

# Build MCP server
npm run build:mcp    # tsc -p tsconfig.mcp.json → dist/mcp/index.js

# Run (stdio)
npm run mcp          # node dist/mcp/index.js
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Tool handlers | Call each handler with valid/invalid args, assert `CallToolResult` |
| Unit | Error mapping | Test `toMcpError()` with known error types |
| Integration | Tool dispatch | Start server in child process, send JSON-RPC over stdio, validate response |
| Integration | Firebase | Use Firestore emulator or mock `eventService` module |

## Migration / Rollout

No migration required. New additive code only — no existing data, schema, or API changes. Rollback: remove `src/mcp/`, revert `package.json`, delete `tsconfig.mcp.json`.

## Open Questions

None.
