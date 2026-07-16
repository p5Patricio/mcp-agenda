# Proposal: Bugfix Stability

## Intent

Fix 9 stability bugs across validation, NLP parsing, and tool exposure in mcp-agenda. Critical issues include an ISO regex that rejects valid timestamps, "mañana" being parsed as "tomorrow" instead of "morning" in weekday contexts, and silent event creation when NLP confidence is below threshold. These bugs degrade reliability for every agent using the calendar.

## Scope

### In Scope
- ISO 8601 regex relaxation to accept timestamps without seconds and with milliseconds
- "mañana" ambiguity resolution for weekday + "por la mañana" patterns
- Confidence score returned in tool responses with low-confidence warnings
- Missing date expression support ("la proxima semana")
- `extractEndHour` defensive fix to capture both start and end minutes
- `getUpcomingAgenda` exposure as MCP tool
- `referenceDate` validation in `parse_event_text`
- Tool description simplification for LLM clarity
- `extractTitle` edge case cleanup for date phrase artifacts

### Out of Scope
- FTS5 search (separate capability, already documented non-goal)
- New NLP engine or language support beyond Spanish
- Authentication or multi-agent access control
- Database schema changes or migrations
- Frontend work

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `agent-calendar`: Fixes to input validation (ISO regex, referenceDate), NLP parsing accuracy (manana ambiguity, date expressions, end-hour minutes, title cleanup), confidence feedback in tool responses, and tool exposure (getUpcomingAgenda). All changes are behavioral fixes within existing spec boundaries.

## Approach

Five sequential batches, each test-first per strict TDD:

| Batch | Bugs | Files | Est. Time |
|-------|------|-------|-----------|
| 1 - Validation | #1 ISO regex, #7 referenceDate | `tools.ts` | 30-45 min |
| 2 - NLP Core | #2 manana, #4 date expressions, #5 end-hour, #9 title cleanup | `voiceParser.ts` | 1-2 hr |
| 3 - Confidence | #3 confidence feedback | `voiceParser.ts`, `tools.ts` | 30-45 min |
| 4 - Tool Exposure | #6 getUpcomingAgenda | `tools.ts` | 30 min |
| 5 - UX Polish | #8 verbose descriptions | `tools.ts` | 30 min |

Each batch: write failing tests -> implement fix -> verify all tests pass -> typecheck clean.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/tools.ts` | Modified | ISO regex (L20-21), referenceDate validation (L223-246), confidence wiring, new tool handler, description edits |
| `backend/src/voiceParser.ts` | Modified | NLP overrides (L15-34), extractEndHour (L82-88), extractTitle (L137-162), confidence thresholds (L168-172) |
| `backend/src/eventService.ts` | Reference only | `getUpcomingAgenda` already implemented (L65-80) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ISO regex relaxation admits invalid formats | Low | Negative test cases for clearly invalid strings (no T separator, letters) |
| "manana" override breaks standalone "manana" = tomorrow | Medium | Regression test: "manana" alone must still resolve to tomorrow |
| "la proxima semana" Monday convention wrong for edge cases | Low | Test across week boundaries (Sunday input, Friday input) |
| Confidence threshold 0.5 is arbitrary | Low | Document threshold, expose as future config. Default stays 0.5 |

## Rollback Plan

All fixes are localized to `tools.ts` and `voiceParser.ts` with no schema changes. Revert any batch by restoring the two files from git. No data migration involved. Each batch is independently revertable.

## Dependencies

- Strict TDD mode active: all fixes require failing tests before implementation
- Jest test runner: `cd backend && npm test`
- TypeScript check: `cd backend && npx tsc --noEmit`

## Success Criteria

- [ ] ISO regex accepts `2026-07-10T09:00`, `2026-07-10T09:00:00`, and `2026-07-10T09:00:00.000Z`
- [ ] "cita el martes por la manana" resolves to Tuesday morning, not Wednesday
- [ ] Tool responses include `confidence` field; warnings emitted when < 0.5
- [ ] "la proxima semana" parses to next Monday
- [ ] "de 3:30 a 4:45" preserves both start and end minutes
- [ ] `get_upcoming_agenda` tool callable via MCP
- [ ] Invalid `referenceDate` returns error instead of silent Invalid Date
- [ ] All 9 bugs have regression tests; full suite green; typecheck clean
