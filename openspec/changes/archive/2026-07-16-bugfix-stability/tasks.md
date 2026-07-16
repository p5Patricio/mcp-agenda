# Tasks: Bugfix Stability

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~270 lines (additions + deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (all 5 batches) |
| Delivery strategy | ask-on-risk |
| Chain strategy | N/A |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: N/A
400-line budget risk: Low

## Phase 1: Validation Fixes (Batch 1)

### T-001: ISO regex accepts optional seconds and milliseconds
- **Batch**: 1 — Validation
- **Files**: 
  - `backend/src/mcp/tools.ts` (line 21)
  - `backend/src/mcp/__tests__/tools.test.ts`
- **Depends on**: None
- **Steps** (Strict TDD):
  1. **RED**: Write 5 test cases in `tools.test.ts`:
     - Accept `2026-07-10T09:00` (no seconds)
     - Accept `2026-07-10T09:00:00` (with seconds)
     - Accept `2026-07-10T09:00:00.000Z` (with milliseconds)
     - Reject `2026/07/10 09:00` (no T separator)
     - Reject `abcd` (invalid format)
  2. Run tests → expect 5 failures
  3. **GREEN**: Update `isoDateTimeRegex` in `tools.ts` line 21:
     ```typescript
     const isoDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?Z?)?$/;
     ```
  4. Run tests → expect all 5 pass
  5. **REFACTOR**: No refactoring needed
- **Verification**: `cd backend && npm test` — all 5 ISO regex tests pass
- **Effort**: S

### T-002: referenceDate validation rejects invalid dates
- **Batch**: 1 — Validation
- **Files**: 
  - `backend/src/mcp/tools.ts` (lines 223-246, `handleParseEventText`)
  - `backend/src/mcp/__tests__/tools.test.ts`
- **Depends on**: None
- **Steps** (Strict TDD):
  1. **RED**: Write test in `tools.test.ts`:
     - Call `handleParseEventText({ text: "mañana", referenceDate: "not-a-date" })`
     - Expect response with `isError: true` and `error: 'Invalid referenceDate format'`
  2. Run test → expect failure
  3. **GREEN**: Add validation in `handleParseEventText`:
     ```typescript
     if (parsed.referenceDate) {
       referenceDate = new Date(parsed.referenceDate);
       if (isNaN(referenceDate.getTime())) {
         return {
           content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid referenceDate format' }) }],
           isError: true,
         };
       }
     }
     ```
  4. Run test → expect pass
  5. **REFACTOR**: No refactoring needed
- **Verification**: `cd backend && npm test` — referenceDate validation test passes
- **Effort**: S

## Phase 2: NLP Core Fixes (Batch 2)

### T-003: "mañana" disambiguation — weekday + morning vs standalone
- **Batch**: 2 — NLP Core
- **Files**: 
  - `backend/src/services/voiceParser.ts` (lines 15-34, `getDateOverride`)
  - `backend/src/__tests__/voiceParser.test.ts`
- **Depends on**: None
- **Steps** (Strict TDD):
  1. **RED**: Write 2 tests in `voiceParser.test.ts` (refDate = Wednesday 2026-07-15):
     - `"cita el martes por la mañana"` → date = 2026-07-14 (Tuesday), title = "Cita"
     - `"mañana tengo dentista"` → date = 2026-07-16 (Thursday)
  2. Run tests → expect failures
  3. **GREEN**: Add to `getDateOverride()` in `voiceParser.ts`:
     ```typescript
     // Check for weekday + "por la mañana" pattern
     const mananaMorning = text.match(
       /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b.*\bpor\s+la\s+ma[ñn]ana\b/i
     );
     if (mananaMorning) {
       const weekdays: Record<string, number> = {
         domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
         jueves: 4, viernes: 5, sábado: 6, sabado: 6,
       };
       const dayName = mananaMorning[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
       const targetDay = weekdays[dayName];
       if (targetDay !== undefined) {
         const d = new Date(referenceDate);
         const currentDay = d.getDay();
         let diff = targetDay - currentDay;
         if (diff >= 0) diff -= 7; // always past weekday
         d.setDate(d.getDate() + diff);
         d.setHours(0, 0, 0, 0);
         return d;
       }
     }
     ```
  4. Run tests → expect pass
  5. **REFACTOR**: No refactoring needed
- **Verification**: `cd backend && npm test` — both mañana tests pass
- **Effort**: M

### T-004: Date expressions — "próxima semana", "dentro de N días", "en una semana"
- **Batch**: 2 — NLP Core
- **Files**: 
  - `backend/src/services/voiceParser.ts` (lines 15-34, `getDateOverride`)
  - `backend/src/__tests__/voiceParser.test.ts`
- **Depends on**: None
- **Steps** (Strict TDD):
  1. **RED**: Write 3 tests in `voiceParser.test.ts` (refDate = Wednesday 2026-07-15):
     - `"reunión la próxima semana"` → date = 2026-07-20 (Monday)
     - `"cita dentro de 3 días"` → date = 2026-07-18
     - `"cita en una semana"` → date = 2026-07-22
  2. Run tests → expect failures
  3. **GREEN**: Add to `getDateOverride()` in `voiceParser.ts`:
     ```typescript
     // "la próxima semana" → next Monday
     if (/\bla\s+pr[oó]xima\s+semana\b/i.test(text)) {
       const d = new Date(referenceDate);
       const dayOfWeek = d.getDay();
       const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
       d.setDate(d.getDate() + daysUntilMonday);
       d.setHours(0, 0, 0, 0);
       return d;
     }

     // "dentro de N días" → refDate + N days
     const dentroMatch = text.match(/\bdentro\s+de\s+(\d+)\s+d[ií]as\b/i);
     if (dentroMatch) {
       const d = new Date(referenceDate);
       d.setDate(d.getDate() + parseInt(dentroMatch[1], 10));
       d.setHours(0, 0, 0, 0);
       return d;
     }

     // "en una semana" → refDate + 7 days
     if (/\ben\s+una\s+semana\b/i.test(text)) {
       const d = new Date(referenceDate);
       d.setDate(d.getDate() + 7);
       d.setHours(0, 0, 0, 0);
       return d;
     }
     ```
  4. Run tests → expect pass
  5. **REFACTOR**: No refactoring needed
- **Verification**: `cd backend && npm test` — all 3 date expression tests pass
- **Effort**: M

### T-005: extractEndHour captures both start and end minutes
- **Batch**: 2 — NLP Core
- **Files**: 
  - `backend/src/services/voiceParser.ts` (lines 82-88, `extractEndHour`; lines 248-255, caller in `parseVoiceInput`)
  - `backend/src/__tests__/voiceParser.test.ts`
- **Depends on**: None
- **Steps** (Strict TDD):
  1. **RED**: Write test in `voiceParser.test.ts`:
     - `"cita de 3:30 a 4:45 de la tarde"` → startTime = "15:30", endTime = "16:45"
  2. Run test → expect failure
  3. **GREEN**: Update `extractEndHour` return type and implementation:
     ```typescript
     function extractEndHour(timeWindow: string): { startMinute: number; hour: number; minute: number } | null {
       const m = timeWindow.match(
         /de\s+\d{1,2}(?::(\d{2}))?\s*(?:am|pm)?\s+a\s+(\d{1,2})(?::(\d{2}))?\s*(?:am|pm)?/i,
       );
       if (!m) return null;
       return {
         startMinute: m[1] ? parseInt(m[1], 10) : 0,
         hour: parseInt(m[2], 10),
         minute: m[3] ? parseInt(m[3], 10) : 0,
       };
     }
     ```
  4. Update caller in `parseVoiceInput` (around line 248):
     ```typescript
     if (rawEndFromText && rawEndFromText.startMinute > 0) {
       startMinute = rawEndFromText.startMinute;
     }
     ```
  5. Run test → expect pass
  6. **REFACTOR**: No refactoring needed
- **Verification**: `cd backend && npm test` — time range test passes
- **Effort**: M

### T-006: extractTitle strips new date phrase patterns
- **Batch**: 2 — NLP Core
- **Files**: 
  - `backend/src/services/voiceParser.ts` (lines 113-120, `DATE_PREFIX_PATTERNS`)
  - `backend/src/__tests__/voiceParser.test.ts`
- **Depends on**: T-003, T-004 (patterns must exist)
- **Steps** (Strict TDD):
  1. **RED**: Write test in `voiceParser.test.ts`:
     - `"reunión de equipo el martes por la mañana"` → title = "Reunión de equipo"
  2. Run test → expect failure (title contains date artifacts)
  3. **GREEN**: Add to `DATE_PREFIX_PATTERNS` in `voiceParser.ts`:
     ```typescript
     /\bpor\s+la\s+ma[ñn]ana\b/gi,
     /\bla\s+pr[oó]xima\s+semana\b/gi,
     /\bdentro\s+de\s+\d+\s+d[ií]as\b/gi,
     /\ben\s+una\s+semana\b/gi,
     ```
  4. Run test → expect pass
  5. **REFACTOR**: No refactoring needed
- **Verification**: `cd backend && npm test` — title cleanup test passes
- **Effort**: S

## Phase 3: Confidence Feedback (Batch 3)

### T-007: Confidence warning in create_event and parse_event_text responses
- **Batch**: 3 — Confidence
- **Files**: 
  - `backend/src/mcp/tools.ts` (lines 106-121, `handleCreateEvent` NLP path; lines 223-246, `handleParseEventText`)
  - `backend/src/mcp/__tests__/tools.test.ts`
- **Depends on**: T-002 (handleParseEventText structure)
- **Steps** (Strict TDD):
  1. **RED**: Write 2 tests in `tools.test.ts`:
     - Mock `parseVoiceInput` returning `{ confidence: 0.3, ... }` → response includes `warning: "Low NLP confidence — review parsed fields before confirming"`
     - Mock `parseVoiceInput` returning `{ confidence: 0.8, ... }` → response has no `warning` field
  2. Run tests → expect failures
  3. **GREEN**: In `handleCreateEvent` NLP path (around line 106):
     ```typescript
     const responseObj = { ...event, confidence: parsedVoice.confidence };
     if (parsedVoice.confidence < 0.5) {
       responseObj.warning = 'Low NLP confidence — review parsed fields before confirming';
     }
     return { content: [{ type: 'text', text: JSON.stringify(responseObj) }] };
     ```
  4. In `handleParseEventText` (around line 229):
     ```typescript
     text: JSON.stringify({
       title: result.title, date: result.date,
       startTime: result.startTime, endTime: result.endTime,
       confidence: result.confidence,
       ...(result.confidence < 0.5 && { warning: 'Low NLP confidence — review parsed fields before confirming' }),
     }),
     ```
  5. Run tests → expect pass
  6. **REFACTOR**: No refactoring needed
- **Verification**: `cd backend && npm test` — both confidence tests pass
- **Effort**: S

## Phase 4: New Tool (Batch 4)

### T-008: get_upcoming_agenda tool handler and schema
- **Batch**: 4 — New Tool
- **Files**: 
  - `backend/src/mcp/tools.ts` (add schema after line 96; add handler after line 325; register in toolHandlers around line 331; add tool definition after get_agenda)
  - `backend/src/mcp/__tests__/tools.test.ts`
- **Depends on**: None
- **Steps** (Strict TDD):
  1. **RED**: Write 2 tests in `tools.test.ts`:
     - `toolHandlers.get_upcoming_agenda({ agentId: "test", limit: 5 })` is callable
     - Mock `eventService.getUpcomingAgenda` with past+future events → only future events returned
  2. Run tests → expect failures
  3. **GREEN**: Add schema in `tools.ts`:
     ```typescript
     const GetUpcomingAgendaArgsSchema = z.object({
       agentId: z.string().default('default'),
       limit: z.number().optional().default(10),
     });
     ```
  4. Add handler:
     ```typescript
     async function handleGetUpcomingAgenda(args: Record<string, unknown>): Promise<CallToolResult> {
       try {
         const parsed = GetUpcomingAgendaArgsSchema.parse(args);
         const events = await eventService.getUpcomingAgenda(parsed.agentId, parsed.limit);
         return { content: [{ type: 'text', text: JSON.stringify(events) }] };
       } catch (err) { throw toMcpError(err); }
     }
     ```
  5. Register in `toolHandlers`: `get_upcoming_agenda: handleGetUpcomingAgenda`
  6. Add tool definition:
     ```typescript
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
     }
     ```
  7. Run tests → expect pass
  8. **REFACTOR**: No refactoring needed
- **Verification**: `cd backend && npm test` — both get_upcoming_agenda tests pass
- **Effort**: M

## Phase 5: UX Polish (Batch 5)

### T-009: Tool descriptions trimmed to ≤2 sentences
- **Batch**: 5 — UX Polish
- **Files**: 
  - `backend/src/mcp/tools.ts` (lines 347-495, `toolDefinitions` array)
  - `backend/src/mcp/__tests__/tools.test.ts`
- **Depends on**: T-008 (get_upcoming_agenda definition must exist)
- **Steps** (Strict TDD):
  1. **RED**: Write test in `tools.test.ts`:
     ```typescript
     toolDefinitions.forEach(tool => {
       const sentences = tool.description.split('. ').filter(s => s.trim().length > 0);
       expect(sentences.length).toBeLessThanOrEqual(2);
     });
     ```
  2. Run test → expect failures (some descriptions exceed 2 sentences)
  3. **GREEN**: Edit each `description` in `toolDefinitions`:
     - `create_event`: "Create an event with structured fields or natural language text."
     - `list_events`: "List events by date or date range."
     - `search_events`: "Search events by text across title and description."
     - `find_free_slots`: "Find available time slots within business hours for a given date."
     - `check_conflicts`: "Check if a proposed time conflicts with existing events."
     - `get_agenda`: "Get a formatted agenda for a date or date range."
     - `get_daily_summary`: "Get a daily summary for an agent and date."
     - `parse_event_text`: "Parse natural language text into an event structure without persisting it."
     - `get_upcoming_agenda`: "Get upcoming events from today forward."
  4. Run test → expect pass
  5. **REFACTOR**: No refactoring needed
- **Verification**: `cd backend && npm test` — description length test passes
- **Effort**: S

## Final Verification

### T-010: Full regression suite passes
- **Batch**: All
- **Files**: 
  - `backend/src/mcp/__tests__/tools.test.ts`
  - `backend/src/__tests__/voiceParser.test.ts`
- **Depends on**: T-001 through T-009
- **Steps**:
  1. Run `cd backend && npm test` → all tests pass (including ≥9 new regression tests)
  2. Run `cd backend && npx tsc --noEmit` → exits with code 0
  3. Verify all 9 bugs have dedicated tests per spec table
- **Verification**: Both commands exit cleanly
- **Effort**: S

## Implementation Order

Execute in this order to minimize rework:
1. **T-001, T-002** (Batch 1) — validation fixes, no dependencies
2. **T-003, T-004, T-005** (Batch 2) — NLP core, can run in parallel
3. **T-006** (Batch 2) — depends on T-003, T-004 patterns existing
4. **T-007** (Batch 3) — confidence wiring, depends on T-002 structure
5. **T-008** (Batch 4) — new tool, independent
6. **T-009** (Batch 5) — depends on T-008 definition existing
7. **T-010** (Final) — full suite verification

## Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| Phase 1 | T-001, T-002 | Validation fixes (ISO regex, referenceDate) |
| Phase 2 | T-003, T-004, T-005, T-006 | NLP core fixes (mañana, date expressions, time ranges, title cleanup) |
| Phase 3 | T-007 | Confidence feedback wiring |
| Phase 4 | T-008 | New get_upcoming_agenda tool |
| Phase 5 | T-009 | Description trimming |
| Final | T-010 | Full regression verification |
| **Total** | **10 tasks** | **9 bug fixes + 1 verification** |

## Completion Status

- [x] T-001: ISO regex accepts optional seconds and milliseconds
- [x] T-002: referenceDate validation rejects invalid dates
- [x] T-003: "mañana" disambiguation — weekday + morning vs standalone
- [x] T-004: Date expressions — "próxima semana", "dentro de N días", "en una semana"
- [x] T-005: extractEndHour captures both start and end minutes
- [x] T-006: extractTitle strips new date phrase patterns
- [x] T-007: Confidence warning in create_event and parse_event_text responses
- [x] T-008: get_upcoming_agenda tool handler and schema
- [x] T-009: Tool descriptions trimmed to ≤2 sentences
- [x] T-010: Full regression suite passes
