import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
import { KnowledgeIngestor } from '../../src/ingest/KnowledgeIngestor.js';
import {
  Assembler,
  type AssembledContext,
  type GraphBudget,
  type GraphFilterResult,
  type GraphCoverageReport,
} from '../../src/context/Assembler.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('Assembler', () => {
  let store: GraphStore;
  let assembler: Assembler;

  beforeEach(async () => {
    store = new GraphStore();

    const codeIngestor = new CodeIngestor(store);
    await codeIngestor.ingest(FIXTURE_DIR);

    const knowledgeIngestor = new KnowledgeIngestor(store);
    await knowledgeIngestor.ingestAll(FIXTURE_DIR);

    assembler = new Assembler(store);
  });

  // Test 1: assembleContext returns nodes relevant to intent "authentication"
  it('assembleContext returns nodes relevant to intent "authentication"', () => {
    const result = assembler.assembleContext('authentication');
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.intent).toBe('authentication');

    // Should include auth-related nodes
    const nodeNames = result.nodes.map((n) => n.name);
    const hasAuthRelated = nodeNames.some(
      (name) => name.toLowerCase().includes('auth') || name.toLowerCase().includes('authenticate')
    );
    expect(hasAuthRelated).toBe(true);
  });

  // Test 2: assembleContext respects token budget (small budget -> fewer nodes)
  it('assembleContext respects token budget', () => {
    const largeBudget = assembler.assembleContext('auth', 10000);
    const smallBudget = assembler.assembleContext('auth', 50);

    expect(smallBudget.nodes.length).toBeLessThanOrEqual(largeBudget.nodes.length);
    expect(smallBudget.tokenEstimate).toBeLessThanOrEqual(largeBudget.tokenEstimate);
  });

  // Test 3: assembleContext returns truncated=true when budget exceeded
  it('assembleContext returns truncated=true when budget is very small', () => {
    // Add many nodes to ensure we exceed a tiny budget
    for (let i = 0; i < 50; i++) {
      store.addNode({
        id: `fn:test${i}`,
        type: 'function',
        name: `testFunction${i}`,
        path: `src/test${i}.ts`,
        metadata: { index: i },
      });
    }
    const result = assembler.assembleContext('test', 10); // very small budget
    expect(result.truncated).toBe(true);
    expect(result.tokenEstimate).toBeLessThanOrEqual(10 + 50); // some tolerance
  });

  // Test 4: computeBudget returns allocations summing to totalTokens
  it('computeBudget returns allocations summing to totalTokens', () => {
    const budget = assembler.computeBudget(8000);
    expect(budget.total).toBe(8000);

    const allocationSum = Object.values(budget.allocations).reduce((s, v) => s + v, 0);
    expect(allocationSum).toBe(8000);
  });

  // Test 5: computeBudget with phase boosts relevant types
  it('computeBudget with phase boosts relevant types', () => {
    const withoutPhase = assembler.computeBudget(8000);
    const withPhase = assembler.computeBudget(8000, 'implement');

    // Code types should get a larger share with 'implement' phase
    const codeTypes = ['file', 'function', 'class', 'method', 'interface', 'variable'];
    const codeShareWithPhase = codeTypes.reduce((s, t) => s + (withPhase.allocations[t] ?? 0), 0);
    const codeShareWithout = codeTypes.reduce((s, t) => s + (withoutPhase.allocations[t] ?? 0), 0);

    expect(codeShareWithPhase).toBeGreaterThan(codeShareWithout);
  });

  // Test 6: filterForPhase('implement') returns code node types
  it('filterForPhase("implement") returns code node types', () => {
    const result = assembler.filterForPhase('implement');
    expect(result.phase).toBe('implement');
    expect(result.nodes.length).toBeGreaterThan(0);

    const codeTypes = new Set(['file', 'function', 'class', 'method', 'interface', 'variable']);
    for (const node of result.nodes) {
      expect(codeTypes.has(node.type)).toBe(true);
    }

    // Should have file paths
    expect(result.filePaths.length).toBeGreaterThan(0);
  });

  // Test 7: filterForPhase('review') returns doc/adr types
  it('filterForPhase("review") returns doc/adr types', () => {
    const result = assembler.filterForPhase('review');
    expect(result.phase).toBe('review');

    const reviewTypes = new Set(['adr', 'document', 'learning', 'commit']);
    for (const node of result.nodes) {
      expect(reviewTypes.has(node.type)).toBe(true);
    }

    // Should include ADR nodes from the fixture
    const hasAdr = result.nodes.some((n) => n.type === 'adr');
    expect(hasAdr).toBe(true);
  });

  // Test 8: generateMap returns markdown with module names
  it('generateMap returns markdown string', () => {
    // The fixture might not have module nodes, but we can add one to test
    store.addNode({
      id: 'module:services',
      type: 'module',
      name: 'services',
      metadata: {},
    });
    // Link a file to the module
    const fileNodes = store.findNodes({ type: 'file' });
    if (fileNodes.length > 0) {
      store.addEdge({
        from: 'module:services',
        to: fileNodes[0]!.id,
        type: 'contains',
      });
    }

    const map = assembler.generateMap();
    expect(map).toContain('# Repository Structure');
    expect(map).toContain('services');
  });

  // Test 9: checkCoverage reports documented nodes
  it('checkCoverage reports documented nodes', () => {
    const report = assembler.checkCoverage();
    expect(report.totalCodeNodes).toBeGreaterThan(0);

    // ADR-001 references AuthService and hashPassword, so those should be documented
    expect(report.documented.length).toBeGreaterThan(0);

    // Documented nodes should include auth-related code nodes
    const hasAuthDoc = report.documented.some(
      (id) => id.includes('AuthService') || id.includes('hashPassword') || id.includes('auth')
    );
    expect(hasAuthDoc).toBe(true);
  });

  // Test 10: checkCoverage reports undocumented nodes
  it('checkCoverage reports undocumented nodes', () => {
    const report = assembler.checkCoverage();

    // Not every code node should be documented
    expect(report.undocumented.length).toBeGreaterThan(0);

    // Coverage should be between 0 and 100
    expect(report.coveragePercentage).toBeGreaterThan(0);
    expect(report.coveragePercentage).toBeLessThan(100);

    // documented + undocumented should equal totalCodeNodes
    expect(report.documented.length + report.undocumented.length).toBe(report.totalCodeNodes);
  });
});
