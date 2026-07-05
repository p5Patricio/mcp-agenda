# Changelog

## 1.0.0 (2026-07-04)

### Initial Release — Agent Calendar MCP Server

Pivoted from VoiceAgenda (mobile voice agenda app) to a standalone MCP server for AI agent calendar management.

#### Features
- 11 MCP tools: CRUD events, NLP parsing, text search, slot-finding, conflict detection, agenda
- Spanish natural language event creation via chrono-node
- Multi-agent support via `agentId` (free string, defaults to `default`)
- SQLite-backed storage (zero external databases)
- CLI: `mcp-agenda init`, `--help`, `--version`, default MCP stdio mode
- 3 resource templates: events by date, daily summary, event detail

#### Changes from VoiceAgenda
- Removed all mobile frontend (React Native + Expo)
- Removed Express REST API, push notifications, cron jobs
- Migrated from Firebase Auth + Firestore to SQLite + agentId
- Restructured from full-stack app to pure MCP server
