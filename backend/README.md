<p align="center">
  <img src="assets/logo.png" alt="Agent Calendar" width="128">
</p>

<h1 align="center">Agent Calendar</h1>

<p align="center">
  <strong>MCP server for AI agent calendar management</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#tools">Tools</a> ·
  <a href="#mcp-configuration">Configuration</a> ·
  <a href="#nlp">NLP</a> ·
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
  <img src="https://img.shields.io/badge/tests-92-passing-green" alt="Tests">
  <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/MCP-server-purple" alt="MCP">
</p>

Create, search, and manage events using **natural language** or **structured input** over the [Model Context Protocol](https://modelcontextprotocol.io/).

No HTTP, no REST, no auth infra. Agent Calendar runs as a **stdio MCP server** — your AI host handles identity and transport.

---

## Features

- **11 MCP tools** — CRUD, NLP parsing, text search, slot-finding, conflict detection, daily agenda
- **Spanish NLP** — _"pasado mañana reunión con equipo de 10 a 12"_ → structured event
- **Multi-agent** — each agent has its own calendar context via `agentId`
- **SQLite-backed** — zero external databases, portable, fast
- **CLI-first** — `npx mcp-agenda init` to bootstrap

---

## Quick Start

```bash
npx mcp-agenda init
npx mcp-agenda
```

Then add to your MCP host configuration (see below).

---

## MCP Configuration

### Claude Desktop

```json
{
  "mcpServers": {
    "mcp-agenda": {
      "command": "npx",
      "args": ["mcp-agenda"]
    }
  }
}
```

### VS Code / Cursor

```json
{
  "mcp": {
    "servers": {
      "mcp-agenda": {
        "command": "npx",
        "args": ["mcp-agenda"]
      }
    }
  }
}
```

### Cline / Any MCP Host

```json
{
  "mcpServers": {
    "mcp-agenda": {
      "command": "npx",
      "args": ["mcp-agenda"]
    }
  }
}
```

---

## Tools

### create_event

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | no | Agent identity (default: `"default"`) |
| `title` | string | conditional | Structured path |
| `date` | string | conditional | `YYYY-MM-DD` |
| `startTime` | string | conditional | ISO 8601 |
| `endTime` | string | conditional | ISO 8601 |
| `text` | string | conditional | NLP path — natural language |
| `referenceDate` | string | no | For relative expressions |

Structured:
```json
{ "agentId": "my-agent", "title": "Team standup", "date": "2026-07-10", "startTime": "2026-07-10T09:00:00", "endTime": "2026-07-10T09:30:00" }
```

NLP:
```json
{ "agentId": "my-agent", "text": "pasado mañana reunión con equipo de 10 a 12" }
```

### list_events

`agentId`, optional `date` or `startDate`/`endDate`.

### get_event

`eventId` (required). Returns single event.

### update_event

`eventId` + any fields to update.

### delete_event

`eventId` (required).

### get_daily_summary

`agentId`, `date`. Returns structured summary with total events, first/last times.

### parse_event_text

`text` (required), optional `referenceDate`. Dry-run NLP without persisting.

### search_events

`query` (required), `agentId`, `limit`. LIKE search on title + description.

### find_free_slots

`date`, `durationMinutes` (default: 60), `agentId`, `startHour`/`endHour` (business hours).

### check_conflicts

`startTime`, `endTime` (ISO 8601), optional `excludeEventId`. Returns `{ hasConflict, conflicts[] }`.

### get_agenda

`agentId`, optional `date`/`startDate`/`endDate`, `format` (`"text"` or `"json"`). Text format returns human-readable:

```
09:00 → 10:30: Team standup
11:00 → 12:00: Sprint review
```

---

## Resources

| URI | Description |
|-----|-------------|
| `mcp-agenda://events/{date}` | Events for a date |
| `mcp-agenda://events/{date}/summary` | Daily summary |
| `mcp-agenda://event/{id}` | Event detail |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_CALENDAR_DB_PATH` | `./data` | Database directory |

---

## NLP

Spanish natural language via `chrono-node`:

| Input | Result |
|-------|--------|
| `"mañana dentista de 3 a 4"` | Tomorrow 15:00–16:00 |
| `"pasado mañana reunión con equipo de 10 a 12"` | Day+2 10:00–12:00 |
| `"el lunes que viene comprar leche a las 9"` | Next Mon 09:00–10:00 |

---

## Development

```bash
git clone <repo>
cd mcp-agenda
npm install
npm run build
npm test
npx tsc --noEmit
```

---

## Architecture

```
MCP Host (Claude, Cline, etc.)
    │
    ▼  stdio JSON-RPC
mcp-agenda (CLI)
    │
    ├── server.ts ──┬── tools.ts ──┬── eventService.ts
    │                │              ├── searchService.ts
    │                │              ├── slotService.ts
    │                │              └── conflictService.ts
    │                │
    │                └── resources.ts
    │
    └── index.ts ─── database.ts ─── SQLite
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
