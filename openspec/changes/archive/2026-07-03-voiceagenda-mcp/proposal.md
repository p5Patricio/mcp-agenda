# Proposal: VoiceAgenda MCP Server

## Intent

Enable AI agents (Claude Desktop, VS Code, Cursor, etc.) to interact with VoiceAgenda programmatically. Without an MCP server, agents have no structured way to create, query, or manage events — they'd need REST API calls or manual tooling. This change wraps existing backend services into MCP tools so agents can read/write agenda data naturally.

## Scope

### In Scope
- Standalone MCP server with stdio transport (TypeScript)
- 7 tools: create event, list events (by date/range), get event, update event, delete event, get daily summary, parse event text (preview)
- Reuse of `eventService.ts`, `voiceParser.ts`, Firebase config, shared types
- `userId` parameter on each tool for multi-user isolation
- New npm scripts (`mcp`, `build:mcp`) + separate `tsconfig.mcp.json`

### Out of Scope
- WebSocket or HTTP transport
- Authentication/authorization layer beyond `userId` scoping
- Subscription-based event push (server-sent events) — future
- Changes to the existing Express API or frontend

## Capabilities

### New Capabilities
- `mcp-server`: MCP protocol server exposing Firestore-backed agenda tools via stdio transport

### Modified Capabilities
None — this is a new capability; no existing specs change.

## Approach

New `src/mcp/` directory with `server.ts` (MCP server bootstrap), `tools/` (7 tool handlers), and `index.ts` (entry point). Uses `@modelcontextprotocol/sdk` with `Server` class and stdio transport. Each tool handler calls the corresponding `eventService.ts` function. Reuses `voiceParser.ts` for the `parse_event_text` tool. Firebase connection is shared with the existing `config/firebase.ts`. Compiled with a separate `tsconfig.mcp.json` that includes the `src/mcp/` entry point and outputs to `dist/mcp/`.

Architecture: MCP Server → Tool Handlers → Backend Services → Firestore.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `VoiceAgenda-Backend/src/mcp/` | New | MCP server, tool handlers, entry point |
| `VoiceAgenda-Backend/package.json` | Modified | New deps + scripts |
| `VoiceAgenda-Backend/tsconfig.mcp.json` | New | Separate TS config for MCP build |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `serviceAccountKey.json` path mismatch between Express and MCP runtime | Med | Use env var fallback; document path expectation |
| Firestore quota contention if agents spam tools | Low | Rate limiting can be added later; MCP clients are single-user |
| MCP SDK API changes between versions | Low | Pin `@modelcontextprotocol/sdk` version in package.json |

## Rollback Plan

- Remove `src/mcp/` directory entirely
- Revert `package.json` changes (deps + scripts)
- Delete `tsconfig.mcp.json`

## Dependencies

- `npm install @modelcontextprotocol/sdk`
- Node >= 18 (same as existing backend)
- `serviceAccountKey.json` accessible from the MCP entry point

## Success Criteria

- [ ] `npm run mcp` starts the server on stdio without errors
- [ ] All 7 tools respond correctly via `mcp-inspector` or MCP client
- [ ] Create + list + get + update + delete cycle works against Firestore
- [ ] `parse_event_text` returns structured event without persisting
- [ ] Daily summary returns accurate event count and times
