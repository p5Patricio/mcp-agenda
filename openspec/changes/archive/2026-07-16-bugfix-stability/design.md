# Design: Bugfix Stability

## Technical Approach

Nine localized bug fixes across 2 files (`mcp/tools.ts`, `services/voiceParser.ts`), organized into 5 test-first batches per the spec. No schema changes, no new dependencies. Each batch is independently revertable via git.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| ISO regex format | Single regex with optional seconds + milliseconds | Multiple regexes per format | One regex, one validation point, less maintenance |
| `referenceDate` validation | `isNaN(new Date(val).getTime())` guard in handler | Zod custom transform | Keeps validation logic at the handler boundary; Zod `.optional()` stays simple |
| `mañana` disambiguation | Pre-chrono regex override in `getDateOverride()` | Post-chrono correction | chrono consumes "mañana" as tomorrow before we can intervene — must intercept first |
| `extractEndHour` fix | Capture start minutes in regex + return both start/end minutes | Separate start-minute extraction | Single regex pass; current regex already matches start but discards minutes |
| Confidence warning | Add `warning` field to response JSON in handlers | Throw error for low confidence | Spec says "include warning", not reject — event still created |
| `getUpcomingAgenda` tool | New handler + schema + definition; delegates to existing `eventService.getUpcomingAgenda()` | Modify `get_agenda` to accept "upcoming" mode | Spec requires a dedicated tool; keeps concerns separated |
| Description trimming | Edit `description` strings in `toolDefinitions` array | Runtime truncation | Static strings are simpler, testable at definition time |

## Data Flow

### Batch 1 — Validation (tools.ts only)

```
create_event args ──→ isoDateTimeRegex.test(startTime) ──→ accept/reject
parse_event_text args ──→ referenceDate guard ──→ isNaN? ──→ error | parseVoiceInput()
```

### Batch 2 — NLP Core (voiceParser.ts only)

```
parseVoiceInput(text, ref)
  ├─ getDateOverride(text, ref)          ← NEW: mañana-morning check
  │   ├─ /el\s+weekday.*por\s+la\s+mañana/ → resolve weekday, NOT tomorrow
  │   └─ /la\s+próxima\s+semana/         → next Monday
  │   └─ /dentro\s+de\s+(\d+)\s+días/    → refDate + N days
  ├─ chrono.es.parse(text, ref)
  ├─ extractEndHour(timeWindow)          ← FIX: capture start+end minutes
  └─ extractTitle(text, matches)         ← FIX: strip new date phrases
```

### Batch 3 — Confidence (voiceParser.ts → tools.ts)

```
parseVoiceInput() → { confidence, ... }
  └─ handleCreateEvent / handleParseEventText
       └─ confidence < 0.5 → add warning field to response JSON
```

### Batch 4 — getUpcomingAgenda (tools.ts)

```
get_upcoming_agenda({ agentId, limit })
  └─ eventService.getUpcomingAgenda(agentId, limit)
       └─ SQL: date >= today AND date <= today+limitDays, ORDER BY date ASC, startTime ASC
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/mcp/tools.ts` | Modify | ISO regex (L21), referenceDate validation (L223-246), confidence wiring (L106-121, L229-240), new `get_upcoming_agenda` handler + schema + definition (add after L325, L96, L495), description trimming (L347-495) |
| `backend/src/services/voiceParser.ts` | Modify | `getDateOverride()` add mañana-morning + "próxima semana" + "dentro de N días" (L15-34), `extractEndHour()` fix start-minute capture (L82-88), `extractTitle()` add new date-phrase patterns (L113-120) |
| `backend/src/mcp/__tests__/tools.test.ts` | Modify | Add test cases for bugs #1, #3, #6, #7, #8 |
| `backend/src/__tests__/voiceParser.test.ts` | Modify | Add test cases for bugs #2, #4, #5, #9 |

## Detailed Changes Per Batch

### Batch 1: Validation Fixes

**File: `backend/src/mcp/tools.ts`**

**Bug #1 — ISO regex (L21):**
```typescript
// BEFORE (line 21):
const isoDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// AFTER:
const isoDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?Z?)?$/;
```

This accepts: `2026-07-10T09:00`, `2026-07-10T09:00:00`, `2026-07-10T09:00:00.000Z`. Rejects: `2026/07/10 09:00` (no T separator).

**Bug #7 — referenceDate validation in `handleParseEventText` (L223-246):**
```typescript
// AFTER handleParseEventText:
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
      content: [{
        type: 'text',
        text: JSON.stringify({
          title: result.title, date: result.date,
          startTime: result.startTime, endTime: result.endTime,
          confidence: result.confidence,
          ...(result.confidence < 0.5 && { warning: 'Low NLP confidence — review parsed fields before confirming' }),
        }),
      }],
    };
  } catch (err) { throw toMcpError(err); }
}
```

**Tests (`tools.test.ts`):**
- ISO regex: 3 accepts (`T09:00`, `T09:00:00`, `T09:00:00.000Z`), 2 rejects (`2026/07/10`, `abcd`)
- referenceDate: invalid string → `isError: true` response

### Batch 2: NLP Core

**File: `backend/src/services/voiceParser.ts`**

**Bug #2 — `mañana` morning override (add to `getDateOverride`, L15-34):**
```typescript
// NEW: "mañana" in weekday + "por la mañana" context → morning, not tomorrow
const mananaMorning = text.match(
  /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b.*\bpor\s+la\s+ma[ñn]ana\b/i
);
if (mananaMorning) {
  const weekdays: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
    jueves: 4, viernes: 5, sábado: 6, sabado: 6,
  };
  const dayName = mananaMorning[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const targetDay = weekdays[dayName] ?? weekdays[dayName.replace('e', 'é')];
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

**Bug #4 — Date expressions (add to `getDateOverride`):**
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

**Bug #5 — `extractEndHour` fix (L82-88):**

Note: The regex already captures start minutes in group 1, but the return type drops them and the caller never uses them. Three-part fix:

```typescript
// 1. Update return type to include startMinute:
function extractEndHour(timeWindow: string): { startMinute: number; hour: number; minute: number } | null {
  const m = timeWindow.match(
    /de\s+\d{1,2}(?::(\d{2}))?\s*(?:am|pm)?\s+a\s+(\d{1,2})(?::(\d{2}))?\s*(?:am|pm)?/i,
  );
  if (!m) return null;
  return {
    startMinute: m[1] ? parseInt(m[1], 10) : 0,  // was: captured but discarded
    hour: parseInt(m[2], 10),
    minute: m[3] ? parseInt(m[3], 10) : 0,
  };
}
```

Caller update in `parseVoiceInput()` (L248-255): when `rawEndFromText` is non-null AND `rawEndFromText.startMinute > 0`, override `startMinute` with it. This fixes "de 3:30 a 4:45" producing startTime 15:00 instead of 15:30.

**Bug #9 — `extractTitle` cleanup (add to `DATE_PREFIX_PATTERNS`, L113-120):**
```typescript
// ADD these patterns to DATE_PREFIX_PATTERNS:
/\bpor\s+la\s+ma[ñn]ana\b/gi,
/\bla\s+pr[oó]xima\s+semana\b/gi,
/\bdentro\s+de\s+\d+\s+d[ií]as\b/gi,
/\ben\s+una\s+semana\b/gi,
```

**Tests (`voiceParser.test.ts`):**
- mañana-morning: `refDate=Wed 2026-07-15`, "cita el martes por la mañana" → date=2026-07-14, title="Cita"
- mañana-standalone: "mañana tengo dentista" → date=refDate+1
- "la próxima semana": refDate=Wed → next Monday
- "dentro de 3 días": refDate → +3
- "de 3:30 a 4:45 de la tarde": startTime=15:30, endTime=16:45
- Title cleanup: "reunión de equipo el martes por la mañana" → title="Reunión de equipo"

### Batch 3: Confidence Feedback

**File: `backend/src/mcp/tools.ts`**

**Bug #3 — Confidence warning in `handleCreateEvent` NLP path (L106-121):**
```typescript
// AFTER NLP event creation, modify return:
const responseObj = { ...event, confidence: parsedVoice.confidence };
if (parsedVoice.confidence < 0.5) {
  responseObj.warning = 'Low NLP confidence — review parsed fields before confirming';
}
return { content: [{ type: 'text', text: JSON.stringify(responseObj) }] };
```

Same pattern applied in `handleParseEventText` (already included in Batch 1 changes above).

**Tests (`tools.test.ts`):**
- Mock `parseVoiceInput` returning confidence=0.3 → response includes `warning`
- Mock `parseVoiceInput` returning confidence=0.8 → response has no `warning`

### Batch 4: New Tool

**File: `backend/src/mcp/tools.ts`**

**Bug #6 — `getUpcomingAgenda` handler:**

New schema (after L96):
```typescript
const GetUpcomingAgendaArgsSchema = z.object({
  agentId: z.string().default('default'),
  limit: z.number().optional().default(10),
});
```

New handler (after L325):
```typescript
async function handleGetUpcomingAgenda(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const parsed = GetUpcomingAgendaArgsSchema.parse(args);
    const events = await eventService.getUpcomingAgenda(parsed.agentId, parsed.limit);
    return { content: [{ type: 'text', text: JSON.stringify(events) }] };
  } catch (err) { throw toMcpError(err); }
}
```

Register in `toolHandlers` (L331-343): add `get_upcoming_agenda: handleGetUpcomingAgenda`.

Add tool definition in `toolDefinitions` (after get_agenda definition):
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
},
```

Note: `eventService.getUpcomingAgenda(agentId, limitDays)` already exists at L65-80 with a `limitDays` parameter. The tool passes `limit` directly. The existing SQL already filters `date >= today`.

**Tests (`tools.test.ts`):**
- Tool is callable via `toolHandlers.get_upcoming_agenda`
- Returns only future events (mock with past+future, assert only future returned)

### Batch 5: UX Polish

**File: `backend/src/mcp/tools.ts`**

**Bug #8 — Trim descriptions to ≤2 sentences:**

Each `description` in `toolDefinitions` (L347-495) shortened to ≤2 sentences. Examples:
- `create_event`: "Create an event with structured fields or natural language text."
- `list_events`: "List events by date or date range."
- `search_events`: "Search events by text across title and description."
- etc.

**Tests (`tools.test.ts`):**
- Iterate `toolDefinitions`, assert each `description` has ≤2 sentences (split on `. ` and check count ≤2)

## Testing Strategy

| Batch | File | Tests | Approach |
|-------|------|-------|----------|
| 1 | `tools.test.ts` | 5+ tests | Zod regex validation + handler error response |
| 2 | `voiceParser.test.ts` | 6+ tests | Direct `parseVoiceInput` calls with fixed `refDate` |
| 3 | `tools.test.ts` | 2+ tests | Mock `parseVoiceInput` with different confidence values |
| 4 | `tools.test.ts` | 2+ tests | Mock `eventService.getUpcomingAgenda`, verify handler delegation |
| 5 | `tools.test.ts` | 1+ tests | Iterate `toolDefinitions`, assert description length |

All batches: `cd backend && npm test` + `cd backend && npx tsc --noEmit` must pass.

## Migration / Rollout

No migration required. All changes are behavioral fixes in application logic. No schema changes, no data migration. Each batch is independently deployable and revertable via git.

## Open Questions

None. All 9 bugs have clear specifications with test scenarios defined in the spec.
