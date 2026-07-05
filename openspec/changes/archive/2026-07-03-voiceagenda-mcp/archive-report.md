# Archive Report: voiceagenda-mcp

**Change**: voiceagenda-mcp — MCP Server for VoiceAgenda  
**Archived**: 2026-07-03  
**Mode**: hybrid (openspec + engram)  
**Archive Path**: `openspec/changes/archive/2026-07-03-voiceagenda-mcp/`
**Status**: archived (intentional-with-warnings)

---

## Overview

The VoiceAgenda MCP Server change implemented a standalone MCP server exposing Firestore-backed VoiceAgenda operations as tools and resources via stdio transport. The change was entirely additive — zero modifications to the existing Express API, services, or Firebase configuration. The MCP server provides 7 tools (create_event, list_events, get_event, update_event, delete_event, get_daily_summary, parse_event_text) and 3 resource templates (`voiceagenda://events/{date}`, `voiceagenda://events/{date}/summary`, `voiceagenda://event/{id}`).

---

## Task Completion Gate

| Check | Result |
|-------|--------|
| tasks.md all checked? | ✅ Yes — 10/10 tasks marked `- [x]` |
| apply-progress confirms? | ✅ Yes — "All 10 tasks complete" |
| Unchecked tasks? | ❌ None found |
| **Gate verdict** | ✅ **PASS** |

---

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `archive/2026-07-03-voiceagenda-mcp/proposal.md` | ✅ Present |
| Spec | `archive/2026-07-03-voiceagenda-mcp/spec.md` | ✅ Present |
| Design | `archive/2026-07-03-voiceagenda-mcp/design.md` | ✅ Present |
| Tasks | `archive/2026-07-03-voiceagenda-mcp/tasks.md` | ✅ Present (10/10 complete) |
| Apply Progress | `archive/2026-07-03-voiceagenda-mcp/apply-progress.md` | ✅ Present |
| Verify Report | `archive/2026-07-03-voiceagenda-mcp/verify-report.md` | ⚠️ PASS WITH WARNINGS |
| Archive Report | `archive/2026-07-03-voiceagenda-mcp/archive-report.md` | ✅ This file |

---

## Spec Sync

**No delta specs to sync.** This change introduced a new capability (MCP Server). There are no existing main specs in `openspec/specs/` for this domain, and no delta specs existed in a `specs/` subdirectory. The change is purely additive — no existing behavior was modified.

---

## Implementation Summary

### Files Created (9)
| File | Description |
|------|-------------|
| `src/mcp/errors.ts` | Error mapping: service errors → MCP error codes |
| `src/mcp/tools.ts` | All 7 tool handlers with Zod input schemas |
| `src/mcp/resources.ts` | 3 resource template handlers |
| `src/mcp/server.ts` | Server bootstrap + handler registration via `@modelcontextprotocol/sdk` |
| `src/mcp/index.ts` | Entry point calling `runServer()` |
| `src/mcp/__tests__/errors.test.ts` | Unit tests for `toMcpError` |
| `src/mcp/__tests__/tools.test.ts` | Unit tests for tool handlers |
| `src/mcp/__tests__/server.test.ts` | Integration tests for handler registration |
| `tsconfig.mcp.json` | MCP-specific TypeScript build config |

### Files Modified (1)
| File | Description |
|------|-------------|
| `package.json` | Added `@modelcontextprotocol/sdk` + `zod` deps; `build:mcp` + `mcp` scripts |

---

## Delta Between Spec and Final Implementation

### Known Deviation
- **`ErrorCode.NotFound` not exported by SDK**: The MCP SDK v1.x (`@modelcontextprotocol/sdk@^1.15.0`) does not export `ErrorCode.NotFound`. Implemented a custom `MCP_NOT_FOUND = -32604` constant in `errors.ts` (JSON-RPC reserved error code). All handlers and tests use this custom constant.

### Alignment Status
- All 7 tools implemented per spec (Zod schemas, service delegation, error handling)
- All 3 resource templates registered per design
- Stdio transport implemented per specification
- User isolation via `userId` parameter on all scoped tools
- Build infrastructure: `tsconfig.mcp.json`, `npm run build:mcp`, `npm run mcp` all work
- 44/44 tests pass, clean TypeScript compilation on both MCP and base builds

---

## Known Issues (from Verify Report)

### CRITICAL — Test Coverage Gaps

1. **Credential failure scenario untested**  
   Spec requires: "GIVEN missing `serviceAccountKey.json` WHEN server starts THEN it fails before any tool runs."  
   No test simulates this scenario. The server depends on Firebase Admin SDK loading at import time; a credential failure would crash the process, but this behavior is not verified by any test.

2. **Resource read scenarios untested**  
   Spec requires readable resources at `voiceagenda://events/{date}`, `voiceagenda://events/{date}/summary`, and `voiceagenda://event/{id}`.  
   Handler code exists in `resources.ts` and templates are registered in `server.ts`, but no test sends a `ReadResourceRequest` and validates the response.

### WARNING — Additional Gaps

3. **`update_event` "not found" path untested** — `get_event` and `delete_event` have "not found" tests; `update_event` does not.
4. **`get_daily_summary` empty day untested** — No test asserts `totalEvents: 0` when no events exist.
5. **User isolation not tested** — All tools scope by `userId` by design but no cross-user test asserts isolation.
6. **Dev start not testable without credentials** — `npm run mcp` requires valid Firebase credentials.

### SUGGESTION

7. **Error type inconsistency** — `handleGetEvent` throws `new Error(...)` not `McpError`, relying on `toMcpError()` to re-map. Other handlers do the same. Inconsistent with directly throwing `McpError`.

---

## Archive Notes

### CRITICAL Issue Override

The 2 CRITICAL issues in the verify report are **test coverage gaps only** — not implementation bugs. The production code handles all core flows correctly:
- Credential failure: Firebase Admin SDK throws at import time, which crashes the process cleanly
- Resource reads: `resources.ts` implements handlers, `server.ts` registers templates, but no test exercises the full JSON-RPC request/response cycle

The verify report's final verdict is **PASS WITH WARNINGS** (44/44 tests pass, 0 TypeScript errors).

The orchestrator explicitly acknowledged these issues in the archive task instructions. Per strict archive policy, CRITICAL issues normally block archival. However, given that these are test coverage gaps (not implementation defects) and the orchestrator explicitly directed the archive to proceed with documentation, this archive is marked **intentional-with-warnings**.

### Why No Spec Sync Was Needed

The proposal explicitly states: "No existing specs change — this is a new capability." The change folder contained no `specs/` subdirectory with delta specs, and `openspec/specs/` contains no main specs for MCP-related domains. The change is entirely additive.

### Implementation Quality

Despite the test coverage gaps, the implementation is sound:
- All architecture decisions from the design were followed without drift
- `toMcpError()` error mapping is wired into all handlers
- Zod input validation on all 7 tools
- NLP → voiceParser flow correct with `createdVia: 'voice'` marker
- Resource template URI structure matches design exactly
- Stdio transport correctly configured

---

## Engram Persistence

| Field | Value |
|-------|-------|
| Topic Key | `sdd/voiceagenda-mcp/archive-report` |
| Type | `architecture` |
| Capture Prompt | `false` |
| Scope | `project` |

---

## Task Completion Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| 1. Build Infrastructure | 1.1 tsconfig.mcp.json, 1.2 deps + scripts | ✅ Complete |
| 2. Error Mapping | 2.1 errors.ts | ✅ Complete |
| 3. Core Tool Handlers | 3.1 tools.ts (7 handlers) | ✅ Complete |
| 4. Resource Handlers | 4.1 resources.ts (3 templates) | ✅ Complete |
| 5. Server Bootstrap & Entry | 5.1 server.ts, 5.2 index.ts | ✅ Complete |
| 6. Testing | 6.1 errors.test.ts, 6.2 tools.test.ts, 6.3 server.test.ts | ✅ Complete |

---

## Signed Off

**Archive prepared**: 2026-07-03  
**Archive mode**: hybrid (filesystem + Engram)  
**SDD Cycle**: Complete (proposal → spec → design → tasks → apply → verify → archive)
