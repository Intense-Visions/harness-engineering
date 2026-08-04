import { describe, it, expect } from 'vitest';
import { getToolDefinitions } from '../../src/mcp/index';
import {
  deriveScope,
  deriveToolCapability,
  deriveToolCapabilities,
  NETWORK_TOOL_NAMES,
} from '../../src/mcp/tool-capabilities';
import { TOOL_CAPABILITY_DECLARATIONS } from '../../src/mcp/tool-capability-declarations';
import { formatCapabilitiesTable, formatCapabilitiesByPermission } from '../../src/commands/mcp';

describe('deriveScope (heuristic fallback)', () => {
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
  it('reads DECLARED scopes/network and marks source=declared', () => {
    const cap = deriveToolCapability({
      name: 'x',
      description: '',
      inputSchema: {},
      capability: { scopes: ['write', 'read'], network: true },
    });
    // scopes are normalized to read < write < exec order and deduped
    expect(cap.scopes).toEqual(['read', 'write']);
    expect(cap.network).toBe(true);
    expect(cap.source).toBe('declared');
  });

  it('normalizes and dedupes declared scopes deterministically', () => {
    const cap = deriveToolCapability({
      name: 'x',
      description: '',
      inputSchema: {},
      capability: { scopes: ['exec', 'read', 'exec'] },
    });
    expect(cap.scopes).toEqual(['read', 'exec']);
    expect(cap.network).toBe(false); // defaults false when omitted
  });

  it('falls back to the name heuristic (source=heuristic) when undeclared', () => {
    const cap = deriveToolCapability({
      name: 'run_something_new',
      description: '',
      inputSchema: {},
    });
    expect(cap.scopes).toEqual(['exec']);
    expect(cap.source).toBe('heuristic');
  });

  it('maps trustedOutput to the trust tag', () => {
    expect(
      deriveToolCapability({ name: 'x', description: '', inputSchema: {}, trustedOutput: true })
        .trust
    ).toBe('trusted');
    expect(deriveToolCapability({ name: 'x', description: '', inputSchema: {} }).trust).toBe(
      'untrusted'
    );
  });

  it('uses the grounded allow-list for network on the heuristic path', () => {
    for (const name of NETWORK_TOOL_NAMES) {
      // undeclared → heuristic path consults NETWORK_TOOL_NAMES
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

  // Coverage gate: every registered tool MUST carry a declaration so scopes are
  // authoritative, not guessed. A future tool added without an entry in
  // tool-capability-declarations.ts fails here. Count is derived dynamically
  // from the registry — never a hardcoded magic number.
  it('has a capability declaration for every registered tool (no heuristic fallback in the registry)', () => {
    const undeclared = definitions.filter((d) => d.capability === undefined).map((d) => d.name);
    expect(undeclared).toEqual([]);
    expect(capabilities.every((c) => c.source === 'declared')).toBe(true);
  });

  it('declaration map has no entries for tools that are not registered', () => {
    const registered = new Set(definitions.map((d) => d.name));
    const orphans = Object.keys(TOOL_CAPABILITY_DECLARATIONS).filter((n) => !registered.has(n));
    expect(orphans).toEqual([]);
  });

  it('is sorted by name for deterministic output', () => {
    const names = capabilities.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('is a pure function of the input (stable across calls)', () => {
    expect(deriveToolCapabilities(definitions)).toEqual(capabilities);
  });

  it('assigns only valid, non-empty, normalized scope sets', () => {
    for (const c of capabilities) {
      expect(c.scopes.length).toBeGreaterThan(0);
      for (const s of c.scopes) expect(['read', 'write', 'exec']).toContain(s);
      // deduped + canonically sorted
      expect(c.scopes).toEqual([...new Set(c.scopes)]);
    }
  });

  it('surfaces the security-relevant declared network tools', () => {
    const networked = capabilities
      .filter((c) => c.network)
      .map((c) => c.name)
      .sort();
    // Grounded, evidence-based network set (Gateway API, webhook, GitHub sync,
    // PR-comment posting). Asserted explicitly so a regression is loud.
    expect(networked).toEqual(
      [
        'list_gateway_tokens',
        'manage_roadmap',
        'run_code_review',
        'subscribe_webhook',
        'trigger_maintenance_job',
      ].sort()
    );
  });

  it('declares the verified exec (subprocess-spawning) tools', () => {
    const exec = capabilities
      .filter((c) => c.scopes.includes('exec'))
      .map((c) => c.name)
      .sort();
    expect(exec).toEqual(
      [
        'add_component',
        'assess_project',
        'design_craft',
        'dispatch_skills',
        'review_changes',
        'run_agent_task',
        'run_persona',
        'run_security_scan',
        'trigger_maintenance_job',
      ].sort()
    );
  });

  it('classifies deceptively-named tools by behavior, not name', () => {
    const byName = new Map(capabilities.map((c) => [c.name, c]));
    // `run_*` names that are actually read-only in-process operations
    expect(byName.get('run_ci_checks')?.scopes).toEqual(['read']);
    expect(byName.get('run_skill')?.scopes).toEqual(['read']);
    // reads a diff but persists a graph node
    expect(byName.get('outcome_eval')?.scopes).toEqual(['read', 'write']);
  });
});

describe('formatCapabilitiesTable', () => {
  const definitions = getToolDefinitions();
  const capabilities = deriveToolCapabilities(definitions);

  it('emits a header row, the capability note, and one line per tool plus a count', () => {
    const out = formatCapabilitiesTable(capabilities);
    const lines = out.split('\n');
    expect(lines[0]).toContain('DECLARED');
    expect(out).toContain('TOOL');
    expect(out).toContain('SCOPES');
    expect(out).toContain('SOURCE');
    expect(out).toContain(`${capabilities.length} tools`);
  });

  it('renders multi-scope tools with a joined scope cell', () => {
    const out = formatCapabilitiesTable(capabilities);
    // outcome_eval is declared read+write
    expect(out).toMatch(/outcome_eval\s+read\+write/);
  });

  it('is deterministic across invocations', () => {
    expect(formatCapabilitiesTable(capabilities)).toBe(formatCapabilitiesTable(capabilities));
  });
});

describe('formatCapabilitiesByPermission', () => {
  const definitions = getToolDefinitions();
  const capabilities = deriveToolCapabilities(definitions);

  it('renders a section per scope plus a network section', () => {
    const out = formatCapabilitiesByPermission(capabilities);
    expect(out).toContain('## READ');
    expect(out).toContain('## WRITE');
    expect(out).toContain('## EXEC');
    expect(out).toContain('## NETWORK');
    expect(out).toContain(`${capabilities.length} tools`);
  });

  it('lists every tool in at least one scope section (union covers the registry)', () => {
    const scopes: Array<'read' | 'write' | 'exec'> = ['read', 'write', 'exec'];
    const covered = new Set(
      capabilities.filter((c) => scopes.some((s) => c.scopes.includes(s))).map((c) => c.name)
    );
    expect(covered.size).toBe(capabilities.length);
  });

  it('places multi-scope tools in each of their sections', () => {
    const out = formatCapabilitiesByPermission(capabilities);
    const readSection = out.slice(out.indexOf('## READ'), out.indexOf('## WRITE'));
    const writeSection = out.slice(out.indexOf('## WRITE'), out.indexOf('## EXEC'));
    // outcome_eval is read+write → appears in both READ and WRITE
    expect(readSection).toContain('outcome_eval');
    expect(writeSection).toContain('outcome_eval');
  });

  it('is deterministic across invocations', () => {
    expect(formatCapabilitiesByPermission(capabilities)).toBe(
      formatCapabilitiesByPermission(capabilities)
    );
  });
});
