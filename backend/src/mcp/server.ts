import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { toolHandlers, toolDefinitions } from './tools';
import { resourceTemplates, handleReadResource } from './resources';

const pkg = require('../../package.json');

const server = new Server(
  { name: 'mcp-agenda-mcp', version: pkg.version },
  { capabilities: { tools: {}, resources: {} } },
);

// ────────────────────────────────────────────────────────────
// Tool Handlers
// ────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = toolHandlers[name];

  if (!handler) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  return handler(args ?? {});
});

// ────────────────────────────────────────────────────────────
// Resource Handlers
// ────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [], // We use templates, not individual resources
}));

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates,
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  return handleReadResource(uri);
});

// ────────────────────────────────────────────────────────────
// Server Runner
// ────────────────────────────────────────────────────────────

export async function runServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
