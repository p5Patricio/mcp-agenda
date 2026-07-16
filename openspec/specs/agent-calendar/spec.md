# Spec: Agent Calendar MCP Server

## Overview

Pivot VoiceAgenda from a full-stack voice app into a standalone, CLI-first MCP server for AI agent calendar intelligence. Strip Express, notifications, cron, and mobile frontend. Ship a focused npm package (`agent-calendar`) with 12+ MCP tools, multi-agent identity, and NLP-driven event creation.

## Functional Requirements

### FR-01: Product rename and rebranding

| Property | Current | Target |
|---|---|---|
| Package name | `voiceagenda-backend` | `agent-calendar` |
| MCP server name | `voiceagenda-mcp` | `agent-calendar-mcp` |
| MCP server version | `1.0.0` | `1.0.0` (reset) |
| Resource URI scheme | `voiceagenda://` | `agent-calendar://` |
| Description | VoiceAgenda Backend API | MCP server for AI agent calendar management |
| DB default path | `./data/voiceagenda.db` | `./data/agent-calendar.db` |
| DB env var | `DB_PATH` | `AGENT_CALENDAR_DB_PATH` (keep `DB_PATH` as fallback) |

The README and docs MUST refer to the product as "Agent Calendar" or "Agent Calendar MCP Server".

### FR-02: CLI entry point

- The package MUST expose a `bin` script `agent-calendar` that starts the MCP server over stdio.
- Running `npx agent-calendar` or `agent-calendar` MUST start the MCP server using `StdioServerTransport`.
- Running `agent-calendar init` MUST create or upgrade the SQLite database schema and exit.
- Running `agent-calendar --help` MUST print usage instructions.
- Running `agent-calendar --version` MUST print the package version.
- The CLI MUST exit with code 0 on success and non-zero on error.

#### Scenario: Fresh `init` on empty directory

- GIVEN an empty directory with no SQLite database
- WHEN the user runs `agent-calendar init`
- THEN a new SQLite file is created at the default path
- AND all tables (events) are created with the current schema
- AND the process exits with code 0

### FR-03: Multi-agent calendar context

The identity model replaces `userId` with a free-form `agentId` string. The MCP host manages authentication and identity; Agent Calendar provides only calendar context scoped to the given `agentId`.

- All MCP tool inputs that previously required `userId` MUST accept `agentId` instead.
- The `agentId` field is a free string (MUST NOT be validated or authenticated by the server).
- `agentId` MUST default to `'default'` if not provided, enabling single-user setups without explicit identity.
- Resources exposing per-user data MUST include `agentId` as a query parameter.

#### Scenario: Agent creates an event with explicit identity

- GIVEN an agent with identity `agent-xyz`
- WHEN the agent calls `create_event` with `agentId: "agent-xyz"` and event details
- THEN the event is stored with `agentId = "agent-xyz"`
- AND a subsequent `list_events` call with the same `agentId` returns the event

#### Scenario: Default identity for single-user setups

- GIVEN an agent that does not provide an `agentId`
- WHEN the agent calls `create_event` without `agentId`
- THEN the server defaults to `agentId = "default"`
- AND the event is stored with `agentId = "default"`

### FR-04: Enhanced MCP tools

All existing tools MUST be updated to use `agentId` instead of `userId`. URI scheme MUST change from `voiceagenda://` to `agent-calendar://`.

**New tools:**

#### `search_events`

Search events by text across title and description.

| Field | Type | Required | Description |
|---|---|---|---|
| agentId | string | no | Agent identity (default: `"default"`) |
| query | string | yes | Search text |
| limit | number | no | Max results (default: 20) |

Uses SQL `LIKE '%query%'` on `title` and `description` columns. Returns matching events ordered by `date DESC, startTime DESC`.

#### `find_free_slots`

Find available time slots within a date range.

| Field | Type | Required | Description |
|---|---|---|---|
| agentId | string | no | Agent identity |
| date | string | yes | Target date (YYYY-MM-DD) |
| durationMinutes | number | no | Min slot length (default: 60) |
| startHour | number | no | Business hour start (default: 8) |
| endHour | number | no | Business hour end (default: 20) |

Returns an array of `{ start: ISO, end: ISO }` free slots sorted chronologically.

#### `check_conflicts`

Check if a proposed time conflicts with existing events.

| Field | Type | Required | Description |
|---|---|---|---|
| agentId | string | no | Agent identity |
| startTime | string | yes | Proposed start (ISO 8601) |
| endTime | string | yes | Proposed end (ISO 8601) |
| excludeEventId | string | no | Event ID to exclude (for updates) |

Returns `{ hasConflict: boolean, conflicts: Event[] }`.

#### `get_agenda`

Get a formatted agenda for a date or date range.

| Field | Type | Required | Description |
|---|---|---|---|
| agentId | string | no | Agent identity |
| date | string | no | Specific date (YYYY-MM-DD) |
| startDate | string | no | Range start |
| endDate | string | no | Range end |
| format | string | no | Output format: `"text"` (default) or `"json"` |

In `"text"` format, returns a human-readable agenda string. In `"json"` format, returns the raw event array.

#### `get_upcoming_agenda`

Returns upcoming events for an agent from today forward.

| Field | Type | Required | Description |
|---|---|---|---|
| agentId | string | no | Agent identity (default: `"default"`) |
| limit | number | no | Max results (default: 10) |

Returns array of events with date >= today, sorted by `date ASC, startTime ASC`. Delegates to `eventService.getUpcomingAgenda()`.

**Modified tools:**

| Tool | Change |
|---|---|
| `create_event` | `userId` → `agentId`. NLP dual-path. **ISO 8601 validation relaxed**: MUST accept `YYYY-MM-DDTHH:MM`, `YYYY-MM-DDTHH:MM:SS`, and `YYYY-MM-DDTHH:MM:SS.sssZ`. MUST reject formats without `T` separator or with non-numeric characters. |
| `list_events` | `userId` → `agentId`. Supports `date` or `startDate`/`endDate`. |
| `get_event` | No identity params (eventID only). Unchanged. |
| `update_event` | No identity params. Unchanged. |
| `delete_event` | No identity params. Unchanged. |
| `get_daily_summary` | `userId` → `agentId`. |
| `parse_event_text` | Renamed from `parse_event_text` → kept as auxiliary. No identity params. **MUST validate `referenceDate`**: if provided and not a valid ISO 8601 date or parseable Date, return an error response instead of producing `Invalid Date` results. |

**Tool descriptions**: All tool description strings MUST be ≤2 sentences and optimized for LLM context windows. Remove redundant implementation details.

(Previously: ISO regex rejected timestamps without seconds; `referenceDate` was not validated producing silent `Invalid Date`; `getUpcomingAgenda` was implemented in `eventService` but not exposed as an MCP tool; tool descriptions were verbose)

#### Scenario: ISO regex accepts timestamp without seconds

- GIVEN a `create_event` call with `startTime: "2026-07-10T09:00"`
- WHEN the server validates the ISO format
- THEN the timestamp is accepted without error

#### Scenario: ISO regex accepts timestamp with milliseconds

- GIVEN a `create_event` call with `startTime: "2026-07-10T09:00:00.000Z"`
- WHEN the server validates the ISO format
- THEN the timestamp is accepted without error

#### Scenario: ISO regex rejects invalid format

- GIVEN a `create_event` call with `startTime: "2026/07/10 09:00"`
- WHEN the server validates the ISO format
- THEN the server returns a validation error

#### Scenario: parse_event_text rejects invalid referenceDate

- GIVEN a `parse_event_text` call with `referenceDate: "not-a-date"`
- WHEN the server processes the request
- THEN the server returns an error response
- AND no event is created

#### Scenario: get_upcoming_agenda returns future events

- GIVEN an agent with events on past dates and future dates
- WHEN the agent calls `get_upcoming_agenda`
- THEN only events with date >= today are returned
- AND results are sorted by date ASC, startTime ASC

### FR-05: NLP-driven event creation via MCP

The existing `voiceParser` service (chrono-node for Spanish) MUST be preserved as-is. Agents create events in natural language by calling `create_event` with the `text` field.

- The `create_event` tool MUST accept a `text` field containing natural language Spanish.
- The system MUST run `parseVoiceInput(text, referenceDate)` and automatically create the event from parsed fields.
- The `referenceDate` parameter is optional; defaults to `new Date()`.
- The system MUST return the created event object including parsed `title`, `date`, `startTime`, `endTime`, and `confidence`.
- The `parse_event_text` tool MUST remain available for dry-run parsing without persistence.
- **"mañana" ambiguity**: When "mañana" appears in the pattern `weekday + "por la mañana"`, it MUST resolve as "morning" (time-of-day modifier). Standalone "mañana" MUST continue to resolve as "tomorrow".
- **Date expressions**: MUST support "la próxima semana" (→ next week's Monday), "dentro de N días" (→ today + N days), "en una semana" (→ today + 7 days).
- **Time range minutes**: `extractEndHour` MUST capture both start and end minutes in time ranges. "de 3:30 a 4:45 de la tarde" MUST produce startTime 15:30, endTime 16:45.
- **Title cleanup**: `extractTitle` MUST strip resolved date/time phrases from the extracted title (e.g., "el martes por la mañana", "la próxima semana", "dentro de 3 días").
- **Confidence feedback**: All NLP tool responses (`create_event`, `parse_event_text`) MUST include a `confidence` field (0.0–1.0). When confidence < 0.5, the response MUST include a `warning` field: `"Low NLP confidence — review parsed fields before confirming"`.

(Previously: "mañana" always resolved to "tomorrow" even in weekday morning contexts; no confidence warnings for low-quality parses; "la próxima semana" and relative-day expressions unsupported; `extractEndHour` lost start minutes producing wrong end times; `extractTitle` left date phrase artifacts in titles; confidence was computed but not surfaced to callers)

#### Scenario: Create event via NLP

- GIVEN an agent calling `create_event` with `{ agentId: "my-agent", text: "mañana tengo dentista de 3 a 4 de la tarde" }`
- WHEN the server processes the request
- THEN it runs `parseVoiceInput` to extract title "Dentista", date (tomorrow), startTime (15:00), endTime (16:00)
- AND an event is created and persisted with `createdVia: "voice"` and `rawTranscription` containing the original text
- AND the created event object is returned in the response

#### Scenario: "mañana" with weekday resolves to morning

- GIVEN `parseVoiceInput("cita el martes por la mañana", refDate=Wednesday 2026-07-15)`
- WHEN the NLP parser processes the input
- THEN date resolves to Tuesday 2026-07-14
- AND title is "Cita"

#### Scenario: Standalone "mañana" still means tomorrow

- GIVEN `parseVoiceInput("mañana tengo dentista", refDate=Wednesday 2026-07-15)`
- WHEN the NLP parser processes the input
- THEN date resolves to Thursday 2026-07-16

#### Scenario: "la próxima semana" resolves to next Monday

- GIVEN `parseVoiceInput("reunión la próxima semana", refDate=Wednesday 2026-07-15)`
- WHEN the NLP parser processes the input
- THEN date resolves to Monday 2026-07-20

#### Scenario: "dentro de N días" resolves correctly

- GIVEN `parseVoiceInput("cita dentro de 3 días", refDate=2026-07-15)`
- WHEN the NLP parser processes the input
- THEN date resolves to 2026-07-18

#### Scenario: Time range preserves both start and end minutes

- GIVEN `parseVoiceInput("cita de 3:30 a 4:45 de la tarde")`
- WHEN the NLP parser extracts the time range
- THEN startTime is 15:30
- AND endTime is 16:45

#### Scenario: Title is clean of date artifacts

- GIVEN `parseVoiceInput("reunión de equipo el martes por la mañana")`
- WHEN the NLP parser extracts the title
- THEN title is "Reunión de equipo"
- AND does NOT contain "el martes por la mañana"

#### Scenario: Low confidence triggers warning

- GIVEN an NLP input producing confidence 0.3
- WHEN `create_event` or `parse_event_text` processes it
- THEN response includes `confidence: 0.3`
- AND response includes `warning: "Low NLP confidence — review parsed fields before confirming"`

#### Scenario: High confidence produces no warning

- GIVEN an NLP input producing confidence 0.8
- WHEN `create_event` processes it
- THEN response includes `confidence: 0.8`
- AND no `warning` field is present

### FR-06: Event search

- The system MUST provide a `search_events` tool that searches events by text.
- The search MUST match against both `title` and `description` using SQL `LIKE '%query%'`.
- Results MUST be ordered by `date DESC, startTime DESC`.
- The search MUST be scoped to the given `agentId`.
- FTS5 is NOT required for v1 (documented non-goal).

#### Scenario: Successful text search

- GIVEN an agent with events titled "Dentista", "Reunión con dentista", and "Comprar leche"
- WHEN the agent calls `search_events` with `query: "dentista"`
- THEN the result contains the "Dentista" and "Reunión con dentista" events
- AND the "Comprar leche" event is NOT in the results

### FR-07: Availability and conflict detection

- `find_free_slots` MUST scan a single date and return free time blocks.
- It MUST respect configurable business hours (`startHour`/`endHour`, default 08:00–20:00).
- Slots MUST be at least `durationMinutes` long (default 60).
- `check_conflicts` MUST detect overlapping time ranges.
- Two events conflict if their time intervals overlap (partial or full).
- `excludeEventId` allows ignoring one event (for rescheduling).

#### Scenario: Find a free afternoon slot

- GIVEN an agent with events from 09:00–11:00 and 14:00–15:00 on 2026-03-20
- WHEN the agent calls `find_free_slots` with `{ agentId: "x", date: "2026-03-20", durationMinutes: 60 }`
- THEN the result includes slots `11:00–14:00` and `15:00–20:00`

#### Scenario: Conflict detection with exclusion

- GIVEN an agent with event A (14:00–15:00) and event B (15:00–16:00)
- WHEN checking conflicts for event A updated to 15:00–16:00, excluding event B
- THEN the result shows `hasConflict: false`

### FR-08: Express server removal

The Express HTTP server MUST be completely removed.

| File/Action | Status |
|---|---|
| `src/index.ts` (Express boot) | Delete |
| `src/routes/events.ts` | Delete |
| `src/routes/notifications.ts` | Delete |
| `src/services/notificationService.ts` | Delete |
| `src/services/cronJobs.ts` | Delete |
| `src/utils/dateHelpers.ts` | Keep (if used elsewhere) or delete |
| `express`, `cors`, `helmet` deps | Remove from `package.json` |
| `expo-server-sdk` | Remove from `package.json` |
| `node-cron` | Remove from `package.json` |
| `@types/express`, `@types/cors`, `@types/node-cron` | Remove from devDeps |
| `nodemon`, `ts-node` | Remove from devDeps (replace with `tsx` or `ts-node` for dev only) |

The MCP server started via `agent-calendar` CLI MUST be the only entry point. No port binding, no HTTP, no REST endpoints.

#### Scenario: No HTTP server starts

- GIVEN the `agent-calendar` package is installed
- WHEN the user runs `agent-calendar` (MCP stdio mode)
- THEN no HTTP server is started
- AND no port is bound
- AND the process communicates exclusively over stdio using the MCP protocol

### FR-09: Frontend removal

The `VoiceAgenda-Frontend` directory MUST be removed or archived. No frontend code ships with the npm package.

- The frontend repository can be archived (git tag, branch, or tarball) for reference.
- The primary git repository SHOULD be the backend directory renamed to the final package name.

### FR-10: npm distribution

- Package name MUST be `agent-calendar`.
- `package.json` MUST include a `bin` entry: `{ "agent-calendar": "./dist/cli.js" }`.
- `package.json` MUST include `"type": "commonjs"` (or omit, given current CJS build).
- The package MUST be publicly published to npm.
- A README MUST be included with:
  - Quick-start installation
  - MCP configuration example (Claude Desktop, Cline, etc.)
  - List of all MCP tools and resources
  - Configuration options (DB path)
  - Migration guide from VoiceAgenda

### FR-11: Migration from existing data

The CLI `init` command MUST detect existing VoiceAgenda databases and migrate them.

Migration steps:
1. Check if `voiceagenda.db` exists at the legacy path (relative to current DB_DIR).
2. If found and `agent-calendar.db` does NOT exist, copy and migrate.
3. Schema changes:
   - Add `agentId` column to `events` table (TEXT, NOT NULL, default 'default').
   - Copy `userId` values to `agentId`.
   - Add `calendarId` column to `events` table (TEXT, nullable, default null).
   - Keep `userId` column for backward compatibility (deprecated).
   - Drop `scheduled_notifications` table.
   - Drop `user_settings` table.
   - Create new indexes on `agentId`.
4. If `agent-calendar.db` already exists, skip migration (no auto-overwrite).

#### Scenario: Migrate legacy database

- GIVEN a `data/voiceagenda.db` file with legacy schema (events with `userId`, `scheduled_notifications`, `user_settings`)
- WHEN the user runs `agent-calendar init`
- THEN a new `data/agent-calendar.db` is created
- AND all events are copied with `userId` values mapped to `agentId`
- AND `scheduled_notifications` and `user_settings` tables are NOT present
- AND the old `voiceagenda.db` file is NOT modified

## Non-Functional Requirements

### NFR-01: Backward compatibility

- Existing `userId` values MUST be preserved as `agentId` values after migration.
- The `events.userId` column MAY be kept as a deprecated alias for one release.
- Existing NLP tests MUST pass without modification.

### NFR-02: Performance

- Event queries by `agentId` + `date` MUST use an index (`idx_events_agentId_date`).
- Text search via LIKE SHOULD complete within 500ms for databases under 10,000 events.
- The MCP server MUST start in under 2 seconds on modern hardware.

### NFR-03: Security

- No authentication is implemented (delegated to MCP host). Documented non-goal.
- Path traversal in DB path MUST be prevented (validation on `AGENT_CALENDAR_DB_PATH`).
- SQL injection MUST be prevented via parameterized queries (already the case with `better-sqlite3`).

### NFR-04: Testability

- All MCP tool handlers MUST be testable without a running MCP server (unit-testable).
- The `voiceParser` tests MUST continue to pass.
- New services (search, free slots, conflicts) MUST have >90% coverage.
- The CLI init/migrate MUST be testable with temporary directories.

### NFR-05: Documentation

- README MUST include MCP configuration snippet for at least Claude Desktop and Cline.
- Every MCP tool description MUST document its input schema and a usage example.
- The CLI MUST print valid `--help` output.

### NFR-06: Regression test coverage for stability fixes

All 9 stability fixes MUST have dedicated regression tests in the Jest suite. Tests MUST be runnable via `cd backend && npm test`. After implementation, the full suite MUST pass and `cd backend && npx tsc --noEmit` MUST exit clean with zero errors.

| Bug | Test file | Minimum assertions |
|-----|-----------|--------------------|
| ISO regex | `tools.test.ts` | 3 valid formats accepted, 2 invalid rejected |
| mañana ambiguity | `voiceParser.test.ts` | weekday+morning → Tuesday; standalone → tomorrow |
| Confidence | `tools.test.ts` | low → warning; high → no warning |
| Date expressions | `voiceParser.test.ts` | "próxima semana", "dentro de N días", "en una semana" |
| End-hour minutes | `voiceParser.test.ts` | "de 3:30 a 4:45" → 15:30/16:45 |
| get_upcoming_agenda | `tools.test.ts` | tool callable, returns future events only |
| referenceDate | `tools.test.ts` | invalid date → error response |
| Descriptions | `tools.test.ts` | all descriptions ≤ 2 sentences |
| Title cleanup | `voiceParser.test.ts` | date phrases stripped from title |

#### Scenario: Full regression suite passes

- GIVEN all 9 fixes are implemented
- WHEN `cd backend && npm test` is executed
- THEN all tests pass including ≥9 new regression tests
- AND `cd backend && npx tsc --noEmit` exits with code 0

## Data Model Changes

### Modified: events table

| Change | Detail |
|---|---|
| Column added | `agentId TEXT NOT NULL DEFAULT 'default'` |
| Column added | `calendarId TEXT` (nullable, for future multi-calendar) |
| Column kept | `userId` (deprecated, populated from agentId for backward compat) |
| Index added | `idx_events_agentId_date ON events(agentId, date)` |
| Index added | `idx_events_agentId_date_range ON events(agentId, date, startTime)` |
| Index kept | `idx_events_userId_date` (if userId column is kept) |

Existing migration copies `userId` → `agentId`. New events use `agentId` only.

### Removed: scheduled_notifications table

Entirely removed. No push notification scheduling exists in the new product. Cron jobs that poll this table are also removed.

### Removed: user_settings table

Entirely removed. No daily summary settings, timezone preferences, or push token storage exists. Agents manage their own preferences.

## MCP Tools Specification

| Tool | Status | Identity | Description |
|---|---|---|---|
| `create_event` | Modified | `userId`→`agentId` | Create event (NLP or structured) |
| `list_events` | Modified | `userId`→`agentId` | List events by date/range |
| `get_event` | Unchanged | None | Get event by ID |
| `update_event` | Unchanged | None | Update event fields |
| `delete_event` | Unchanged | None | Delete event by ID |
| `get_daily_summary` | Modified | `userId`→`agentId` | Get daily summary for date |
| `parse_event_text` | Modified | None (renamed) | Dry-run NLP parsing without creating |
| `search_events` | **New** | Yes | Text search across events |
| `find_free_slots` | **New** | Yes | Find available time slots |
| `check_conflicts` | **New** | Yes | Detect scheduling conflicts |
| `get_agenda` | **New** | Yes | Get formatted agenda for date/range |
| `get_upcoming_agenda` | **New** | Yes | Get upcoming events from today forward |

Total: 12 tools.

## MCP Resources Specification

| Resource Template | Status | Description |
|---|---|---|
| `agent-calendar://events/{date}` | Modified (renamed) | Events list for a date (query: `agentId`) |
| `agent-calendar://events/{date}/summary` | Modified (renamed) | Daily summary for a date (query: `agentId`) |
| `agent-calendar://event/{id}` | Modified (renamed) | Single event detail by ID |

## Architecture Decisions

### ADR-01: Identity as free string

**Decision**: `agentId` is a free-form string with no validation or authentication. Defaults to `"default"`.

**Rationale**: The MCP host manages authentication. Calendar context is purely scoped to an identifier. This avoids building auth infra that would duplicate the host's responsibility.

**Tradeoff**: No access control. Mitigation: this is explicitly documented as a non-goal, and the host layer (Claude Desktop, Cline, etc.) provides its own auth boundary.

### ADR-02: LIKE search (no FTS5 in v1)

**Decision**: Use SQL `LIKE '%query%'` on `title` and `description`.

**Rationale**: Zero additional dependencies. For databases under ~10,000 events, LIKE performance is acceptable. FTS5 availability varies by `better-sqlite3` build flags.

**Tradeoff**: No fuzzy matching, no relevance ranking, slower at scale. FTS5 upgrade path is documented.

### ADR-03: Express fully removed

**Decision**: No HTTP transport. MCP stdio is the only official transport.

**Rationale**: The product IS an MCP server. HTTP adds attack surface, dependencies, and distracts from the core value proposition. Users who need HTTP transport can use `mcp-proxy` externally.

**Tradeoff**: No REST API for debugging. Mitigation: all tool logic is unit-testable; `parse_event_text` can be used ad-hoc.

### ADR-04: Public npm distribution

**Decision**: Publish as public npm package.

**Rationale**: Maximum reach in the AI agent ecosystem (Claude, Cline, Continue, etc.). No auth wall for a local tool.

**Tradeoff**: Versioning discipline required. Mitigation: semver, CHANGELOG, and npm `deprecate` for broken releases.

## Scenarios

### Scenario 1: Fresh install

- GIVEN a user with Node.js 18+ installed
- WHEN the user runs `npx agent-calendar init`
- THEN a new SQLite database is created at `./data/agent-calendar.db`
- AND the events table is created with `agentId` and `calendarId` columns
- AND the process exits with code 0

### Scenario 2: First-time setup by an AI agent

- GIVEN an MCP host (e.g., Claude Desktop) configured with `agent-calendar`
- WHEN the agent starts and connects to the MCP server
- THEN the server responds to `initialize` with server name `agent-calendar-mcp` and version
- AND the host receives the full list of 11 tools
- AND the host receives the 3 resource templates

### Scenario 3: Creating an event via NLP

- GIVEN an agent configured with `agentId: "my-assistant"`
- WHEN the agent calls `create_event` with `text: "pasado mañana reunión con equipo de 10 a 12"`
- THEN the event is created on the correct date (today + 2)
- AND `startTime` is 10:00, `endTime` is 12:00
- AND `title` is "Reunión con equipo"
- AND `createdVia` is "voice"
- AND the full event object is returned

### Scenario 4: Checking available time slots

- GIVEN an agent with busy slots 09:00–10:30 and 13:00–14:30 on a given day
- WHEN the agent calls `find_free_slots` with `durationMinutes: 60`
- THEN the response includes free slots `10:30–13:00` and `14:30–20:00`
- AND each slot has `start` and `end` in ISO 8601 format

### Scenario 5: Detecting scheduling conflicts

- GIVEN an agent with an existing event at 14:00–15:00
- WHEN the agent calls `check_conflicts` with `startTime: "2026-03-20T14:30:00"` and `endTime: "2026-03-20T15:30:00"`
- THEN `hasConflict` is `true`
- AND the `conflicts` array contains the existing 14:00–15:00 event

### Scenario 6: Searching past events

- GIVEN an agent with events containing "dentista" in title and "ortodoncia" in description
- WHEN the agent calls `search_events` with `query: "ortodoncia"`
- THEN the matching event is returned
- AND results are ordered by date descending

### Scenario 7: Getting the daily agenda

- GIVEN an agent with 3 events on 2026-03-20
- WHEN the agent calls `get_agenda` with `date: "2026-03-20"` and `format: "text"`
- THEN the response is a human-readable string listing all events sorted by time

### Scenario 8: Migration from old database

- GIVEN a `data/voiceagenda.db` file with 50 events using `userId` values
- WHEN the user runs `agent-calendar init`
- THEN all 50 events are migrated to `agent-calendar.db`
- AND each event has `agentId` matching the original `userId`
- AND `scheduled_notifications` and `user_settings` tables are absent
