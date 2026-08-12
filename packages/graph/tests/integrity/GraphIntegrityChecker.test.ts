import { describe, it, expect } from 'vitest';
import {
  checkConnectorSync,
  checkExtractedNodes,
  checkGraphIntegrity,
} from '../../src/integrity/GraphIntegrityChecker.js';
import type { GraphNode } from '../../src/types.js';
import type { SyncMetadata } from '../../src/ingest/connectors/ConnectorInterface.js';

/**
 * Two live defect classes motivate this checker, and both are invisible to
 * `harness graph status`:
 *
 *   - #1336 — a connector that hard-failed still reports a fresh
 *     `last synced <timestamp>`, because the status reader narrows
 *     `lastResult` down to a bare timestamp string and drops `errors`.
 *   - #1331 — the code extractors emit prose as `business_term` nodes
 *     (`enum or { function, const, if, if, if, return }`), and a full
 *     re-ingest cannot clear them: they are re-derived from unchanged source
 *     on every run.
 *
 * Both are the #1146 shape — "examined nothing" rendered identically to
 * "examined and passed" — so the report carries denominators.
 */

function connectorEntry(over: {
  errors?: string[];
  nodesAdded?: number;
  nodesUpdated?: number;
  edgesAdded?: number;
  edgesUpdated?: number;
  timestamp?: string;
}) {
  return {
    lastSyncTimestamp: over.timestamp ?? '2026-08-12T00:31:45.448Z',
    lastResult: {
      nodesAdded: over.nodesAdded ?? 0,
      nodesUpdated: over.nodesUpdated ?? 0,
      edgesAdded: over.edgesAdded ?? 0,
      edgesUpdated: over.edgesUpdated ?? 0,
      errors: over.errors ?? [],
      durationMs: 0,
    },
  };
}

function extractedNode(over: Partial<GraphNode> & Pick<GraphNode, 'id' | 'name'>): GraphNode {
  return {
    type: 'business_term',
    ...over,
    metadata: {
      kind: 'enum',
      source: 'code-extractor',
      extractor: 'enum-constants',
      confidence: 0.8,
      language: 'typescript',
      ...(over.metadata ?? {}),
    },
  } as GraphNode;
}

describe('checkConnectorSync', () => {
  it('flags a connector that stamped a sync timestamp despite hard-failing (#1336)', () => {
    const meta: SyncMetadata = {
      connectors: {
        jira: connectorEntry({
          errors: ['Missing API key: environment variable "JIRA_API_KEY" is not set'],
        }),
      },
    };

    const findings = checkConnectorSync(meta);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe('GI-C001');
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.subject).toBe('jira');
    expect(findings[0]!.evidence).toContain('JIRA_API_KEY');
  });

  it('does not flag a connector that synced and actually ingested something', () => {
    const meta: SyncMetadata = {
      connectors: { ci: connectorEntry({ nodesAdded: 14, edgesAdded: 20 }) },
    };

    expect(checkConnectorSync(meta)).toEqual([]);
  });

  it('warns when a sync is recorded with zero counts and no error (GI-C002)', () => {
    const meta: SyncMetadata = { connectors: { slack: connectorEntry({}) } };

    const findings = checkConnectorSync(meta);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe('GI-C002');
    expect(findings[0]!.severity).toBe('warning');
  });

  it('prefers the hard-failure finding over the zero-count warning for one connector', () => {
    const meta: SyncMetadata = {
      connectors: { figma: connectorEntry({ errors: ['Missing API key'] }) },
    };

    const codes = checkConnectorSync(meta).map((f) => f.code);

    expect(codes).toEqual(['GI-C001']);
  });

  it('reports nothing when no connectors are configured', () => {
    expect(checkConnectorSync(undefined)).toEqual([]);
    expect(checkConnectorSync({ connectors: {} })).toEqual([]);
  });
});

describe('checkExtractedNodes', () => {
  it('flags an extractor node whose name is a language keyword (#1331 case 1)', () => {
    const node = extractedNode({
      id: 'extracted:enum-constants:bbc78dbb',
      name: 'or',
      path: 'ts/src/guardian/coverage.ts',
      metadata: { members: ['function', 'const', 'if', 'if', 'if', 'return'] },
    });

    const codes = checkExtractedNodes([node]).map((f) => f.code);

    expect(codes).toContain('GI-N001');
  });

  it('flags an extractor node whose members are language keywords', () => {
    const node = extractedNode({
      id: 'extracted:enum-constants:bbc78dbb',
      name: 'LooksReal',
      metadata: { members: ['function', 'const', 'return'] },
    });

    const codes = checkExtractedNodes([node]).map((f) => f.code);

    expect(codes).toContain('GI-N002');
  });

  it('does not flag string-literal union members that collide with keywords', () => {
    // `type CheckStatus = 'pass' | 'fail' | 'skip' | 'info'` — 'pass' is a
    // Python keyword but here it is a string VALUE, not an identifier. Union
    // members are values, so the reserved-word rule must not reach them.
    const node = extractedNode({
      id: 'extracted:enum-constants:fa1d7c67',
      name: 'CheckStatus',
      path: 'npm/src/doctor.ts',
      metadata: { kind: 'union-type', members: ['pass', 'fail', 'skip', 'info'] },
    });

    expect(checkExtractedNodes([node])).toEqual([]);
  });

  it('still flags a union type whose NAME is a reserved word', () => {
    const node = extractedNode({
      id: 'extracted:enum-constants:u1',
      name: 'with',
      metadata: { kind: 'union-type', members: ['a', 'b'] },
    });

    expect(checkExtractedNodes([node]).map((f) => f.code)).toEqual(['GI-N001']);
  });

  it('does not flag a correctly extracted enum from the same graph', () => {
    const node = extractedNode({
      id: 'extracted:enum-constants:2e6e7497',
      name: 'Severity',
      path: 'ts/src/guardian/impact-mapper.ts',
      metadata: { members: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
    });

    expect(checkExtractedNodes([node])).toEqual([]);
  });

  it('ignores nodes that did not come from an extractor', () => {
    const handAuthored: GraphNode = {
      id: 'business:or',
      type: 'business_term',
      name: 'or',
      metadata: { source: 'knowledge-doc' },
    } as GraphNode;

    expect(checkExtractedNodes([handAuthored])).toEqual([]);
  });

  it('carries file and line evidence so the finding is actionable', () => {
    const node = extractedNode({
      id: 'extracted:enum-constants:bbc78dbb',
      name: 'or',
      path: 'ts/src/guardian/coverage.ts',
      location: { fileId: 'file:ts/src/guardian/coverage.ts', startLine: 1043, endLine: 1043 },
      metadata: { members: ['function'] },
    });

    const finding = checkExtractedNodes([node]).find((f) => f.code === 'GI-N001');

    expect(finding?.evidence).toContain('ts/src/guardian/coverage.ts');
    expect(finding?.evidence).toContain('1043');
  });

  it('matches reserved words from any supported language, not just the declared one', () => {
    const pythonNode = extractedNode({
      id: 'extracted:enum-constants:py1',
      name: 'def',
      metadata: { language: 'python', members: ['A'] },
    });

    const codes = checkExtractedNodes([pythonNode]).map((f) => f.code);

    expect(codes).toContain('GI-N001');
  });
});

describe('checkGraphIntegrity', () => {
  it('reports denominators alongside findings', () => {
    const report = checkGraphIntegrity({
      syncMetadata: { connectors: { jira: connectorEntry({ errors: ['Missing API key'] }) } },
      nodes: [
        extractedNode({ id: 'extracted:enum-constants:1', name: 'Severity', metadata: {} }),
        extractedNode({ id: 'extracted:enum-constants:2', name: 'or', metadata: {} }),
      ],
    });

    expect(report.checked.connectors).toBe(1);
    expect(report.checked.extractedNodes).toBe(2);
    expect(report.checkedNothing).toBe(false);
    expect(report.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(['GI-C001', 'GI-N001'])
    );
  });

  it('an empty graph with no connectors abstains rather than passing (#1146)', () => {
    const report = checkGraphIntegrity({ syncMetadata: undefined, nodes: [] });

    expect(report.findings).toEqual([]);
    expect(report.checked).toEqual({ connectors: 0, extractedNodes: 0 });
    expect(report.checkedNothing).toBe(true);
  });

  it('a graph with nodes but no extractor-derived ones still counts as checked', () => {
    const plain: GraphNode = {
      id: 'file:a.ts',
      type: 'file',
      name: 'a.ts',
      metadata: {},
    } as GraphNode;

    const report = checkGraphIntegrity({ syncMetadata: undefined, nodes: [plain] });

    expect(report.checked.extractedNodes).toBe(0);
    expect(report.checkedNothing).toBe(true);
  });

  it('orders findings by severity so the blocking ones read first', () => {
    const report = checkGraphIntegrity({
      syncMetadata: { connectors: { slack: connectorEntry({}) } },
      nodes: [extractedNode({ id: 'extracted:enum-constants:2', name: 'or', metadata: {} })],
    });

    expect(report.findings[0]!.severity).toBe('error');
    expect(report.findings.at(-1)!.severity).toBe('warning');
  });
});
