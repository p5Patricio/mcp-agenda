## Exploration: mcp-agenda Stability Bug Fixes

### Current State

The mcp-agenda project is an MCP server for AI agent calendar management with:
- **Backend**: TypeScript/Node.js with SQLite (better-sqlite3)
- **NLP**: chrono-node for Spanish date/time parsing
- **Validation**: Zod schemas for MCP tool input
- **Testing**: Jest with strict TDD mode enabled
- **Architecture**: Clean separation (mcp/tools.ts → services/* → config/database.ts)

Key files:
- `backend/src/mcp/tools.ts` (496 lines) — MCP tool definitions and handlers
- `backend/src/services/voiceParser.ts` (284 lines) — NLP parsing with chrono-node
- `backend/src/services/eventService.ts` (140 lines) — Event CRUD operations
- `backend/src/mcp/server.ts` (65 lines) — MCP server setup
- `backend/src/types/index.ts` (33 lines) — TypeScript interfaces

---

### Bug Analysis

#### CRITICAL BUGS

**1. ISO Regex Too Strict**
- **Location**: `tools.ts:20-21`
- **Current behavior**: 
  ```typescript
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const isoDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  ```
- **Problem**: DateTime regex requires seconds (`:00`), rejecting valid ISO 8601:
  - `"2026-07-10T09:00"` → **REJECTED** (no seconds)
  - `"2026-07-10T09:00:00.000Z"` → ACCEPTED (has seconds)
  - `"2026-07-10T09:00:00Z"` → ACCEPTED
  - `"2026-07-10T09:00:00+02:00"` → ACCEPTED
- **Impact**: CRITICAL — LLMs often generate ISO without seconds, causing validation failures
- **Fix**: Make seconds optional: `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/`

**2. "mañana" Ambiguity in Date-Only Context**
- **Location**: `voiceParser.ts:15-34` (getDateOverride function)
- **Current behavior**: No override for "mañana" — relies on chrono-node
- **Problem**: chrono-node Spanish parser generally handles "mañana" correctly as "tomorrow", BUT:
  - "cita el martes por la mañana" → chrono parses TWO spans: "martes" (July 21) and "mañana" (July 17 as "tomorrow")
  - The second "mañana" should be "morning" (time qualifier for Tuesday), not a separate "tomorrow" date
  - Code uses `results[0]` which mitigates this, but the spurious second result pollutes parsing
- **Test evidence**:
  ```
  Input: cita el martes por la mañana
  Span 1: "martes" → 2026-07-21 (correct)
  Span 2: "mañana" → 2026-07-17 (wrong - should be time qualifier, not date)
  ```
- **Impact**: MEDIUM — code handles it via `results[0]` + `isCertain('hour')`, but edge cases exist
- **Fix**: Add override to detect "mañana" after weekday + "por la" pattern and force it to be a time qualifier, not a date

**3. No Confidence Feedback to LLM**
- **Location**: `voiceParser.ts:168-172`, `tools.ts:106-122`
- **Current behavior**:
  ```typescript
  function computeConfidence(hasTime: boolean, hasEndTime: boolean): number {
    if (hasTime && hasEndTime) return 0.95;
    if (hasTime) return 0.80;
    return 0.50;
  }
  ```
  When chrono returns no results: `confidence: 0.10` (line 209)
- **Problem**: When confidence < 0.5 (e.g., 0.10 for no NLP match, 0.50 for date-only), the event is created silently without warning the LLM
- **Impact**: MEDIUM — LLM doesn't know parse quality is poor, can't inform user
- **Fix**: Return confidence in tool response and add warning text when < 0.5

---

#### MEDIUM BUGS

**4. Missing Date Expressions**
- **Location**: `voiceParser.ts:15-34`
- **Current behavior**: `getDateOverride` only handles:
  - "pasado mañana" (day after tomorrow)
  - "el N de este mes" (the Nth of this month)
- **Missing expressions**:
  - "la próxima semana" → chrono returns `[]` (not parsed at all)
  - "dentro de 3 días" → chrono DOES parse it correctly (surprise!)
  - "en una semana" → chrono DOES parse it correctly
- **Test evidence**:
  ```
  Input: la próxima semana reunión
  chrono result: [] (empty)
  parseVoiceInput output: confidence 0.1, date falls back to referenceDate
  
  Input: dentro de 3 días cita
  chrono result: 2026-07-19 (correct)
  parseVoiceInput output: confidence 0.5 (no time)
  ```
- **Impact**: MEDIUM — "la próxima semana" completely fails
- **Fix**: Add "la próxima semana" override to `getDateOverride` (next Monday from referenceDate)

**5. extractEndHour Loses Start Minutes (Edge Case)**
- **Location**: `voiceParser.ts:82-88`, `voiceParser.ts:238`
- **Current behavior**:
  ```typescript
  // Line 82-88: extractEndHour only captures END time from text
  function extractEndHour(timeWindow: string): { hour: number; minute: number } | null {
    const m = timeWindow.match(/de\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+a\s+(\d{1,2})(?::(\d{2}))?\s*(?:am|pm)?/i);
    if (!m) return null;
    return { hour: parseInt(m[1], 10), minute: m[2] ? parseInt(m[2], 10) : 0 };
  }
  
  // Line 238: startMinute comes from chrono
  startMinute = timeResult.start.get('minute') ?? 0;
  ```
- **Problem**: If chrono fails to parse start minutes (e.g., "de 3:30 a 4:45" where chrono only captures "de 3"), the startMinute defaults to 0
- **Test evidence**: In practice, chrono DOES capture minutes correctly:
  ```
  Input: reunión de 3:30 a 4:45 de la tarde
  Output: startTime: 15:30, endTime: 16:45 ✓
  ```
- **Impact**: LOW — works correctly in tested cases, but defensive coding would extract start time from regex too
- **Fix**: Extract BOTH start and end times from regex in `extractEndHour` (rename to `extractTimeRange`)

**6. getUpcomingAgenda Not Exposed as MCP Tool**
- **Location**: `eventService.ts:65-80` (exists), `tools.ts` (missing)
- **Current behavior**: `getUpcomingAgenda(agentId, limitDays)` exists in eventService but has no tool handler
- **Impact**: MEDIUM — useful functionality not accessible via MCP
- **Fix**: Add `get_upcoming_agenda` tool with schema and handler

**7. Invalid referenceDate in parse_event_text Fails Silently**
- **Location**: `tools.ts:223-246` (handleParseEventText)
- **Current behavior**:
  ```typescript
  const referenceDate = parsed.referenceDate ? new Date(parsed.referenceDate) : undefined;
  ```
- **Problem**: No validation — if invalid ISO string, `new Date()` returns `Invalid Date`, which propagates silently
- **Test needed**: Would need to verify behavior with invalid date string
- **Impact**: LOW-MEDIUM — silent failures
- **Fix**: Validate referenceDate with regex or `isNaN(date.getTime())` check, throw error if invalid

---

#### LOW BUGS

**8. Tool Descriptions Are Verbose**
- **Location**: `tools.ts:345-495`
- **Current behavior**: Descriptions explain both NLP and structured paths in detail
- **Example**:
  ```typescript
  description: 'Create an event. Provide { agentId, text } for NLP parsing or { agentId, title, date, startTime, endTime } for structured creation.'
  ```
- **Impact**: LOW — LLMs might struggle with optimal usage, but functional
- **Fix**: Simplify descriptions, move detailed usage to tool documentation

**9. extractTitle Edge Cases**
- **Location**: `voiceParser.ts:137-162`
- **Current behavior**: Uses bitmask to remove time/date patterns from text
- **Problem**: Can leave artifacts if chrono captures partial spans
- **Test evidence**:
  ```
  Input: tengo que ir al dentista mañana a las 3
  Output title: "Al dentista" ✓ (correct)
  
  Input: reunión de equipo el viernes a las 10 de la mañana
  Output title: "Reunión de equipo" ✓ (correct)
  
  Input: cumpleaños de Juan el 20 de este mes
  Output title: "Cumpleaños de Juan" ✓ (correct)
  
  Input: reunión la próxima semana con el equipo
  Output title: "Reunión la próxima semana con el equipo" ✗ (should remove "la próxima semana")
  ```
- **Impact**: LOW — title quality issues in edge cases
- **Fix**: Add "la próxima semana" to DATE_PREFIX_PATTERNS once bug #4 is fixed

---

### Affected Areas

| File | Lines | Bugs | Impact |
|------|-------|------|--------|
| `tools.ts` | 20-21 | #1 | CRITICAL |
| `tools.ts` | 223-246 | #7 | LOW-MEDIUM |
| `tools.ts` | 345-495 | #8 | LOW |
| `tools.ts` | (new) | #6 | MEDIUM |
| `voiceParser.ts` | 15-34 | #2, #4 | CRITICAL, MEDIUM |
| `voiceParser.ts` | 82-88 | #5 | LOW |
| `voiceParser.ts` | 113-120 | #9 | LOW |
| `voiceParser.ts` | 168-172 | #3 | MEDIUM |
| `voiceParser.ts` | 238 | #5 | LOW |
| `eventService.ts` | 65-80 | #6 | MEDIUM |

---

### Dependencies Between Fixes

**No hard dependencies**, but logical grouping exists:

1. **Group A: NLP improvements** (bugs #2, #4, #5, #9)
   - All in `voiceParser.ts`
   - #4 and #9 both need "la próxima semana" pattern
   - #5 is defensive improvement to #4's context

2. **Group B: Validation fixes** (bugs #1, #7)
   - Both in `tools.ts`
   - Both involve input validation
   - Can be done together

3. **Group C: Confidence feedback** (bug #3)
   - Touches both `voiceParser.ts` and `tools.ts`
   - Standalone improvement

4. **Group D: Missing tool** (bug #6)
   - Standalone addition
   - No dependencies

5. **Group E: UX improvements** (bug #8)
   - Standalone
   - Can be done last

---

### Recommended Batches

**Batch 1: Critical validation fixes** (bugs #1, #7)
- Both are validation issues in `tools.ts`
- Low risk, high impact
- Estimated: 30-45 minutes

**Batch 2: NLP date expression support** (bugs #2, #4, #5, #9)
- All in `voiceParser.ts`
- #4 and #9 share "la próxima semana" pattern
- Estimated: 1-2 hours

**Batch 3: Confidence feedback** (bug #3)
- Touches `voiceParser.ts` and `tools.ts`
- Requires updating tool response format
- Estimated: 30-45 minutes

**Batch 4: Missing tool exposure** (bug #6)
- Add `get_upcoming_agenda` tool
- Straightforward addition
- Estimated: 30 minutes

**Batch 5: UX polish** (bug #8)
- Simplify tool descriptions
- Low priority
- Estimated: 30 minutes

---

### Risks and Edge Cases

1. **ISO regex relaxation** (bug #1): Must ensure relaxed regex still rejects truly invalid formats. Test with timezone offsets, milliseconds, etc.

2. **"mañana" override** (bug #2): Must not break existing correct behavior for "mañana" = "tomorrow". Only override when "mañana" follows weekday + "por la" pattern.

3. **Date expression additions** (bug #4): "la próxima semana" should mean "next Monday" (start of next week), not "7 days from now". Verify Spanish convention.

4. **Confidence threshold** (bug #3): Choosing 0.5 as threshold is arbitrary. Consider 0.6 or 0.7 for stricter validation.

5. **New tool addition** (bug #6): Must follow existing tool patterns (schema, handler, definition). Ensure `limitDays` parameter has sensible default (7 days).

6. **Test coverage**: All fixes must include tests. Strict TDD mode is active.

---

### Recommendation

**Proceed with all 9 bugs** in 4-5 batches as outlined above. Total estimated effort: 3-4 hours including tests.

**Priority order**:
1. Bug #1 (ISO regex) — CRITICAL, blocking LLM usage
2. Bugs #2, #4 (date expressions) — MEDIUM-HIGH, improves NLP quality
3. Bug #3 (confidence feedback) — MEDIUM, improves LLM awareness
4. Bug #6 (getUpcomingAgenda) — MEDIUM, adds useful functionality
5. Bugs #5, #7, #8, #9 — LOW, polish and edge cases

**Scope**: This is a stability/quality improvement change, not a feature addition. No architectural changes needed. All fixes are localized to existing files.

---

### Ready for Proposal

**YES** — sufficient information to proceed to proposal phase.

The orchestrator should tell the user:
> "Exploration complete. Found 9 bugs across validation, NLP parsing, and tool exposure. All are fixable without architectural changes. Recommend fixing in 4-5 batches, starting with critical ISO regex validation. Total effort: 3-4 hours. Ready to proceed with proposal?"
