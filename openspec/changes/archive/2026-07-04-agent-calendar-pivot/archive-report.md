# Archive Report: agent-calendar-pivot

## Change Summary
VoiceAgenda → Agent Calendar MCP Server: full pivot from mobile app to MCP server for AI agents.

## What Was Done
- Removed all mobile frontend (React Native + Expo)
- Removed Express REST API + notifications + cron jobs
- Migrated from userId → agentId with multi-agent support
- Expanded MCP tools from 7 → 11 (added search, slots, conflicts, agenda)
- Added CLI entry point (agent-calendar init, --help, --version)
- Added 3 new services (search, slots, conflicts)
- Added NLP event creation via MCP (differentiator)
- 26 new tests (total: 92, all passing)
- Professional README with MCP integration guides

## Critical Issues Resolution
CRITICAL-01: Fixed — `src/mcp/index.ts` deleted, `package.json` `main` updated to `dist/index.js`. Resolved post-verify before archive.

## Artifacts
- `openspec/changes/archive/2026-07-04-agent-calendar-pivot/proposal.md`
- `openspec/changes/archive/2026-07-04-agent-calendar-pivot/spec.md`
- `openspec/changes/archive/2026-07-04-agent-calendar-pivot/design.md`
- `openspec/changes/archive/2026-07-04-agent-calendar-pivot/tasks.md`
- `openspec/changes/archive/2026-07-04-agent-calendar-pivot/verify-report.md`
- `openspec/changes/archive/2026-07-04-agent-calendar-pivot/archive-report.md`
- `openspec/specs/agent-calendar/spec.md` (source of truth)

## Final State
- 92 tests passing, 0 TS errors
- 11 MCP tools, 3 resource templates
- 3 new services (search, slots, conflicts)
- 1 CLI entry point
- 0 Firebase dependencies
- 0 mobile code

## Next: npm publish
