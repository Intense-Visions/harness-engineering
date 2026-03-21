import { describe, it, expect } from 'vitest';
import { createHarnessServer, getToolDefinitions } from '../src/server';

describe('MCP Server Integration', () => {
  it('creates a server instance', () => {
    const server = createHarnessServer();
    expect(server).toBeDefined();
  });

  it('registers all expected tools', () => {
    const tools = getToolDefinitions();
    const names = tools.map((t) => t.name);
    expect(names).toContain('validate_project');
    expect(names).toContain('check_dependencies');
    expect(names).toContain('check_docs');
    expect(names).toContain('validate_knowledge_map');
    expect(names).toContain('detect_entropy');
    expect(names).toContain('apply_fixes');
    expect(names).toContain('generate_linter');
    expect(names).toContain('validate_linter_config');
    expect(names).toContain('init_project');
    expect(names).toContain('list_personas');
    expect(names).toContain('generate_persona_artifacts');
    expect(names).toContain('run_persona');
    expect(names).toContain('add_component');
    expect(names).toContain('run_agent_task');
    expect(names).toContain('run_skill');
    expect(names).toContain('generate_slash_commands');
    expect(names).toContain('query_graph');
    expect(names).toContain('search_similar');
    expect(names).toContain('find_context_for');
    expect(names).toContain('get_relationships');
    expect(names).toContain('get_impact');
    expect(names).toContain('ingest_source');
    expect(names).toContain('check_performance');
    expect(names).toContain('get_perf_baselines');
    expect(names).toContain('update_perf_baselines');
    expect(names).toContain('get_critical_paths');
    expect(names).toContain('list_streams');
    expect(tools).toHaveLength(39);
  });

  it('all tool definitions have inputSchema', () => {
    const tools = getToolDefinitions();
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.description).toBeTruthy();
    }
  });
});
