import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CoverageScorer } from '../../src/ingest/CoverageScorer.js';
import type { CoverageReport, DomainCoverageScore } from '../../src/ingest/CoverageScorer.js';
import type { GraphNode, GraphEdge } from '../../src/types.js';

// --- Helpers ---

function makeCodeNode(id: string, domain: string): GraphNode {
  return {
    id,
    type: 'function',
    name: `fn_${id}`,
    path: `src/${domain}/${id}.ts`,
    metadata: { domain },
  };
}

function makeKnowledgeNode(
  id: string,
  domain: string,
  source: string,
  type: GraphNode['type'] = 'business_fact'
): GraphNode {
  return {
    id,
    type,
    name: `knowledge_${id}`,
    metadata: { domain, source },
  };
}

function makeEdge(from: string, to: string, type: GraphEdge['type'] = 'governs'): GraphEdge {
  return { from, to, type };
}

function findDomain(report: CoverageReport, domain: string): DomainCoverageScore | undefined {
  return report.domains.find((d) => d.domain === domain);
}

// --- Tests ---

describe('CoverageScorer', () => {
  it('scores full coverage as grade A', () => {
    const store = new GraphStore();
    const scorer = new CoverageScorer();

    // 3 code nodes in 'auth' domain
    const codeNodes = [
      makeCodeNode('auth-fn-1', 'auth'),
      makeCodeNode('auth-fn-2', 'auth'),
      makeCodeNode('auth-fn-3', 'auth'),
    ];
    for (const node of codeNodes) store.addNode(node);

    // 10+ knowledge nodes from 3 different sources
    const sources = ['confluence', 'jira', 'slack'];
    for (let i = 0; i < 12; i++) {
      store.addNode(makeKnowledgeNode(`kn-${i}`, 'auth', sources[i % 3]!));
    }

    // Link ALL code nodes to knowledge nodes
    for (const codeNode of codeNodes) {
      store.addEdge(makeEdge('kn-0', codeNode.id, 'governs'));
    }

    const report = scorer.score(store);
    const authDomain = findDomain(report, 'auth');

    expect(authDomain).toBeDefined();
    expect(authDomain!.score).toBeGreaterThanOrEqual(80);
    expect(authDomain!.grade).toBe('A');
  });

  it('scores empty domain as grade F', () => {
    const store = new GraphStore();
    const scorer = new CoverageScorer();

    // Code nodes only, no knowledge nodes, no edges
    store.addNode(makeCodeNode('lonely-1', 'payments'));
    store.addNode(makeCodeNode('lonely-2', 'payments'));

    const report = scorer.score(store);
    const paymentsDomain = findDomain(report, 'payments');

    expect(paymentsDomain).toBeDefined();
    expect(paymentsDomain!.score).toBeLessThan(20);
    expect(paymentsDomain!.grade).toBe('F');
    expect(paymentsDomain!.knowledgeEntries).toBe(0);
    expect(paymentsDomain!.linkedEntities).toBe(0);
    expect(paymentsDomain!.unlinkedEntities).toBe(2);
  });

  it('computes correct overall score as weighted average', () => {
    const store = new GraphStore();
    const scorer = new CoverageScorer();

    // Domain A: full coverage (should score high)
    for (let i = 0; i < 3; i++) store.addNode(makeCodeNode(`a-fn-${i}`, 'domainA'));
    for (let i = 0; i < 10; i++) {
      store.addNode(makeKnowledgeNode(`a-kn-${i}`, 'domainA', ['s1', 's2', 's3'][i % 3]!));
    }
    for (let i = 0; i < 3; i++) store.addEdge(makeEdge(`a-kn-${i}`, `a-fn-${i}`, 'governs'));

    // Domain B: no knowledge (should score 0)
    store.addNode(makeCodeNode('b-fn-0', 'domainB'));

    const report = scorer.score(store);
    const domA = findDomain(report, 'domainA');
    const domB = findDomain(report, 'domainB');

    expect(domA).toBeDefined();
    expect(domB).toBeDefined();

    // Overall should be the average of the two domain scores
    const expectedOverall = Math.round((domA!.score + domB!.score) / 2);
    expect(report.overallScore).toBe(expectedOverall);
  });

  it('returns empty report for empty graph', () => {
    const store = new GraphStore();
    const scorer = new CoverageScorer();

    const report = scorer.score(store);

    expect(report.domains).toHaveLength(0);
    expect(report.overallScore).toBe(0);
    expect(report.overallGrade).toBe('F');
    expect(report.generatedAt).toBeDefined();
    // Validate ISO timestamp format
    expect(() => new Date(report.generatedAt)).not.toThrow();
  });

  it('source diversity contributes to score', () => {
    const store1 = new GraphStore();
    const store3 = new GraphStore();
    const scorer = new CoverageScorer();

    // Store 1: 6 knowledge entries from 1 source
    store1.addNode(makeCodeNode('fn-1', 'billing'));
    for (let i = 0; i < 6; i++) {
      store1.addNode(makeKnowledgeNode(`k1-${i}`, 'billing', 'confluence'));
    }

    // Store 3: 6 knowledge entries from 3 sources
    store3.addNode(makeCodeNode('fn-1', 'billing'));
    for (let i = 0; i < 6; i++) {
      store3.addNode(
        makeKnowledgeNode(`k3-${i}`, 'billing', ['confluence', 'jira', 'slack'][i % 3]!)
      );
    }

    const report1 = scorer.score(store1);
    const report3 = scorer.score(store3);

    const single = findDomain(report1, 'billing');
    const diverse = findDomain(report3, 'billing');

    expect(single).toBeDefined();
    expect(diverse).toBeDefined();
    // 3 sources should score higher than 1 source (the diversity component differs)
    expect(diverse!.score).toBeGreaterThan(single!.score);
    expect(Object.keys(diverse!.sourceBreakdown)).toHaveLength(3);
    expect(Object.keys(single!.sourceBreakdown)).toHaveLength(1);
  });

  describe('grade boundaries are correct', () => {
    const scorer = new CoverageScorer();

    // We test grade assignment by constructing stores that produce known scores.
    // The score formula: codeCoverage(60%) + knowledgeDepth(20%) + sourceDiversity(20%)

    it('grade A: score >= 80', () => {
      const store = new GraphStore();
      // 3 code nodes all linked, 10+ knowledge from 3 sources → 60 + 20 + 20 = 100
      for (let i = 0; i < 3; i++) store.addNode(makeCodeNode(`c-${i}`, 'test'));
      for (let i = 0; i < 10; i++) {
        store.addNode(makeKnowledgeNode(`k-${i}`, 'test', ['a', 'b', 'c'][i % 3]!));
      }
      for (let i = 0; i < 3; i++) store.addEdge(makeEdge(`k-${i}`, `c-${i}`, 'governs'));

      const report = scorer.score(store);
      const domain = findDomain(report, 'test');
      expect(domain!.score).toBeGreaterThanOrEqual(80);
      expect(domain!.grade).toBe('A');
    });

    it('grade B: score >= 60 and < 80', () => {
      const store = new GraphStore();
      // 3 code nodes, 2 linked → codeCoverage = (2/3)*60 = 40
      // 10 knowledge from 3 sources → depth = 20, diversity = 20 → total = 80
      // Actually let's use 2 linked of 3 with 5 knowledge from 2 sources
      // codeCoverage = (2/3)*60 = 40, depth = min(5/10,1)*20 = 10, diversity = min(2/3,1)*20 ≈ 13
      // total ≈ 63 → grade B
      for (let i = 0; i < 3; i++) store.addNode(makeCodeNode(`c-${i}`, 'test'));
      for (let i = 0; i < 5; i++) {
        store.addNode(makeKnowledgeNode(`k-${i}`, 'test', i < 3 ? 'jira' : 'slack'));
      }
      store.addEdge(makeEdge('k-0', 'c-0', 'governs'));
      store.addEdge(makeEdge('k-1', 'c-1', 'documents'));

      const report = scorer.score(store);
      const domain = findDomain(report, 'test');
      expect(domain!.score).toBeGreaterThanOrEqual(60);
      expect(domain!.score).toBeLessThan(80);
      expect(domain!.grade).toBe('B');
    });

    it('grade C: score >= 40 and < 60', () => {
      const store = new GraphStore();
      // 3 code, 1 linked → codeCoverage = (1/3)*60 = 20
      // 10 knowledge from 3 sources → depth = 20, diversity = 20 → total = 60
      // Use fewer knowledge to bring it down:
      // 1 linked of 3, 5 knowledge, 1 source
      // codeCoverage = 20, depth = 10, diversity = 6.67 → total ≈ 37
      // Try: 2 code, 1 linked, 6 knowledge, 2 sources
      // codeCoverage = (1/2)*60 = 30, depth = min(6/10,1)*20 = 12, diversity = min(2/3,1)*20 ≈ 13
      // total ≈ 55 → grade C
      for (let i = 0; i < 2; i++) store.addNode(makeCodeNode(`c-${i}`, 'test'));
      for (let i = 0; i < 6; i++) {
        store.addNode(makeKnowledgeNode(`k-${i}`, 'test', i < 3 ? 'confluence' : 'jira'));
      }
      store.addEdge(makeEdge('k-0', 'c-0', 'governs'));

      const report = scorer.score(store);
      const domain = findDomain(report, 'test');
      expect(domain!.score).toBeGreaterThanOrEqual(40);
      expect(domain!.score).toBeLessThan(60);
      expect(domain!.grade).toBe('C');
    });

    it('grade D: score >= 20 and < 40', () => {
      const store = new GraphStore();
      // 5 code, 0 linked, 3 knowledge, 1 source
      // codeCoverage = 0, depth = min(3/10,1)*20 = 6, diversity = min(1/3,1)*20 ≈ 7
      // total ≈ 13 → that's F, need a bit more
      // 5 code, 1 linked, 3 knowledge, 1 source
      // codeCoverage = (1/5)*60 = 12, depth = 6, diversity = 7 → total ≈ 25 → D
      for (let i = 0; i < 5; i++) store.addNode(makeCodeNode(`c-${i}`, 'test'));
      for (let i = 0; i < 3; i++) {
        store.addNode(makeKnowledgeNode(`k-${i}`, 'test', 'jira'));
      }
      store.addEdge(makeEdge('k-0', 'c-0', 'governs'));

      const report = scorer.score(store);
      const domain = findDomain(report, 'test');
      expect(domain!.score).toBeGreaterThanOrEqual(20);
      expect(domain!.score).toBeLessThan(40);
      expect(domain!.grade).toBe('D');
    });

    it('grade F: score < 20', () => {
      const store = new GraphStore();
      // Code only, no knowledge, no edges → score = 0
      store.addNode(makeCodeNode('c-0', 'test'));

      const report = scorer.score(store);
      const domain = findDomain(report, 'test');
      expect(domain!.score).toBeLessThan(20);
      expect(domain!.grade).toBe('F');
    });
  });

  it('tracks linked vs unlinked entities accurately', () => {
    const store = new GraphStore();
    const scorer = new CoverageScorer();

    // 4 code nodes, 2 linked
    for (let i = 0; i < 4; i++) store.addNode(makeCodeNode(`fn-${i}`, 'api'));
    store.addNode(makeKnowledgeNode('rule-1', 'api', 'jira'));
    store.addEdge(makeEdge('rule-1', 'fn-0', 'governs'));
    store.addEdge(makeEdge('rule-1', 'fn-1', 'applies_to'));

    const report = scorer.score(store);
    const apiDomain = findDomain(report, 'api');

    expect(apiDomain!.codeEntities).toBe(4);
    expect(apiDomain!.linkedEntities).toBe(2);
    expect(apiDomain!.unlinkedEntities).toBe(2);
  });

  it('recognizes multiple knowledge edge types for linking', () => {
    const store = new GraphStore();
    const scorer = new CoverageScorer();

    store.addNode(makeCodeNode('fn-a', 'core'));
    store.addNode(makeCodeNode('fn-b', 'core'));
    store.addNode(makeCodeNode('fn-c', 'core'));
    store.addNode(makeKnowledgeNode('kn-1', 'core', 'docs'));

    // Each code node linked via a different edge type
    store.addEdge(makeEdge('kn-1', 'fn-a', 'governs'));
    store.addEdge(makeEdge('kn-1', 'fn-b', 'documents'));
    store.addEdge(makeEdge('kn-1', 'fn-c', 'measures'));

    const report = scorer.score(store);
    const coreDomain = findDomain(report, 'core');

    expect(coreDomain!.linkedEntities).toBe(3);
    expect(coreDomain!.unlinkedEntities).toBe(0);
  });

  it('derives domain from path when metadata.domain is absent', () => {
    const store = new GraphStore();
    const scorer = new CoverageScorer();

    // Code node without explicit domain in metadata, path-based derivation
    store.addNode({
      id: 'fn-pathbased',
      type: 'function',
      name: 'processPayment',
      path: 'packages/billing/src/processor.ts',
      metadata: {}, // no domain
    });

    const report = scorer.score(store);
    const billingDomain = findDomain(report, 'billing');

    expect(billingDomain).toBeDefined();
    expect(billingDomain!.codeEntities).toBe(1);
  });

  it('generatedAt is a valid ISO timestamp', () => {
    const store = new GraphStore();
    const scorer = new CoverageScorer();
    const before = new Date().toISOString();
    const report = scorer.score(store);
    const after = new Date().toISOString();

    expect(report.generatedAt >= before).toBe(true);
    expect(report.generatedAt <= after).toBe(true);
  });

  it('overall grade reflects overall score', () => {
    const store = new GraphStore();
    const scorer = new CoverageScorer();

    // Single domain with full coverage → overall should match that domain
    for (let i = 0; i < 2; i++) store.addNode(makeCodeNode(`c-${i}`, 'only'));
    for (let i = 0; i < 10; i++) {
      store.addNode(makeKnowledgeNode(`k-${i}`, 'only', ['x', 'y', 'z'][i % 3]!));
    }
    for (let i = 0; i < 2; i++) store.addEdge(makeEdge(`k-${i}`, `c-${i}`, 'governs'));

    const report = scorer.score(store);
    expect(report.overallScore).toBe(report.domains[0]!.score);
    expect(report.overallGrade).toBe(report.domains[0]!.grade);
  });
});
