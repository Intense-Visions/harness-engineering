import { describe, it, expect } from 'vitest';
import {
  createHarnessServer,
  getToolDefinitions,
  getResourceDefinitions,
} from '../../src/mcp/server';

describe('MCP Server', () => {
  it('creates a server instance', () => {
    const server = createHarnessServer();
    expect(server).toBeDefined();
  });

  it('registers all 56 tools', () => {
    const tools = getToolDefinitions();
    expect(tools).toHaveLength(56);
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
  });

  it('does not register removed tools', () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).not.toContain('manage_handoff');
    expect(names).not.toContain('validate_knowledge_map');
    expect(names).not.toContain('apply_fixes');
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

  it('registers manage_roadmap tool', () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toContain('manage_roadmap');
  });

  it('registers harness://state resource', () => {
    const uris = getResourceDefinitions().map((r) => r.uri);
    expect(uris).toContain('harness://state');
  });

  it('registers graph resources', () => {
    const uris = getResourceDefinitions().map((r) => r.uri);
    expect(uris).toContain('harness://graph');
    expect(uris).toContain('harness://entities');
    expect(uris).toContain('harness://relationships');
  });

  it('resource descriptors include stability hints in _meta', () => {
    const resources = getResourceDefinitions();
    const byUri = Object.fromEntries(resources.map((r) => [r.uri, r]));

    // state is ephemeral — changes per invocation
    expect(byUri['harness://state']._meta?.stability).toBe('ephemeral');

    // session-scoped resources — stable within a session (skills is session: filesystem-backed, changes without restart)
    const sessionResources = [
      'harness://skills',
      'harness://rules',
      'harness://project',
      'harness://learnings',
      'harness://graph',
      'harness://entities',
      'harness://relationships',
    ];
    for (const uri of sessionResources) {
      expect(byUri[uri]._meta?.stability).toBe('session');
    }
  });

  it('all resource descriptors have a _meta.stability field', () => {
    const resources = getResourceDefinitions();
    for (const resource of resources) {
      expect(resource._meta?.stability).toMatch(/^(static|session|ephemeral)$/);
    }
  });

  it('registers graph tools', () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toContain('query_graph');
    expect(names).toContain('search_similar');
    expect(names).toContain('find_context_for');
    expect(names).toContain('get_relationships');
    expect(names).toContain('get_impact');
    expect(names).toContain('ingest_source');
    expect(names).toContain('ask_graph');
  });

  it('registers composite tools', () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toContain('gather_context');
    expect(names).toContain('assess_project');
    expect(names).toContain('review_changes');
  });

  it('registers compact tool', () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toContain('compact');
  });
});
