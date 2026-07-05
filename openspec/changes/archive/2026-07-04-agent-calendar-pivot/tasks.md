# Tasks: Agent Calendar MCP Server Pivot

## Review Workload Forecast

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750 (additions) + ~530 (deletions backend) + frontend |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Cleanup + services + eventService → PR 2: Tools + Resources + CLI → PR 3: Tests + Docs |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

---

## Phase 1: Limpieza y preparación

### ✅ T-001: Rename and clean package.json

**Files**: `package.json`
**Depends on**: —
**Effort**: Small
**Status**: ✅ Complete (PR 1, batch 1)

**Context**: Rename package from `voiceagenda-backend` to `agent-calendar`. Reset version, update description, add `bin` entry for CLI, remove Express/cron/push deps, add `yargs`. Replace `nodemon`/`ts-node` with `tsx`.

**Acceptance Criteria**:
- [x] `name` is `agent-calendar`, `version` is `1.0.0`, `description` mentions MCP server
- [x] `bin` entry: `{ "agent-calendar": "./bin/cli.js" }`
- [x] `dependencies` removed: `express`, `cors`, `helmet`, `expo-server-sdk`, `node-cron`
- [x] `dependencies` added: `yargs`, `@types/yargs`
- [x] `devDependencies` removed: `nodemon`, `ts-node`, `@types/express`, `@types/cors`, `@types/node-cron`
- [x] `scripts.cleanup`: `dev` uses `tsx watch`, `build` uses `tsc`, `test` uses `jest`

**Implementation Notes**:
- Keep `@modelcontextprotocol/sdk`, `better-sqlite3`, `chrono-node`, `uuid`, `zod`, `dotenv`
- Keep `@types/better-sqlite3`, `@types/uuid`, `@types/jest`, `@types/node`, `typescript`, `ts-jest`, `jest` (devDeps)
- Add `"type": "commonjs"` or leave implicit (CJS build)

---

### ✅ T-002: Unify tsconfig, remove tsconfig.mcp.json

**Files**: `tsconfig.json`, `tsconfig.mcp.json` (delete)
**Depends on**: T-001
**Effort**: Small
**Status**: ✅ Complete (PR 1, batch 1)

**Context**: The split tsconfig (main + mcp) is no longer needed. The entire project IS the MCP server. Keep single `tsconfig.json`, delete `tsconfig.mcp.json`.

**Acceptance Criteria**:
- [x] `tsconfig.mcp.json` is deleted
- [x] `tsconfig.json` includes `src/**/*` and compiles everything to `dist/`
- [x] No references to `tsconfig.mcp.json` remain in `package.json` scripts

**Implementation Notes**:
- `tsconfig.json` already targets ES2020 + commonjs, that's correct for distribution

---

### ✅ T-003: Delete obsolete backend files

**Files**: `src/index.ts`, `src/routes/events.ts`, `src/routes/notifications.ts`, `src/services/notificationService.ts`, `src/services/cronJobs.ts`, `src/utils/dateHelpers.ts`
**Depends on**: —
**Effort**: Medium
**Status**: ✅ Complete (PR 1, batch 1)

**Context**: Remove Express boot, REST routes, push notification service, cron jobs, and empty dateHelpers. These are replaced by the MCP-only CLI entry point.

**Acceptance Criteria**:
- [x] All listed files are deleted
- [x] No remaining imports reference any deleted file
- [x] `npm run build` compiles without errors

**Implementation Notes**:
- `src/index.ts` imports from `src/routes/events`, `src/routes/notifications`, `src/services/cronJobs` — all to be deleted together
- `src/routes/events.ts` imports `eventService` and `voiceParser` — these are kept
- `src/routes/notifications.ts` imports `notificationService` and `db` — `db` is kept
- `src/services/cronJobs.ts` imports `notificationService` and `db` — `db` is kept
- `notificationService.ts` imports `eventService` — `eventService` is kept
- Check `src/mcp/server.ts` does NOT import from deleted files (it doesn't)

---

### ✅ T-004: Delete VoiceAgenda-Frontend

**Files**: `VoiceAgenda-Frontend/` (entire directory)
**Depends on**: —
**Effort**: Large (many files, but mechanical)
**Status**: ✅ Complete (PR 1, batch 1)

**Context**: Remove the React Native frontend. The product is now CLI-only MCP server.

**Acceptance Criteria**:
- [x] `VoiceAgenda-Frontend/` directory no longer exists
- [x] No references to the frontend remain in the project (README, configs, etc.)

**Implementation Notes**:
- This is a pure deletion task. No code changes needed beyond removal.
- Consider `git rm -r VoiceAgenda-Frontend` if using git (preservation in history)

---

### ✅ T-005: Migrate database.ts to new schema

**Files**: `src/config/database.ts`
**Depends on**: T-001, T-002, T-003
**Effort**: Medium
**Status**: ✅ Complete (PR 1, batch 1)

**Context**: Replace `userId` with `agentId`, drop `scheduled_notifications` and `user_settings` tables, add new indexes, change env var from `DB_PATH` to `AGENT_CALENDAR_DB_PATH` (keep `DB_PATH` as fallback), change default DB file to `agent-calendar.db`. Add `initialize()` function for CLI `init` command.

**Acceptance Criteria**:
- [x] DB file path uses `AGENT_CALENDAR_DB_PATH` env var, falls back to `DB_PATH`, then `./data/agent-calendar.db`
- [x] `events` table has `agentId TEXT NOT NULL DEFAULT 'default'` and `calendarId TEXT` columns
- [x] `events.userId` column is kept (deprecated, nullable)
- [x] `scheduled_notifications` and `user_settings` tables are NOT created
- [x] Indexes: `idx_events_agentId_date` and `idx_events_agentId_date_range` on `events(agentId, date)` and `events(agentId, date, startTime)`
- [x] `initialize()` function exported: creates tables + indexes via `IF NOT EXISTS`
- [x] Schema creation still uses `CREATE TABLE IF NOT EXISTS` for re-entrancy
- [x] `export { db, initialize, DB_DIR }` for use by CLI and tests

**Implementation Notes**:
- Keep WAL mode and foreign_keys pragmas
- The `initialize()` function should be idempotent (callable multiple times)
- Add `calendarId TEXT` column (nullable, reserved for future multi-calendar)
- Keep `userId` column as TEXT (nullable, deprecated) — allows existing code to still write to it for backward compat
- Export `DB_DIR` so CLI can check for legacy DB

---

## Phase 2: New Services

### ✅ T-006: Create searchService.ts

**Files**: `src/services/searchService.ts`
**Depends on**: T-005
**Effort**: Small
**Status**: ✅ Complete (PR 1, batch 1)

**Context**: Text search over events using SQL LIKE on `title` and `description`. Scoped by `agentId`.

**Acceptance Criteria**:
- [x] `searchEvents(agentId, query, limit?)` exported function
- [x] SQL: `SELECT * FROM events WHERE agentId = ? AND (title LIKE ? OR description LIKE ?) ORDER BY date DESC, startTime DESC LIMIT ?`
- [x] Query is wrapped with `%` on both sides
- [x] Uses `db.prepare()` with parameterized queries (no SQL injection)
- [x] Default `limit` = 20

**Implementation Notes**:
- Import `db` from `../config/database`
- Use `.all()` with typed return `as Event[]`
- Edge case: empty query → return empty array (no match-all fallback)

---

### ✅ T-007: Create slotService.ts

**Files**: `src/services/slotService.ts`
**Depends on**: T-005
**Effort**: Medium
**Status**: ✅ Complete (PR 1, batch 1)

**Context**: Find free time slots within business hours for a given date, respecting existing events.

**Acceptance Criteria**:
- [x] `findFreeSlots(agentId, date, durationMinutes?, startHour?, endHour?)` exported function
- [x] Fetches all events for `agentId` on `date`, sorted by `startTime`
- [x] Walks business hours (default 08:00–20:00) identifying gaps ≥ `durationMinutes` (default 60)
- [x] Returns `Array<{ start: string; end: string }>` in ISO 8601 date-time format (`YYYY-MM-DDTHH:mm:ss`)
- [x] Slots that span exactly the gap between events (including start/end of business hours)

**Implementation Notes**:
- Parse `startTime` to get the hour/minute, use local time comparison
- Handle case: no events → single free slot covering all business hours
- Handle case: event at exactly 08:00 → gap starts after it
- Handle case: event at exactly 20:00 → no gap at the end
- The `date` param is `YYYY-MM-DD`, events filtered by `date` column

---

### ✅ T-008: Create conflictService.ts

**Files**: `src/services/conflictService.ts`
**Depends on**: T-005
**Effort**: Small
**Status**: ✅ Complete (PR 1, batch 1)

**Context**: Detect scheduling conflicts by checking overlapping time intervals.

**Acceptance Criteria**:
- [x] `checkConflicts(agentId, startTime, endTime, excludeEventId?)` exported function
- [x] SQL: overlapping events where `startTime < :endTime AND endTime > :startTime AND agentId = :agentId`
- [x] Excludes `excludeEventId` if provided (for rescheduling)
- [x] Returns `{ hasConflict: boolean, conflicts: Event[] }`

**Implementation Notes**:
- Standard overlap logic: two intervals `[aStart, aEnd]` and `[bStart, bEnd]` overlap if `aStart < bEnd AND aEnd > bStart`
- `excludeEventId` is an optional `WHERE id != ?` clause
- Import `db` and `Event` type

---

## Phase 3: Expand eventService

### ✅ T-009: Rename userId to agentId in eventService

**Files**: `src/services/eventService.ts`
**Depends on**: T-005
**Effort**: Medium
**Status**: ✅ Complete (PR 1, batch 1)

**Context**: All eventService methods change `userId: string` parameter to `agentId: string`. The `createEvent` function writes both `agentId` (new) and `userId` (deprecated legacy). Queries filter by `agentId`.

**Acceptance Criteria**:
- [x] `createEvent(eventData)` writes `agentId` field; still writes `userId` if provided (or same value as agentId for backward compat)
- [x] `getEventsByDate(agentId, date)` queries `WHERE agentId = ? AND date = ?`
- [x] `getEventsByDateRange(agentId, startDate, endDate)` queries `WHERE agentId = ? AND date >= ? AND date <= ?`
- [x] `getDailySummary(agentId, date)` renamed parameter, same logic
- [x] `getEventById`, `updateEvent`, `deleteEvent` unchanged (no identity params)
- [x] INSERT statement includes `agentId` column
- [x] `getUpcomingAgenda(agentId, limitDays?)` added (new method)
- [x] All existing method signatures documented/updated

**Implementation Notes**:
- The insertStmt prepared statement must be re-created or use a new stmt including `agentId`
- Since `db.prepare()` is called at module level, the module needs re-import after schema change — test this in the apply phase
- Keep `userId` in the INSERT for legacy compat but make it nullable

---

## Phase 4: MCP Tools

### ✅ T-010: Migrate existing tools.ts (userId → agentId)

**Files**: `src/mcp/tools.ts`
**Depends on**: T-009
**Effort**: Medium
**Status**: ✅ Complete (PR 2, batch 2)

**Context**: Rename `userId` to `agentId` in all existing Zod schemas and handlers. Change `userId` references in `create_event`, `list_events`, `get_daily_summary`. `get_event`, `update_event`, `delete_event`, `parse_event_text` remain unchanged.

**Acceptance Criteria**:
- [x] `CreateEventArgsSchema`: `userId` → `agentId`, `z.string().default('default')` (not `.min(1)`)
- [x] `ListEventsArgsSchema`: `userId` → `agentId`, default `'default'`
- [x] `DailySummaryArgsSchema`: `userId` → `agentId`, default `'default'`
- [x] All handler calls to eventService pass `agentId` instead of `userId`
- [x] `toolDefinitions` descriptions and property names updated
- [x] `parse_event_text` and all eventId-based tools unchanged

**Implementation Notes**:
- `agentId` is NOT required (`z.string().default('default')`) — this is a key spec requirement (FR-03)
- Change `handleCreateEvent` to pass `agentId` in both NLP and structured paths
- Test fixtures in `tools.test.ts` need matching updates (T-017)

---

### ✅ T-011: Add search_events tool

**Files**: `src/mcp/tools.ts`
**Depends on**: T-010, T-006
**Effort**: Small
**Status**: ✅ Complete (PR 2, batch 2)

**Context**: Add `search_events` MCP tool that wraps `searchService.searchEvents`.

**Acceptance Criteria**:
- [x] Zod schema `SearchEventArgsSchema` with `agentId` (default `'default'`), `query` (required, min 1), `limit` (optional, default 20)
- [x] Handler `handleSearchEvents` calls `searchService.searchEvents(agentId, query, limit)`
- [x] Exported in `toolHandlers` and `toolDefinitions`
- [x] Tool definition description documents input schema

**Implementation Notes**:
- Import `searchService` at top of tools.ts
- Follow exact pattern of existing handlers: try/catch with `toMcpError`

---

### ✅ T-012: Add find_free_slots tool

**Files**: `src/mcp/tools.ts`
**Depends on**: T-010, T-007
**Effort**: Small
**Status**: ✅ Complete (PR 2, batch 2)

**Context**: Add `find_free_slots` MCP tool wrapping `slotService.findFreeSlots`.

**Acceptance Criteria**:
- [x] Zod schema with `agentId`, `date` (regex `^\d{4}-\d{2}-\d{2}$`), `durationMinutes` (default 60), `startHour` (default 8), `endHour` (default 20)
- [x] Handler calls `slotService.findFreeSlots(agentId, date, durationMinutes, startHour, endHour)`
- [x] Registered in `toolHandlers` and `toolDefinitions`

**Implementation Notes**:
- Import `slotService` at top
- Validate `date` format with regex in Zod

---

### ✅ T-013: Add check_conflicts tool

**Files**: `src/mcp/tools.ts`
**Depends on**: T-010, T-008
**Effort**: Small
**Status**: ✅ Complete (PR 2, batch 2)

**Context**: Add `check_conflicts` MCP tool wrapping `conflictService.checkConflicts`.

**Acceptance Criteria**:
- [x] Zod schema with `agentId`, `startTime` (ISO), `endTime` (ISO), `excludeEventId` (optional)
- [x] Handler calls `conflictService.checkConflicts(agentId, startTime, endTime, excludeEventId)`
- [x] Registered in `toolHandlers` and `toolDefinitions`

---

### ✅ T-014: Add get_agenda tool

**Files**: `src/mcp/tools.ts`
**Depends on**: T-010, T-009
**Effort**: Medium
**Status**: ✅ Complete (PR 2, batch 2)

**Context**: Add `get_agenda` MCP tool returning formatted agenda. Supports date or date range, text or JSON format.

**Acceptance Criteria**:
- [x] Zod schema with `agentId`, `date` (optional), `startDate` (optional), `endDate` (optional), `format` (`'text'` | `'json'`, default `'text'`)
- [x] Handler: fetch events via `eventService.getEventsByDate` or `getEventsByDateRange`
- [x] In `'text'` mode: returns human-readable multi-line string sorted by time
- [x] In `'json'` mode: returns raw event array as JSON
- [x] Registered in `toolHandlers` and `toolDefinitions`

**Implementation Notes**:
- Must validate at least `date` or (`startDate` + `endDate`) is provided
- Text format example: `10:00 → 11:00: Reunión con equipo\n14:00 → 15:00: Dentista`
- Sort events by `startTime` before formatting

---

## Phase 5: Resources and Server

### ✅ T-015: Update resources.ts

**Files**: `src/mcp/resources.ts`
**Depends on**: T-009
**Effort**: Medium
**Status**: ✅ Complete (PR 2, batch 2)

**Context**: Rename resource URI scheme from `voiceagenda://` to `agent-calendar://`. Update `userId` references to `agentId` in descriptions and handlers. Change query parameter from `userId` to `agentId` (default `'default'`).

**Acceptance Criteria**:
- [x] `uriTemplate` values: `agent-calendar://events/{date}`, `agent-calendar://events/{date}/summary`, `agent-calendar://event/{id}`
- [x] All descriptions reference `agentId` instead of `userId`
- [x] `handleReadResource` parses `agentId` from query params, falls back to `'default'`
- [x] All calls to `eventService` pass `agentId` instead of `userId`
- [x] `voiceagenda://` does NOT appear anywhere in the file

**Implementation Notes**:
- Replace the URI normalization from `voiceagenda://` to `agent-calendar://`
- `url.searchParams.get('agentId') ?? 'default'` — not required, has default
- The `new URL()` normalization: `uri.replace(/^agent-calendar:\/\//, 'https://agent-calendar/')`

---

### ✅ T-016: Create CLI entry point and update server

**Files**: `src/index.ts` (new), `bin/cli.js` (new), `src/mcp/server.ts` (update)
**Depends on**: T-010, T-015
**Effort**: Medium
**Status**: ✅ Complete (PR 2, batch 2)

**Context**: Create `src/index.ts` as the main entry point with process.argv-based CLI. Commands: `init` (DB setup), default (start MCP stdio server), `--help`, `--version`. Update `server.ts` with new name/version. Create `bin/cli.js` as shebang wrapper.

**Acceptance Criteria**:
- [x] `src/cli.ts` exports `main()` that parses args via yargs
- [x] `agent-calendar` (default): calls `runServer()` from server.ts
- [x] `agent-calendar init`: calls `initialize()` from database.ts with migration logic
- [x] `agent-calendar --help`: prints usage
- [x] `agent-calendar --version`: prints package version
- [x] `server.ts`: server name `agent-calendar-mcp`, version from package.json
- [x] `bin/cli.js`: shebang `#!/usr/bin/env node`, `require('../dist/cli.js')`
- [x] `mcp/index.ts`: deleted (replaced by cli.ts entry point)
- [x] Exit code 0 on success, 1 on error

**Implementation Notes**:
- yargs minimal usage: `.command('init', '...', handlerFn)`, `.demandCommand(0)`, `.strict()`
- `server.ts`: update `{ name: 'agent-calendar-mcp', version: '1.0.0' }`
- `cli.ts` should use `process.argv` and `require('../package.json').version` for version
- DB init should detect legacy `voiceagenda.db` and migrate (copy + ALTER TABLE + DROP TABLE)
- Migration: copy legacy DB, run ALTER TABLE ADD COLUMN, UPDATE SET agentId = userId, DROP TABLE IF EXISTS for removed tables

---

## Phase 6: Tests

### ✅ T-017: Update existing tests for new schema

**Files**: `src/mcp/__tests__/tools.test.ts`, `src/mcp/__tests__/server.test.ts`, `src/mcp/__tests__/errors.test.ts`
**Depends on**: T-010, T-015
**Effort**: Medium
**Status**: ✅ Complete

**Context**: Update test fixtures and assertions to use `agentId` instead of `userId`. Update server.test.ts to expect 11 tools and new resource URIs.

**Acceptance Criteria**:
- [x] `tools.test.ts`:
  - [x] Mock event: `userId` → `agentId: 'user1'` (or keep userId as optional)
  - [x] All `create_event` calls use `agentId: 'user1'` instead of `userId: 'user1'`
  - [x] All `list_events` calls use `agentId` instead of `userId`
  - [x] All `get_daily_summary` calls use `agentId` instead of `userId`
  - [x] `createEvent` expectations use `agentId` in the expected object
  - [x] Test for `agentId` default value `'default'` when not provided
- [x] `server.test.ts`:
  - [x] `toolHandlers` count check: 7 → 11 (7 existing + 4 new)
  - [x] Resource templates check: `voiceagenda://` → `agent-calendar://`
- [x] All tests pass with `npm test`

**Implementation Notes**:
- `server.test.ts` line 36: `expect(names).toHaveLength(11)` (was 7)
- `server.test.ts` lines 66-68: URIs changed to `agent-calendar://`
- The `mockEvent` object should keep `userId` as it's still a valid field (deprecated)
- Add tests for `agentId` default behavior: calling without `agentId` should work

---

### ✅ T-018: New tests for search, slots, conflicts, agenda

**Files**: `src/services/__tests__/searchService.test.ts` (new), `src/services/__tests__/slotService.test.ts` (new), `src/services/__tests__/conflictService.test.ts` (new), `src/mcp/__tests__/tools.test.ts` (extend), `src/services/__tests__/eventService.test.ts` (new if time allows)
**Depends on**: T-006, T-007, T-008, T-011, T-012, T-013, T-014
**Effort**: Large
**Status**: ✅ Complete

**Context**: Cover new services and tools with unit tests. Each service test mocks the DB layer. Tool tests mock the services.

**Acceptance Criteria**:
- [x] `searchService.test.ts`:
  - [x] Mock DB and test exact SQL + ordering
  - [x] Test matching title, description, both
  - [x] Test empty query returns empty array
  - [x] Test limit parameter
- [x] `slotService.test.ts`:
  - [x] Events at 9-11, 14-15 → free slots at 11-14, 15-20
  - [x] No events → one slot covering full business hours
  - [x] Events fill entire day → no slots
  - [x] Custom durationMinutes filters short gaps
  - [x] Custom startHour/endHour
- [x] `conflictService.test.ts`:
  - [x] Overlapping intervals → hasConflict true
  - [x] Non-overlapping → false
  - [x] Exact containment → true
  - [x] Exclusion works (excludeEventId)
- [x] `tools.test.ts` extensions:
  - [x] `search_events` handler test (mock searchService)
  - [x] `find_free_slots` handler test (mock slotService)
  - [x] `check_conflicts` handler test (mock conflictService)
  - [x] `get_agenda` handler test (mock eventService, both text and JSON formats)
- [x] Coverage > 90% for new services

**Implementation Notes**:
- Use `jest.mock` at module level for service tests that import `db` directly
- For tool handler tests, mock the new service modules similar to existing pattern
- `searchService.ts` directly imports `db` — mock `../../config/database`
- `slotService.ts` and `conflictService.ts` also import `db` directly

---

## Phase 7: Documentación y distribución

### ✅ T-019: Write README.md

**Files**: `README.md`
**Depends on**: T-016
**Effort**: Medium
**Status**: ✅ Complete

**Context**: Create a comprehensive README for npm distribution. Covers installation, MCP configuration, all tools, resources, migration, and development.

**Acceptance Criteria**:
- [x] Quick-start: `npx agent-calendar init` then add to MCP config
- [x] MCP config examples for Claude Desktop and Cline
- [x] Full table of all 11 MCP tools with descriptions and input schemas
- [x] Resource templates documentation
- [x] Env vars: `AGENT_CALENDAR_DB_PATH`
- [x] Migration guide from VoiceAgenda
- [x] Development setup: clone, install, build, test
- [x] License section

**Implementation Notes**:
- Use clear, neutral English (technical documentation)
- Include `json` code blocks for MCP config examples
- Link to npm page and GitHub repo

---

### ✅ T-020: Create .npmignore and prepublish scripts

**Files**: `.npmignore` (new), `package.json` (update)
**Depends on**: T-016, T-019
**Effort**: Small
**Status**: ✅ Complete

**Context**: Ensure only distributable files are published to npm. Add prepublish/version scripts.

**Acceptance Criteria**:
- [x] `.npmignore` excludes: `src/`, `tsconfig*.json`, `node_modules/`, `__tests__/`, `.env`, `.git/`
- [x] `package.json` `files` field or `.npmignore` coverage ensures only `dist/`, `bin/`, `README.md`, `package.json` are published
- [x] `npm pack --dry-run` shows only intended files

**Implementation Notes**:
- Since we have `dist/` for compiled JS and `bin/` for CLI entry, include both
- `README.md`, `LICENSE` (if exists), `package.json` are always included by npm
- Test with `npm pack --dry-run` before publish

---

### T-021: Review Workload Forecast

This document includes the forecast above. No additional code task needed — this task is informational.

---

## Implementation Order

Phase order is strict: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7.

Within Phase 1, T-001/T-003/T-004 can run in parallel. T-002 depends on T-001. T-005 depends on T-001+T-002+T-003.

Within Phase 4: T-010 must come first (foundation), then T-011/T-012/T-013/T-014 can run in parallel (they add independent tools).

Within Phase 5: T-015 (resources) is independent of T-016 (CLI) — both depend on earlier phases but can run in parallel for efficiency.

Within Phase 6: T-017 and T-018 are independent and can run in parallel.

## Review Workload Forecast

### Total estimated changed lines: ~750 additions + ~530 deletions (backend) + frontend directory

### Chained PRs recommended: Yes

### 400-line budget risk: High

### Decision needed before apply: Yes — this is a large pivot. Recommend splitting into 3 chained PRs:
- PR 1: Phase 1 + Phase 2 + Phase 3 (cleanup, schema, services, eventService) — base branch: feature/agent-calendar
- PR 2: Phase 4 + Phase 5 (tools, resources, CLI) — base branch: PR 1 branch
- PR 3: Phase 6 + Phase 7 (tests, docs) — base branch: PR 2 branch

Chain strategy: feature-branch-chain (accumulates into `feature/agent-calendar`, only that merges to main).

---

## Closure

**All 20 implementation tasks complete.** The single CRITICAL issue (CRITICAL-01: `src/mcp/index.ts` not deleted, `package.json` `main` pointing to old path) was fixed post-verify. 92/92 tests passing, 0 TS errors, 11 MCP tools, 3 resource templates.

**Final state**: `agent-calendar` MCP server ready for npm publish.
