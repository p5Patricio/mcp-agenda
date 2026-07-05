import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';
import { toMcpError, MCP_NOT_FOUND } from '../errors';

describe('toMcpError', () => {
  test('Error with "not found" message → NotFound', () => {
    const err = toMcpError(new Error('Event not found'));
    expect(err).toBeInstanceOf(McpError);
    expect(err.code).toBe(MCP_NOT_FOUND);
  });

  test('case-insensitive "not found" detection', () => {
    const err = toMcpError(new Error('NOT FOUND'));
    expect(err.code).toBe(MCP_NOT_FOUND);
  });

  test('ZodError → InvalidParams', () => {
    try {
      // Trigger a real ZodError
      const { z } = jest.requireActual('zod');
      z.string().parse(123);
    } catch (e) {
      expect(e).toBeInstanceOf(ZodError);
      const err = toMcpError(e);
      expect(err.code).toBe(ErrorCode.InvalidParams);
      return;
    }
    throw new Error('Expected ZodError was not thrown');
  });

  test('generic Error → InternalError', () => {
    const err = toMcpError(new Error('Something went wrong'));
    expect(err.code).toBe(ErrorCode.InternalError);
  });

  test('McpError passes through unchanged', () => {
    const original = new McpError(ErrorCode.InvalidParams, 'passthrough test');
    const err = toMcpError(original);
    expect(err).toBe(original);
  });

  test('non-Error value → InternalError with string message', () => {
    const err = toMcpError('unexpected string error');
    expect(err.code).toBe(ErrorCode.InternalError);
    // McpError prepends "MCP error -32603: " so we check the suffix
    expect(err.message).toContain('unexpected string error');
  });

  test('null → InternalError', () => {
    const err = toMcpError(null);
    expect(err.code).toBe(ErrorCode.InternalError);
    expect(err.message).toContain('null');
  });
});
