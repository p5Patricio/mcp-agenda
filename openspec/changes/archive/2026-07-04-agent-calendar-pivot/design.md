# Design: Agent Calendar MCP Server

## Technical Approach

Pivot VoiceAgenda from a full-stack Express + React Native app into a standalone MCP stdio server (`agent-calendar`). Strip all HTTP, push notifications, cron, and frontend code. Map `userId` → `agentId` throughout, keep the existing MCP layer architecture (server.ts + tools.ts + resources.ts), add 3 new services + 4 new tools, and ship via CLI with `init` command for DB migration.

## Architecture Decisions

### Decision: Inline tool handlers

| Option | Tradeoff |
|--------|----------|
| **Inline in tools.ts** (chosen) | Matches existing pattern. Current file is ~320 lines. Adding 4 tools + refactoring 4 modified = ~480 lines estimate. Acceptable. |
| handlers/ directory | Premature decomposition. Move to handlers/ only if tools.ts exceeds 600 lines post-pivot. |

### Decision: get_daily_summary vs get_agenda coexistence

| Option | Tradeoff |
|--------|----------|
| **Keep both** (chosen) | `get_daily_summary` returns structured summary for one date (existing users). `get_agenda` returns ordered event list for next N hours/days in text or JSON. Different outputs, no overlap. |
| Replace with get_agenda | Breaks existing MCP clients that call get_daily_summary. No benefit. |

### Decision: agentId default = "default"

| Option | Tradeoff |
|--------|----------|
| **default "default"** (chosen) | MCP hosts that don't pass agentId still work. Downstream: every agent is "default" until the host scopes identity. |
| Require agentId | Breaks all single-identity setups. |

### Decision: LIKE search (no FTS5)

Chosen in specs. Documented upgrade path to FTS5 if performance becomes a bottleneck (>10K events).

## Data Flow

```
MCP Host (Claude, Cline)
    │
    ▼  stdio JSON-RPC
agent-calendar (CLI)
    │
    ├── server.ts ──┬── tools.ts (handlers) ──┬── eventService.ts ──┐
    │                │                         ├── searchService.ts ─┤
    │                │                         ├── slotService.ts ───┤
    │                │                         └── conflictService.ts ┤
    │                │                                                │
    │                └── resources.ts (read) ──┬── eventService.ts ──┤
    │                                           │                     │
    │                                           └── sqlite (direct) ──┤
    │                                                                  ▼
    └── cli.ts ─── init ───→ database.ts (create/migrate) ───→ SQLite
```

## Package Structure

```
agent-calendar/
├── package.json
├── tsconfig.json
├── README.md
├── bin/
│   └── cli.js                    ← bin entry (shebang + require dist/cli.js)
└── src/
    ├── cli.ts                    ← yargs-based CLI entry (init, server, --help/--version)
    ├── config/
    │   └── database.ts           ← Modified: env var, schema, migrations
    ├── types/
    │   └── index.ts              ← Modified: Event.agentId, remove UserSettings/NotificationPayload
    ├── services/
    │   ├── eventService.ts       ← Modified: userId→agentId params, keep userId in insert for compat
    │   ├── voiceParser.ts        ← Unchanged
    │   ├── searchService.ts      ← NEW: LIKE query on title+description
    │   ├── slotService.ts        ← NEW: find free time windows
    │   └── conflictService.ts    ← NEW: detect overlapping events
    ├── mcp/
    │   ├── server.ts             ← Modified: server name/version
    │   ├── index.ts              ← Minor: re-export from CLI entry
    │   ├── tools.ts              ← Modified: 4 modified + 4 new tools
    │   ├── resources.ts          ← Modified: URIs renamed
    │   └── errors.ts             ← Unchanged
    └── __tests__/
        └── voiceParser.test.ts   ← Unchanged
```

## Database Design

```sql
-- Modified: events table
CREATE TABLE IF NOT EXISTS events (
    id              TEXT PRIMARY KEY,
    userId          TEXT,                          -- kept as deprecated, nullable
    agentId         TEXT NOT NULL DEFAULT 'default',
    calendarId      TEXT,                          -- nullable, reserved
    title           TEXT NOT NULL,
    description     TEXT,
    startTime       TEXT NOT NULL,
    endTime         TEXT NOT NULL,
    date            TEXT NOT NULL,
    color           TEXT NOT NULL DEFAULT '#6C63FF',
    reminderMinutes INTEGER NOT NULL DEFAULT 15,
    pushToken       TEXT,
    createdVia      TEXT NOT NULL DEFAULT 'manual',
    rawTranscription TEXT,
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_agentId_date ON events(agentId, date);
CREATE INDEX IF NOT EXISTS idx_events_agentId_date_range ON events(agentId, date, startTime);
```

### Removed tables
- `scheduled_notifications` — entirely dropped
- `user_settings` — entirely dropped

### Removed indexes
- `idx_events_userId_date` → replaced by `idx_events_agentId_date`
- `idx_events_userId_date_range` → replaced by `idx_events_agentId_date_range`
- `idx_scheduled_notifications_sent` → dropped with table

## Module Design

### searchService.ts (NEW)

```typescript
export async function searchEvents(
  agentId: string, query: string, limit?: number
): Promise<Event[]>;
```

- Parameterized query: `SELECT * FROM events WHERE agentId = ? AND (title LIKE ? OR description LIKE ?) ORDER BY date DESC, startTime DESC LIMIT ?`
- Wraps query with `%` around each word
- args: agentId + query (required), limit (default 20)

### slotService.ts (NEW)

```typescript
export async function findFreeSlots(
  agentId: string, date: string, durationMinutes?: number,
  startHour?: number, endHour?: number
): Promise<Array<{ start: string; end: string }>>;
```

- Fetch all events on `date` for `agentId`, sorted by startTime
- Walk business hours (default 08:00–20:00) and collect gaps ≥ durationMinutes
- Returns ISO 8601 strings: `2026-03-20T11:00:00`

### conflictService.ts (NEW)

```typescript
export async function checkConflicts(
  agentId: string, startTime: string, endTime: string,
  excludeEventId?: string
): Promise<{ hasConflict: boolean; conflicts: Event[] }>;
```

- Query: overlapping events where `startTime < :endTime AND endTime > :startTime AND agentId = :agentId`
- Exclude `excludeEventId` if provided
- `hasConflict` derived from result length > 0

### eventService.ts (MODIFIED)

- Every exposed method changes `userId: string` → `agentId: string`
- `createEvent` now writes `agentId` field; keeps `userId` as optional legacy
- `getEventsByDate`, `getEventsByDateRange`, `getDailySummary`: `userId` param renamed to `agentId`, queries updated

## MCP Tools Design

All handlers stay in **tools.ts** (inline pattern). No handler splitting.

### Modified tools (userId→agentId)

| Tool | Zod schema change | Handler change |
|------|------------------|----------------|
| `create_event` | `userId`→`agentId`, default `"default"` | Pass agentId to service |
| `list_events` | same | Query with agentId |
| `get_daily_summary` | same | Renamed param, same logic |
| `parse_event_text` | None | Unchanged (no identity) |

### New tools

#### search_events
```typescript
const SearchEventArgsSchema = z.object({
  agentId: z.string().default('default'),
  query: z.string().min(1),
  limit: z.number().optional().default(20),
});
```
Handler: calls `searchService.searchEvents(agentId, query, limit)`.

#### find_free_slots
```typescript
const FindFreeSlotsArgsSchema = z.object({
  agentId: z.string().default('default'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().optional().default(60),
  startHour: z.number().optional().default(8),
  endHour: z.number().optional().default(20),
});
```
Handler: calls `slotService.findFreeSlots(...)`.

#### check_conflicts
```typescript
const CheckConflictsArgsSchema = z.object({
  agentId: z.string().default('default'),
  startTime: z.string(),
  endTime: z.string(),
  excludeEventId: z.string().optional(),
});
```
Handler: calls `conflictService.checkConflicts(...)`.

#### get_agenda
```typescript
const GetAgendaArgsSchema = z.object({
  agentId: z.string().default('default'),
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  format: z.enum(['text', 'json']).optional().default('text'),
});
```
Handler: fetches events via `eventService.getEventsByDate/ByDateRange`, formats as text (multi-line human-readable) or JSON.

## Resource Templates

Renamed from `voiceagenda://` to `agent-calendar://`:

| URI Template | Query param | Description |
|-------------|-------------|-------------|
| `agent-calendar://events/{date}` | `?agentId=...` (default "default") | Events for a date |
| `agent-calendar://events/{date}/summary` | `?agentId=...` | Daily summary |
| `agent-calendar://event/{id}` | None | Single event |

## CLI Design

```
agent-calendar [command]

Commands:
  agent-calendar           Start MCP server (stdio)  [default]
  agent-calendar init      Create or migrate SQLite database
  agent-calendar --help    Show help
  agent-calendar --version Show version

Exit codes:
  0  Success
  1  Error (DB init failure, schema error, etc.)
```

CLI entry point in `bin/cli.js` with shebang, using yargs or minimal hand-rolled arg parser. Delegate init logic to a `cliInit()` function that calls `database.initialize()`.

## Migration Design

On `agent-calendar init`:

1. Detect `data/voiceagenda.db` at legacy path
2. If found AND `data/agent-calendar.db` does NOT exist:
   - Copy voiceagenda.db → agent-calendar.db
   - Run ALTER TABLE: `ALTER TABLE events ADD COLUMN agentId TEXT`
   - Run `UPDATE events SET agentId = userId` to populate
   - `ALTER TABLE events ADD COLUMN calendarId TEXT`
   - `DROP TABLE IF EXISTS scheduled_notifications`
   - `DROP TABLE IF EXISTS user_settings`
   - Create new indexes (IF NOT EXISTS)
   - Update DB env path
3. If agent-calendar.db already exists → skip (no auto-overwrite)
4. If voiceagenda.db does NOT exist → create fresh schema

Rollback: user keeps the unmodified `voiceagenda.db` file (migration is copy, not move). `agent-calendar.db` deletion reverts to legacy DB.

## File Deletion Plan

### From VoiceAgenda-Backend

| File | Reason |
|------|--------|
| `src/index.ts` | Express boot, not needed |
| `src/routes/events.ts` | REST endpoints, not needed |
| `src/routes/notifications.ts` | REST push registration, not needed |
| `src/services/notificationService.ts` | Expo push, not needed |
| `src/services/cronJobs.ts` | node-cron, not needed |
| `src/utils/dateHelpers.ts` | Empty stub, not needed |

### From VoiceAgenda-Frontend (entire repo)

| Path | Action |
|------|--------|
| `VoiceAgenda-Frontend/` | Delete entire directory |

### package.json dependency removals

| Dependency | Reason |
|------------|--------|
| `express`, `cors`, `helmet` | Express removal |
| `expo-server-sdk` | Push notifications removed |
| `node-cron` | Cron jobs removed |
| `nodemon`, `ts-node` | Replace with `tsx` for dev |
| `@types/express`, `@types/cors`, `@types/node-cron` | Unused types |

### New dependencies

| Package | Reason |
|---------|--------|
| `yargs` | CLI argument parsing |
| `@types/yargs` | Types |

## Implementation Order

| Step | Task | Depends on |
|------|------|------------|
| 1 | Rename package, update tsconfig, add bin entry | — |
| 2 | Clean package.json (remove Express/cron deps, add yargs) | 1 |
| 3 | Update types/index.ts (agentId, remove unused types) | 1 |
| 4 | Update database.ts (new schema, env var, init function) | 2 |
| 5 | Update eventService.ts (userId→agentId) | 3, 4 |
| 6 | Create searchService.ts | 4 |
| 7 | Create slotService.ts | 4 |
| 8 | Create conflictService.ts | 4 |
| 9 | Update resources.ts (rename URIs, userId→agentId) | 5 |
| 10 | Update tools.ts (4 modified + 4 new schemas/handlers) | 5, 6, 7, 8 |
| 11 | Update server.ts (server name/version) | 10 |
| 12 | Create cli.ts (init command + stdio server) | 11 |
| 13 | Create bin/cli.js (shebang entry) | 12 |
| 14 | Delete obsolete files (routes, services, index.ts) | 12 |
| 15 | Update tests (tools.test.ts, server.test.ts, add new tests) | 12 |
| 16 | Write README with MCP config examples | 14 |
| 17 | Delete VoiceAgenda-Frontend directory | 14 |
| 18 | npm publish | 16 |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | searchService | Mock DB, test exact SQL + ordering |
| Unit | slotService | Known events at 9-11, 2-3 → gaps at 11-14, 15-20 |
| Unit | conflictService | Overlap, containment, no conflict, exclusion |
| Unit | voiceParser | Existing test suite (unchanged, must pass) |
| Integration | toolHandlers | Mock services + voiceParser, test 11 handlers via CallToolResult |
| Integration | server.ts | Server name/version, all 11 tools defined, 3 resource templates |
| Integration | cli.ts | `init` with temp dir, `init` with legacy DB, `--version` |
| E2E | NLP flow | `create_event` with `text` → verify persisted event |
