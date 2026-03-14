import { describe, it, expect } from 'vitest';
import { createHarnessServer, getToolDefinitions } from '../src/server';

describe('MCP Server', () => {
  it('creates a server instance', () => {
    const server = createHarnessServer();
    expect(server).toBeDefined();
  });

  it('registers validate_project tool', () => {
    const tools = getToolDefinitions();
    const names = tools.map((t) => t.name);
    expect(names).toContain('validate_project');
  });
});
