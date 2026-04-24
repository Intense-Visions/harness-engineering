import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  KnowledgeStagingAggregator,
  type StagedEntry,
} from '../../src/ingest/KnowledgeStagingAggregator.js';

function makeEntry(overrides: Partial<StagedEntry> & { id: string }): StagedEntry {
  return {
    source: 'extractor',
    nodeType: 'business_rule',
    name: 'Default Entry',
    confidence: 0.7,
    contentHash: 'default-hash',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('KnowledgeStagingAggregator', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'staging-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('writes pipeline-staged.jsonl with entries from all sources', async () => {
    const aggregator = new KnowledgeStagingAggregator(tmpDir);
    const result = await aggregator.aggregate(
      [makeEntry({ id: 'e1', source: 'extractor', name: 'Rule 1', contentHash: 'h1' })],
      [makeEntry({ id: 'l1', source: 'linker', name: 'Fact 1', contentHash: 'h2' })],
      [makeEntry({ id: 'd1', source: 'diagram', name: 'Concept 1', contentHash: 'h3' })]
    );
    expect(result.staged).toBe(3);
    const content = await fs.readFile(
      path.join(tmpDir, '.harness', 'knowledge', 'staged', 'pipeline-staged.jsonl'),
      'utf-8'
    );
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(3);
    // Each line is valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('deduplicates entries with same contentHash, keeping highest confidence', async () => {
    const aggregator = new KnowledgeStagingAggregator(tmpDir);
    const result = await aggregator.aggregate(
      [makeEntry({ id: 'e1', name: 'Same Thing', contentHash: 'same-hash', confidence: 0.6 })],
      [makeEntry({ id: 'l1', name: 'Same Thing', contentHash: 'same-hash', confidence: 0.9 })],
      []
    );
    expect(result.staged).toBe(1);
    const content = await fs.readFile(
      path.join(tmpDir, '.harness', 'knowledge', 'staged', 'pipeline-staged.jsonl'),
      'utf-8'
    );
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.confidence).toBe(0.9);
  });

  it('generates gaps.md with per-domain entry counts', async () => {
    const aggregator = new KnowledgeStagingAggregator(tmpDir);

    // Create a docs/knowledge structure with two domains
    const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
    await fs.mkdir(path.join(knowledgeDir, 'payments'), { recursive: true });
    await fs.mkdir(path.join(knowledgeDir, 'auth'), { recursive: true });
    await fs.writeFile(
      path.join(knowledgeDir, 'payments', 'rules.md'),
      '---\ntype: business_rule\n---\nPayment rule'
    );
    await fs.writeFile(
      path.join(knowledgeDir, 'payments', 'terms.md'),
      '---\ntype: business_term\n---\nPayment term'
    );
    await fs.writeFile(
      path.join(knowledgeDir, 'auth', 'sessions.md'),
      '---\ntype: business_concept\n---\nSession mgmt'
    );

    await aggregator.aggregate([], [], []);
    const gapReport = await aggregator.generateGapReport(knowledgeDir);

    expect(gapReport.domains).toHaveLength(2);
    const payments = gapReport.domains.find((d) => d.domain === 'payments');
    expect(payments).toBeDefined();
    expect(payments!.entryCount).toBe(2);

    const auth = gapReport.domains.find((d) => d.domain === 'auth');
    expect(auth).toBeDefined();
    expect(auth!.entryCount).toBe(1);
  });

  it('writes gaps.md as markdown file', async () => {
    const aggregator = new KnowledgeStagingAggregator(tmpDir);

    const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
    await fs.mkdir(path.join(knowledgeDir, 'payments'), { recursive: true });
    await fs.writeFile(
      path.join(knowledgeDir, 'payments', 'rules.md'),
      '---\ntype: business_rule\n---\nRule'
    );

    const gapReport = await aggregator.generateGapReport(knowledgeDir);
    await aggregator.writeGapReport(gapReport);

    const gapsPath = path.join(tmpDir, '.harness', 'knowledge', 'gaps.md');
    const content = await fs.readFile(gapsPath, 'utf-8');
    expect(content).toContain('# Knowledge Gaps Report');
    expect(content).toContain('payments');
    expect(content).toContain('| Domain');
  });

  it('creates staged directory if missing', async () => {
    const aggregator = new KnowledgeStagingAggregator(tmpDir);
    await aggregator.aggregate([makeEntry({ id: 'e1', contentHash: 'h1' })], [], []);
    const stagedDir = path.join(tmpDir, '.harness', 'knowledge', 'staged');
    const stat = await fs.stat(stagedDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('returns empty result when no entries provided', async () => {
    const aggregator = new KnowledgeStagingAggregator(tmpDir);
    const result = await aggregator.aggregate([], [], []);
    expect(result.staged).toBe(0);
  });

  it('handles gap report with no knowledge directory', async () => {
    const aggregator = new KnowledgeStagingAggregator(tmpDir);
    const nonexistent = path.join(tmpDir, 'docs', 'knowledge');
    const gapReport = await aggregator.generateGapReport(nonexistent);
    expect(gapReport.domains).toHaveLength(0);
  });
});
