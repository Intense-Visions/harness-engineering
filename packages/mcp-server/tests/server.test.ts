import { describe, it, expect } from 'vitest';
import { createHarnessServer, getToolDefinitions, getResourceDefinitions } from '../src/server';

describe('MCP Server', () => {
  it('creates a server instance', () => {
    const server = createHarnessServer();
    expect(server).toBeDefined();
  });

  it('registers all 30 tools', () => {
    const tools = getToolDefinitions();
    expect(tools).toHaveLength(30);
  });

  it('registers all 8 resources', () => {
    const resources = getResourceDefinitions();
    expect(resources).toHaveLength(8);
  });

  it('registers original tools', () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toContain('validate_project');
    expect(names).toContain('detect_entropy');
    expect(names).toContain('run_skill');
  });

  it('registers new state tools', () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toContain('manage_state');
    expect(names).toContain('manage_handoff');
  });

  it('registers new feedback tools', () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toContain('create_self_review');
    expect(names).toContain('analyze_diff');
    expect(names).toContain('request_peer_review');
  });

  it('registers new CLI-wrapped tools', () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toContain('check_phase_gate');
    expect(names).toContain('validate_cross_check');
    expect(names).toContain('create_skill');
  });

  it('registers harness://state resource', () => {
    const uris = getResourceDefinitions().map((r) => r.uri);
    expect(uris).toContain('harness://state');
  });
});
