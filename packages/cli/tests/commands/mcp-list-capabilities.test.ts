import { describe, it, expect } from 'vitest';
import { getToolDefinitions } from '../../src/mcp/index';
import {
  deriveScope,
  deriveToolCapability,
  deriveToolCapabilities,
  NETWORK_TOOL_NAMES,
} from '../../src/mcp/tool-capabilities';
import { formatCapabilitiesTable, formatCapabilitiesByPermission } from '../../src/commands/mcp';

describe('deriveScope', () => {
  it('classifies exec-prefixed tools as exec', () => {
    expect(deriveScope('run_ci_checks')).toBe('exec');
    expect(deriveScope('dispatch_skills')).toBe('exec');
    expect(deriveScope('trigger_maintenance_job')).toBe('exec');
  });

  it('classifies write-prefixed tools as write', () => {
    expect(deriveScope('edit_file')).toBe('write');
    expect(deriveScope('write_strategy')).toBe('write');
    expect(deriveScope('manage_state')).toBe('write');
    expect(deriveScope('ingest_source')).toBe('write');
    expect(deriveScope('subscribe_webhook')).toBe('write');
  });

  it('defaults unmatched tools to the least-privilege read scope', () => {
    expect(deriveScope('validate_project')).toBe('read');
    expect(deriveScope('check_dependencies')).toBe('read');
    expect(deriveScope('query_graph')).toBe('read');
    expect(deriveScope('list_gateway_tokens')).toBe('read');
  });

  it('prefers exec over write when both could match', () => {
    // `run_` is checked before any write prefix.
    expect(deriveScope('run_agent_task')).toBe('exec');
  });
});

describe('deriveToolCapability', () => {
  it('maps trustedOutput to the trust tag', () => {
    expect(
      deriveToolCapability({ name: 'x', description: '', inputSchema: {}, trustedOutput: true })
        .trust
    ).toBe('trusted');
    expect(deriveToolCapability({ name: 'x', description: '', inputSchema: {} }).trust).toBe(
      'untrusted'
    );
  });

  it('flags network tools from the grounded allow-list', () => {
    for (const name of NETWORK_TOOL_NAMES) {
      expect(deriveToolCapability({ name, description: '', inputSchema: {} }).network).toBe(true);
    }
    expect(
      deriveToolCapability({ name: 'query_graph', description: '', inputSchema: {} }).network
    ).toBe(false);
  });
});

describe('deriveToolCapabilities over the live registry', () => {
  const definitions = getToolDefinitions();
  const capabilities = deriveToolCapabilities(definitions);

  it('produces exactly one capability record per registered tool', () => {
    expect(capabilities.length).toBe(definitions.length);
  });

  it('covers every registered tool name', () => {
    const derived = new Set(capabilities.map((c) => c.name));
    const registered = new Set(definitions.map((d) => d.name));
    expect(derived).toEqual(registered);
  });

  it('is sorted by name for deterministic output', () => {
    const names = capabilities.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('is a pure function of the input (stable across calls)', () => {
    expect(deriveToolCapabilities(definitions)).toEqual(capabilities);
  });

  it('assigns only valid scope values', () => {
    for (const c of capabilities) {
      expect(['read', 'write', 'exec']).toContain(c.scope);
    }
  });

  it('marks the known network tools and no others', () => {
    const networked = capabilities
      .filter((c) => c.network)
      .map((c) => c.name)
      .sort();
    expect(networked).toEqual([...NETWORK_TOOL_NAMES].sort());
  });
});

describe('formatCapabilitiesTable', () => {
  const definitions = getToolDefinitions();
  const capabilities = deriveToolCapabilities(definitions);

  it('emits a header row, the heuristic note, and one line per tool plus a count', () => {
    const out = formatCapabilitiesTable(capabilities);
    const lines = out.split('\n');
    expect(lines[0]).toContain('HEURISTIC');
    expect(out).toContain('TOOL');
    expect(out).toContain('SCOPE');
    expect(out).toContain(`${capabilities.length} tools`);
  });

  it('is deterministic across invocations', () => {
    expect(formatCapabilitiesTable(capabilities)).toBe(formatCapabilitiesTable(capabilities));
  });
});

describe('formatCapabilitiesByPermission', () => {
  const definitions = getToolDefinitions();
  const capabilities = deriveToolCapabilities(definitions);

  it('renders a section per scope plus a network section, and the counts sum to the total', () => {
    const out = formatCapabilitiesByPermission(capabilities);
    expect(out).toContain('## READ');
    expect(out).toContain('## WRITE');
    expect(out).toContain('## EXEC');
    expect(out).toContain('## NETWORK');
    expect(out).toContain(`${capabilities.length} tools`);

    const read = capabilities.filter((c) => c.scope === 'read').length;
    const write = capabilities.filter((c) => c.scope === 'write').length;
    const exec = capabilities.filter((c) => c.scope === 'exec').length;
    expect(read + write + exec).toBe(capabilities.length);
  });

  it('is deterministic across invocations', () => {
    expect(formatCapabilitiesByPermission(capabilities)).toBe(
      formatCapabilitiesByPermission(capabilities)
    );
  });
});
