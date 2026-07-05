import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';

/**
 * JSON-RPC error code for "Not Found" (-32604).
 * The MCP SDK does not export this natively.
 */
export const MCP_NOT_FOUND = -32604;

/**
 * Maps arbitrary errors to MCP errors.
 *
 * - "not found" (case-insensitive) in message → NotFound (-32604)
 * - ZodError → InvalidParams
 * - McpError → passthrough
 * - Everything else → InternalError
 */
export function toMcpError(err: unknown): McpError {
  if (err instanceof McpError) return err;
  if (err instanceof ZodError) {
    return new McpError(ErrorCode.InvalidParams, err.message);
  }

  const message = err instanceof Error ? err.message : String(err);

  if (/not found/i.test(message)) {
    return new McpError(MCP_NOT_FOUND, message);
  }

  return new McpError(ErrorCode.InternalError, message);
}
