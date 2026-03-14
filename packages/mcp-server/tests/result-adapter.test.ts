import { describe, it, expect } from 'vitest';
import { Ok, Err } from '@harness-engineering/core';
import { resultToMcpResponse } from '../src/utils/result-adapter';

describe('resultToMcpResponse', () => {
  it('converts Ok result to MCP success response', () => {
    const result = Ok({ valid: true, issues: [] });
    const response = resultToMcpResponse(result);
    expect(response.isError).toBeUndefined();
    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe('text');
    expect(JSON.parse(response.content[0].text)).toEqual({ valid: true, issues: [] });
  });

  it('converts Err result to MCP error response', () => {
    const result = Err(new Error('Validation failed: missing AGENTS.md'));
    const response = resultToMcpResponse(result);
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('Validation failed');
  });

  it('handles string values', () => {
    const result = Ok('simple string');
    const response = resultToMcpResponse(result);
    expect(response.content[0].text).toBe('"simple string"');
  });
});
