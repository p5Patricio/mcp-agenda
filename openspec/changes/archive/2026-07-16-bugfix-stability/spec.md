# Delta for agent-calendar

## MODIFIED Requirements

### Requirement: FR-04: Enhanced MCP tools

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

#### `get_upcoming_agenda` **[ADDED — Bug #6]**

Returns upcoming events for an agent from today forward.

| Field | Type | Required | Description |
|---|---|---|---|
| agentId | string | no | Agent identity (default: `"default"`) |
| limit | number | no | Max results (default: 10) |

Returns array of events with date >= today, sorted by `date ASC, startTime ASC`. Delegates to `eventService.getUpcomingAgenda()`.

**Modified tools:**

| Tool | Change |
|---|---|
| `create_event` | `userId` → `agentId`. NLP dual-path. **ISO 8601 validation relaxed**: MUST accept `YYYY-MM-DDTHH:MM`, `YYYY-MM-DDTHH:MM:SS`, and `YYYY-MM-DDTHH:MM:SS.sssZ`. MUST reject formats without `T` separator or with non-numeric characters. **[Bug #1]** |
| `list_events` | `userId` → `agentId`. Supports `date` or `startDate`/`endDate`. |
| `get_event` | No identity params. Unchanged. |
| `update_event` | No identity params. Unchanged. |
| `delete_event` | No identity params. Unchanged. |
| `get_daily_summary` | `userId` → `agentId`. |
| `parse_event_text` | No identity params. **MUST validate `referenceDate`**: if provided and not a valid ISO 8601 date or parseable Date, return an error response instead of producing `Invalid Date` results. **[Bug #7]** |

**Tool descriptions**: All tool description strings MUST be ≤2 sentences and optimized for LLM context windows. Remove redundant implementation details. **[Bug #8]**

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

### Requirement: FR-05: NLP-driven event creation via MCP

The existing `voiceParser` service (chrono-node for Spanish) MUST be preserved as-is. Agents create events in natural language by calling `create_event` with the `text` field.

- The `create_event` tool MUST accept a `text` field containing natural language Spanish.
- The system MUST run `parseVoiceInput(text, referenceDate)` and automatically create the event from parsed fields.
- The `referenceDate` parameter is optional; defaults to `new Date()`.
- The system MUST return the created event object including parsed `title`, `date`, `startTime`, `endTime`, and `confidence`.
- The `parse_event_text` tool MUST remain available for dry-run parsing without persistence.
- **"mañana" ambiguity [Bug #2]**: When "mañana" appears in the pattern `weekday + "por la mañana"`, it MUST resolve as "morning" (time-of-day modifier). Standalone "mañana" MUST continue to resolve as "tomorrow".
- **Date expressions [Bug #4]**: MUST support "la próxima semana" (→ next week's Monday), "dentro de N días" (→ today + N days), "en una semana" (→ today + 7 days).
- **Time range minutes [Bug #5]**: `extractEndHour` MUST capture both start and end minutes in time ranges. "de 3:30 a 4:45 de la tarde" MUST produce startTime 15:30, endTime 16:45.
- **Title cleanup [Bug #9]**: `extractTitle` MUST strip resolved date/time phrases from the extracted title (e.g., "el martes por la mañana", "la próxima semana", "dentro de 3 días").
- **Confidence feedback [Bug #3]**: All NLP tool responses (`create_event`, `parse_event_text`) MUST include a `confidence` field (0.0–1.0). When confidence < 0.5, the response MUST include a `warning` field: `"Low NLP confidence — review parsed fields before confirming"`.

(Previously: "mañana" always resolved to "tomorrow" even in weekday morning contexts; no confidence warnings for low-quality parses; "la próxima semana" and relative-day expressions unsupported; `extractEndHour` lost start minutes producing wrong end times; `extractTitle` left date phrase artifacts in titles; confidence was computed but not surfaced to callers)

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

## ADDED Requirements

### Requirement: NFR-06: Regression test coverage for stability fixes

All 9 stability fixes MUST have dedicated regression tests in the Jest suite. Tests MUST be runnable via `cd backend && npm test`. After implementation, the full suite MUST pass and `cd backend && npx tsc --noEmit` MUST exit clean with zero errors.

| Bug | Test file | Minimum assertions |
|-----|-----------|--------------------|
| #1 ISO regex | `tools.test.ts` | 3 valid formats accepted, 2 invalid rejected |
| #2 mañana ambiguity | `voiceParser.test.ts` | weekday+morning → Tuesday; standalone → tomorrow |
| #3 Confidence | `tools.test.ts` | low → warning; high → no warning |
| #4 Date expressions | `voiceParser.test.ts` | "próxima semana", "dentro de N días", "en una semana" |
| #5 End-hour minutes | `voiceParser.test.ts` | "de 3:30 a 4:45" → 15:30/16:45 |
| #6 get_upcoming_agenda | `tools.test.ts` | tool callable, returns future events only |
| #7 referenceDate | `tools.test.ts` | invalid date → error response |
| #8 Descriptions | `tools.test.ts` | all descriptions ≤ 2 sentences |
| #9 Title cleanup | `voiceParser.test.ts` | date phrases stripped from title |

#### Scenario: Full regression suite passes

- GIVEN all 9 fixes are implemented
- WHEN `cd backend && npm test` is executed
- THEN all tests pass including ≥9 new regression tests
- AND `cd backend && npx tsc --noEmit` exits with code 0
