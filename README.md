<p align="center">
  <img src="backend/assets/logo.png" alt="mcp-agenda" width="160">
</p>

<h1 align="center">mcp-agenda</h1>

<p align="center">
  <strong>Calendar intelligence for AI agents</strong><br>
  <em>MCP server — zero setup, SQLite-backed, Spanish NLP</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mcp-agenda"><img src="https://img.shields.io/npm/v/mcp-agenda?style=flat&logo=npm&color=%23cb3837" alt="npm"></a>
  <a href="https://github.com/p5Patricio/mcp-agenda/actions"><img src="https://img.shields.io/github/actions/workflow/status/p5Patricio/mcp-agenda/ci.yml?style=flat&logo=github" alt="CI"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat" alt="MIT"></a>
  <img src="https://img.shields.io/badge/tests-92-passing-success?style=flat" alt="Tests">
  <img src="https://img.shields.io/badge/TypeScript-strict-%233178c6?style=flat&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/MCP-server-%23934b8e?style=flat" alt="MCP">
  <img src="https://img.shields.io/badge/SQLite-embeddable-%23003b57?style=flat&logo=sqlite" alt="SQLite">
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="#tools">Tools</a> ·
  <a href="#integration-guides">Integration</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#nlp">NLP</a> ·
  <a href="#contributing">Contributing</a>
</p>

<br>

mcp-agenda is an open-source [MCP](https://modelcontextprotocol.io/) server that turns any AI agent into your personal calendar assistant. Install it once, connect it to your favorite MCP host, and your agent can create events, check availability, detect conflicts, search your schedule, and understand natural language in **Spanish** — all without APIs, Firebase, or external services.

---

## Quick Start

```bash
# One command to start
npx -y mcp-agenda
```

Then add it to your MCP host (see [Integration Guides](#integration-guides)). That's it. Your agent now has full calendar capabilities.

### Initialize the database

```bash
npx -y mcp-agenda init
```

Creates the SQLite database and runs migrations. The database file lives at `./data/mcp-agenda.db` by default.

---

## Features

| Capability | Description |
|---|---|
| **11 MCP tools** | Full CRUD, NLP parsing, text search, slot finding, conflict detection, daily agenda |
| **Spanish NLP** | _"pasado mañana reunión con equipo de 10 a 12"_ → structured event automatically |
| **Multi-agent** | Each AI agent gets its own calendar context via `agentId` |
| **SQLite-native** | Zero infrastructure — embeddable, portable, fast, WAL mode |
| **Zero-dependency runtime** | No Docker, no databases, no cloud services. Just Node.js |
| **CLI-first** | `init`, `--help`, `--version`, or just run the server |
| **Multi-platform** | Windows, macOS, Linux — anywhere Node.js runs |

---

## Tools

mcp-agenda exposes **11 tools** over the MCP protocol. Every MCP host (Claude Desktop, OpenCode, Cursor, Cline, etc.) can call them directly.

| Tool | Description | Required params |
|---|---|---|
| `create_event` | Create event via NLP text or structured fields | `text`, **or** `title` + `date` + `startTime` + `endTime` |
| `list_events` | List events by date or range | `date`, **or** `startDate` + `endDate` |
| `get_event` | Get a single event by ID | `eventId` |
| `update_event` | Update event fields | `eventId` + at least one field |
| `delete_event` | Delete an event | `eventId` |
| `get_daily_summary` | Structured summary of a day | `date` |
| `parse_event_text` | Dry-run NLP parsing (no persistence) | `text` |
| `search_events` | Full-text search on title + description | `query` |
| `find_free_slots` | Available time slots within business hours | `date` |
| `check_conflicts` | Detect overlapping events | `startTime` + `endTime` |
| `get_agenda` | Human-readable or JSON agenda | `date`, or `startDate` + `endDate` |

<details>
<summary><strong>Detailed tool reference</strong></summary>

### `create_event`

**NLP path:** Pass natural language in Spanish or English:
```json
{
  "agentId": "my-agent",
  "text": "pasado mañana reunión con equipo de 10 a 12"
}
```

**Structured path:** Pass explicit fields:
```json
{
  "agentId": "my-agent",
  "title": "Team standup",
  "date": "2026-07-10",
  "startTime": "2026-07-10T09:00:00",
  "endTime": "2026-07-10T09:30:00"
}
```

### `find_free_slots`

Find available time within configurable business hours:
```json
{
  "agentId": "my-agent",
  "date": "2026-07-10",
  "durationMinutes": 60,
  "startHour": 8,
  "endHour": 20
}
```

### `get_agenda`

Human-readable text format:
```
09:00 → 10:30: Team standup
11:00 → 12:00: Sprint review
14:00 → 15:00: Client call
```

Or JSON format with full event data.

### `search_events`

Search across event titles and descriptions:
```json
{
  "agentId": "my-agent",
  "query": "reunión",
  "limit": 10
}
```

### `check_conflicts`

Check if a proposed time slot conflicts with existing events:
```json
{
  "agentId": "my-agent",
  "startTime": "2026-07-10T09:00:00",
  "endTime": "2026-07-10T10:00:00",
  "excludeEventId": "optional-event-id-to-exclude"
}
```
</details>

---

## Integration Guides

Connect mcp-agenda to any MCP-compatible host. Here are the most common configurations:

### Claude Desktop

```json
{
  "mcpServers": {
    "mcp-agenda": {
      "command": "npx",
      "args": ["-y", "mcp-agenda"]
    }
  }
}
```

### OpenCode

```jsonc
{
  "mcpServers": {
    "mcp-agenda": {
      "command": ["npx", "-y", "mcp-agenda"],
      "enabled": true,
      "type": "local"
    }
  }
}
```

### Cursor

```json
{
  "mcp": {
    "servers": {
      "mcp-agenda": {
        "command": "npx",
        "args": ["-y", "mcp-agenda"]
      }
    }
  }
}
```

### Cline / VS Code + Cline

```json
{
  "mcpServers": {
    "mcp-agenda": {
      "command": "npx",
      "args": ["-y", "mcp-agenda"]
    }
  }
}
```

---

## Resources

In addition to tools, mcp-agenda exposes MCP resources for agent-driven access:

| URI | Description |
|---|---|
| `mcp-agenda://events/{date}` | All events for a specific date |
| `mcp-agenda://events/{date}/summary` | Daily summary with counts and times |
| `mcp-agenda://event/{id}` | Single event detail |

---

## NLP

Natural language parsing via [chrono-node](https://github.com/wanasit/chrono). Supports both Spanish and English.

| Input | Result |
|---|---|
| `"mañana dentista de 3 a 4"` | Tomorrow 15:00–16:00 |
| `"pasado mañana reunión con equipo de 10 a 12"` | Day+2 10:00–12:00 |
| `"el lunes que viene comprar leche a las 9"` | Next Mon 09:00–10:00 |
| `"reunión el viernes a las 11 de la mañana"` | Friday 11:00–12:00 |

Works with expressions like *de la mañana*, *de la tarde*, *de la noche*, *pasado mañana*, *el N de este mes*, and more.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    MCP Host                          │
│  (Claude Desktop, OpenCode, Cursor, Cline, etc.)    │
└──────────────┬──────────────────────────┬───────────┘
               │  stdin/stdout            │
               │  JSON-RPC 2.0            │
               ▼                          ▼
┌─────────────────────────────────────────────────────┐
│                   mcp-agenda (CLI)                    │
│                                                       │
│  ┌──────────────┐    ┌─────────────┐                 │
│  │  server.ts   │◄───│   tools.ts   │                 │
│  │  (MCP core)  │    │ (11 tools)  │                 │
│  └──────┬───────┘    └──────┬──────┘                 │
│         │                   │                        │
│         │            ┌──────┴──────────┐              │
│         │            │  eventService   │              │
│         │            │  searchService  │              │
│         │            │   slotService   │              │
│         │            │ conflictService │              │
│         │            │  voiceParser    │              │
│         │            └──────┬──────────┘              │
│         │                   │                        │
│  ┌──────┴───────┐    ┌──────┴──────────┐              │
│  │ resources.ts │    │   database.ts   │              │
│  │  (3 URIs)   │    │    (SQLite)     │              │
│  └──────────────┘    └─────────────────┘              │
└─────────────────────────────────────────────────────┘
```

### Stack

| Layer | Technology |
|---|---|
| **Protocol** | [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) (stdio transport) |
| **Runtime** | Node.js 18+ |
| **Language** | TypeScript (strict mode) |
| **Database** | better-sqlite3 (WAL mode, zero config) |
| **NLP** | chrono-node (Spanish + English) |
| **Validation** | Zod |
| **Testing** | Jest (92 tests, full coverage) |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `AGENT_CALENDAR_DB_PATH` | `./data` | Directory for the SQLite database file |

---

## Development

```bash
# Clone and install
git clone https://github.com/p5Patricio/mcp-agenda.git
cd mcp-agenda/backend
npm install

# Build and test
npm run build
npm test

# Run locally
node dist/index.js --help
```

### Project structure

```
mcp-agenda/
├── README.md
├── LICENSE
├── CHANGELOG.md
├── CONTRIBUTING.md
├── backend/
│   ├── package.json          # npm package entry
│   ├── bin/cli.js            # CLI wrapper
│   ├── src/
│   │   ├── index.ts          # CLI entry point
│   │   ├── mcp/
│   │   │   ├── server.ts     # MCP protocol handler
│   │   │   ├── tools.ts      # Tool definitions + handlers
│   │   │   ├── resources.ts  # Resource definitions
│   │   │   └── errors.ts     # Error conversion
│   │   ├── services/
│   │   │   ├── eventService.ts    # CRUD operations
│   │   │   ├── searchService.ts   # Text search
│   │   │   ├── slotService.ts     # Free slot finder
│   │   │   ├── conflictService.ts # Conflict detection
│   │   │   └── voiceParser.ts     # NLP parsing
│   │   ├── config/
│   │   │   └── database.ts        # SQLite setup + schema
│   │   └── types/
│   │       └── index.ts           # Type definitions
│   └── dist/                      # Compiled output
```



---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](backend/CONTRIBUTING.md) for guidelines.

- **Bug reports** — Open an [issue](https://github.com/p5Patricio/mcp-agenda/issues)
- **Feature requests** — Start a [discussion](https://github.com/p5Patricio/mcp-agenda/discussions)
- **Pull requests** — Read the contributing guide first

---

## Changelog

See [CHANGELOG.md](backend/CHANGELOG.md) for the full release history.

---

## License

[MIT](backend/LICENSE) © p5Patricio

<p align="center">
  <sub>Built with TypeScript, better-sqlite3, chrono-node, and the MCP SDK.</sub>
  <br>
  <sub>Made for the AI agent community.</sub>
</p>
