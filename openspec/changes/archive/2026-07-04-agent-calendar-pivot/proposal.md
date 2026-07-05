# Change Proposal: Agent Calendar MCP Server

## Intent

Pivot VoiceAgenda from a full-stack voice app into a standalone MCP server for AI agent calendar intelligence. The backend has a working MCP layer — strip Express/mobile, ship a focused CLI-first MCP package.

## Current Product

Monolithic: Express.js + SQLite + MCP Server (7 tools, 3 resources) plus a React Native (Expo) mobile app.

## Target Product

Single npm package running as MCP stdio. CLI: `npx agent-calendar init` then add to MCP config. 12+ tools: CRUD events, text search, slot-finding, conflict detection, agenda. Multi-agent by design — identity delegated to host.

## Scope

### In Scope
- Delete VoiceAgenda-Frontend
- Strip Express, REST, notifications, cron from backend
- Expand MCP tools: 7 → 12+
- New services: search, slot-finding, conflict-detection
- CLI `init` for DB setup/upgrade
- Rename package, unify tsconfig, add bin, publish to npm
- Migration path: existing DB survives via `agentId` default

### Out of Scope
- HTTP transport (use `mcp-proxy` externally)
- Auth (delegated to host MCP)
- Recurring events, calendar sync, multi-user sharing

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Identity model** | `agentId` as simple string | Host MCP manages identity. Existing `userId` maps 1:1. No auth infra. |
| **Express** | Full removal | MCP stdio IS the product. No HTTP dependency. |
| **Search** | LIKE (start), FTS5 (if bottleneck) | Zero extra deps. FTS5 availability varies by `better-sqlite3` build. |
| **Distribution** | npm public | Maximum reach in AI agent ecosystem. Open protocol. |
| **Data compat** | Add `calendarId`, migrate existing rows | Schema evolves without breaking installs. |

## Business Value

- Growing MCP ecosystem. First mover in calendar domain.
- No dedicated MCP calendar server exists.
- ~20hrs to ship. Core infra already built.

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| MCP protocol pre-1.0, evolving | Medium | Pin to current spec. Abstract transport from tools. |
| chrono-node Spanish edge cases | Low | Existing NLP tests pass. Add edge-case corpus. |
| User migration friction | Low | CLI `init` upgrades schema. Back up DB first. |
| npm discoverability | Medium | Descriptive name, SEO README, MCP registry listing. |

## Success Criteria

- [ ] Backend: no Express, REST, notifications, cron remains
- [ ] Frontend repo deleted or archived
- [ ] CLI `init` creates/upgrades schema in one command
- [ ] All 12+ MCP tools working and tested
- [ ] `npm publish` delivers installable package
- [ ] >90% MCP layer coverage, all NLP tests pass
- [ ] Existing SQLite data migrates losslessly

## Product Name Proposals

| Name | Why |
|------|-----|
| **agent-calendar** | Descriptive, searchable, follows MCP naming |
| **agent-scheduler** | Broader — meetings, slots, availability |
| **agenda-mcp** | Preserves "agenda" brand. Shorter. |

Recommended: **`agent-calendar`** — best SEO for MCP discovery.

## Suggested Change Name

`agent-calendar-pivot`
