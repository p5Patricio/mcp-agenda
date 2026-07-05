# Agent Calendar

MCP server for AI agent calendar management — previously VoiceAgenda.

## Structure

- **`backend/`** (this directory's `backend` reference): The `agent-calendar` MCP server package. Source of truth for all code.
- **Root** (this directory): Project root with SDD artifacts (`openspec/`) and Codex workspace config.

VoiceAgenda-Frontend was removed during the `agent-calendar-pivot` SDD cycle.

## CodeGraph

Use `codegraph_explore` for codebase questions:
```
codegraph_explore(query: "...", projectPath: "C:\Users\Usuario\Documents\mcp-agenda\backend")
```
