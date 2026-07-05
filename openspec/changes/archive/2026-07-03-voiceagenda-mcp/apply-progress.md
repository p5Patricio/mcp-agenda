# Apply Progress: VoiceAgenda MCP Server

**Status**: All 10 tasks complete
**Mode**: Standard (Strict TDD disabled per orchestrator override)
**Delivery**: Single PR with size:exception (approved)
**Date**: 2026-07-03

## Summary

Implemented a standalone MCP server for the VoiceAgenda backend, exposing 7 tools and 3 resource templates via stdio transport. All code is additive — zero changes to existing Express routes, services, or Firebase config.

## Completed Tasks

### Phase 1: Build Infrastructure
- [x] 1.1 Created `tsconfig.mcp.json` — extends base, overrides `include: ["src/mcp/**/*"]`
- [x] 1.2 Added `@modelcontextprotocol/sdk` and `zod` to `package.json`; added `build:mcp` and `mcp` scripts

### Phase 2: Error Mapping
- [x] 2.1 Created `src/mcp/errors.ts` — `toMcpError()` maps "not found" → NotFound (-32604), ZodError → InvalidParams, rest → InternalError

### Phase 3: Core Tool Handlers
- [x] 3.1 Created `src/mcp/tools.ts` — Zod schemas + handlers for all 7 tools:
  - `create_event`: structured (title/date/startTime/endTime) OR NLP (text → voiceParser)
  - `list_events`: by date or date range
  - `get_event`: by eventId
  - `update_event`: partial field update
  - `delete_event`: by eventId
  - `get_daily_summary`: userId + date
  - `parse_event_text`: NLP-only, no persistence

### Phase 4: Resource Handlers
- [x] 4.1 Created `src/mcp/resources.ts` — 3 resource templates:
  - `voiceagenda://events/{date}` — formatted event list
  - `voiceagenda://events/{date}/summary` — daily summary text
  - `voiceagenda://event/{id}` — single event detail

### Phase 5: Server Bootstrap & Entry
- [x] 5.1 Created `src/mcp/server.ts` — Server instance, handler registration via `setRequestHandler`, `StdioServerTransport`
- [x] 5.2 Created `src/mcp/index.ts` — entry point calling `runServer()`

### Phase 6: Testing
- [x] 6.1 `errors.test.ts` — 6 unit tests for `toMcpError` with all error types
- [x] 6.2 `tools.test.ts` — 22 unit tests for all tool handlers with mocked services
- [x] 6.3 `server.test.ts` — 6 integration tests for module structure and handler registration

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc -p tsconfig.mcp.json --noEmit` | ✅ Passes |
| `npx tsc --noEmit` (base build) | ✅ Passes (no regressions) |
| `npm test` (all tests) | ✅ 44/44 pass (30 MCP + 14 existing) |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `tsconfig.mcp.json` | Created | MCP-specific build config extending base |
| `src/mcp/errors.ts` | Created | Error mapping: service errors → MCP error codes |
| `src/mcp/tools.ts` | Created | All 7 tool handlers with Zod schemas |
| `src/mcp/resources.ts` | Created | 3 resource template handlers |
| `src/mcp/server.ts` | Created | Server bootstrap + handler registration |
| `src/mcp/index.ts` | Created | Entry point |
| `src/mcp/__tests__/errors.test.ts` | Created | Unit tests for toMcpError |
| `src/mcp/__tests__/tools.test.ts` | Created | Unit tests for tool handlers |
| `src/mcp/__tests__/server.test.ts` | Created | Integration tests for module structure |
| `package.json` | Modified | Added `@modelcontextprotocol/sdk`, `zod`, `build:mcp`, `mcp` |

## Deviations from Design

1. **ErrorCode.NotFound not in SDK**: The MCP SDK v1.x (`@modelcontextprotocol/sdk@^1.15.0`) does not export `ErrorCode.NotFound`. Implemented a custom `MCP_NOT_FOUND = -32604` constant in `errors.ts` (JSON-RPC reserved error code). All handlers and tests use this constant.

## Issues Found

None.

## Workload / PR Boundary

- Mode: `size:exception` (single PR, approved)
- Boundary: Full MCP server — all 6 phases, 10 tasks
- Estimated review budget impact: ~800 lines across 10 files (9 new, 1 modified)
