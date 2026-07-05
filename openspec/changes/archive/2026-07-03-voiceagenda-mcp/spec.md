# MCP Server Specification

## Purpose

Standalone MCP server exposing Firestore-backed VoiceAgenda ops as tools/resources via stdio. Wraps `eventService.ts` (CRUD) and `voiceParser.ts` (NLP).

## Requirements

### Requirement: Server Bootstrap

MUST init `@modelcontextprotocol/sdk` `Server` with stdio transport.

#### Scenario: Clean start
- GIVEN valid Firebase credentials
- WHEN server starts
- THEN it binds stdio and exposes 7 tools + 3 resources

#### Scenario: Credential failure
- GIVEN missing `serviceAccountKey.json`
- WHEN server starts
- THEN it fails before any tool runs

### Requirement: create_event tool

MUST accept `{ userId, title, date, startTime, endTime }` (structured) OR `{ userId, text }` (NLP). With text, MUST parse via `voiceParser` and persist as `createdVia: 'voice'`.

#### Scenario: Structured
- GIVEN valid userId, title, date, startTime, endTime
- WHEN create_event called
- THEN it persists and returns Event with generated id

#### Scenario: NLP
- GIVEN userId + text "mañana reunión de 3 a 4"
- WHEN create_event(text) called
- THEN it parses, persists, returns Event with createdVia: 'voice'

#### Scenario: Validation error
- GIVEN neither fields nor text
- WHEN create_event called
- THEN it returns an error

### Requirement: list_events tool

MUST accept `{ userId, date?, startDate?, endDate? }`. Results sorted by startTime.

#### Scenario: By date
- GIVEN events on that date
- WHEN list_events(date) called
- THEN it returns events sorted by startTime

#### Scenario: By range
- GIVEN events across days
- WHEN list_events(startDate, endDate) called
- THEN it returns events sorted by date then startTime

#### Scenario: Empty
- GIVEN no matching events
- THEN it returns empty array

### Requirement: Event CRUD tools

MUST expose `get_event({ eventId })`, `update_event({ eventId, ...fields })`, `delete_event({ eventId })`. Each delegates to `eventService`.

#### Scenario: Get found
- GIVEN valid eventId
- WHEN get_event called
- THEN it returns the Event

#### Scenario: Update partial
- GIVEN existing eventId
- WHEN update_event({ eventId, title: "New" }) called
- THEN it updates only given fields and returns updated Event

#### Scenario: Delete existing
- GIVEN valid eventId
- WHEN delete_event called
- THEN it deletes and returns success

#### Scenario: Not found (all three)
- GIVEN non-existent eventId
- WHEN get_event / update_event / delete_event called
- THEN each returns an error

### Requirement: get_daily_summary tool

MUST accept `{ userId, date }`.

#### Scenario: Day with events
- GIVEN 3 events on that date
- WHEN get_daily_summary called
- THEN it returns totalEvents, firstEventTime, lastEventTime

#### Scenario: Empty day
- GIVEN no events on that date
- THEN it returns totalEvents: 0

### Requirement: parse_event_text tool

MUST accept `{ text, referenceDate? }`, call `voiceParser`, return ParsedVoiceEvent. MUST NOT persist.

#### Scenario: Parse success
- GIVEN text "reunión de 3 a 4 de la tarde"
- WHEN parse_event_text called
- THEN it returns confidence > 0.5 AND writes nothing to Firestore

#### Scenario: Low confidence
- GIVEN text "dentista" with no time
- WHEN parse_event_text called
- THEN it returns confidence <= 0.5

### Requirement: Resource URIs

MUST expose `voiceagenda://events/{date}`, `voiceagenda://events/{date}/summary`, `voiceagenda://event/{id}` as read-only resources.

#### Scenario: Events list
- GIVEN valid date
- WHEN client reads voiceagenda://events/{date}
- THEN it returns formatted events

#### Scenario: Event detail
- GIVEN valid eventId
- WHEN client reads voiceagenda://event/{id}
- THEN it returns the event

### Requirement: User isolation

All tools MUST scope by `userId`. No tool SHALL return/mutate another user's events.

#### Scenario: Cross-user
- GIVEN user A and B each have events
- WHEN listing for user A
- THEN user B's events do not appear

### Requirement: Build and scripts

SHOULD include `tsconfig.mcp.json` (compile `src/mcp/` → `dist/mcp/`) and npm scripts `mcp` / `build:mcp`.

#### Scenario: Build
- GIVEN valid tsconfig
- WHEN npm run build:mcp
- THEN it compiles without errors

#### Scenario: Dev start
- GIVEN compiled output
- WHEN npm run mcp
- THEN it starts server on stdio
