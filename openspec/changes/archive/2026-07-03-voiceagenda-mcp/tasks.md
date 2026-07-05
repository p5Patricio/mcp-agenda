# Tasks: VoiceAgenda MCP Server

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~380-460 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full MCP server | Single PR | Self-contained additive module. size:exception recommended if >400 lines. |

## Phase 1: Build Infrastructure

- [x] 1.1 Create `tsconfig.mcp.json` — extends base `tsconfig.json`, overrides `include: ["src/mcp/**/*"]`, outputs to `dist/`
- [x] 1.2 Install & add deps — `@modelcontextprotocol/sdk` + `zod` to `package.json`; add `build:mcp` (`tsc -p tsconfig.mcp.json`) and `mcp` (`node dist/mcp/index.js`) scripts

## Phase 2: Error Mapping

- [x] 2.1 Create `src/mcp/errors.ts` — `toMcpError()` function: `"not found"` → `NotFound`, `ZodError` → `InvalidParams`, rest → `InternalError`

## Phase 3: Core Tool Handlers

- [x] 3.1 Create `src/mcp/tools.ts` — Zod schemas + handlers for all 7 tools: `create_event` (structured + NLP), `list_events` (date/range), `get_event`, `update_event`, `delete_event`, `get_daily_summary`, `parse_event_text`. Each delegates to `eventService` or `voiceParser`.

## Phase 4: Resource Handlers

- [x] 4.1 Create `src/mcp/resources.ts` — 3 resource templates: `voiceagenda://events/{date}?userId=`, `voiceagenda://events/{date}/summary?userId=`, `voiceagenda://event/{id}`. Each returns formatted text via `eventService`.

## Phase 5: Server Bootstrap & Entry

- [x] 5.1 Create `src/mcp/server.ts` — instantiate `Server` from `@modelcontextprotocol/sdk`, register `toolHandlers` via `server.setRequestHandler(CallToolRequestSchema, ...)`, register resource templates, connect `StdioServerTransport`
- [x] 5.2 Create `src/mcp/index.ts` — entry point: `import { runServer } from './server'; runServer();`

## Phase 6: Testing

- [x] 6.1 Unit test `errors.ts` — `toMcpError()` with `Error("not found")` → `NotFound`, `ZodError` → `InvalidParams`, generic `Error` → `InternalError`
- [x] 6.2 Unit test `tools.ts` — call each handler with valid/invalid args, assert `CallToolResult` shape and content matches spec scenarios
- [x] 6.3 Integration test `server.ts` — send JSON-RPC `CallToolRequest` / `ReadResourceRequest` over stdio, validate response structure
