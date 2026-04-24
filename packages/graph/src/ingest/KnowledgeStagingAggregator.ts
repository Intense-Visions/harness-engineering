/**
 * Knowledge Staging Aggregator
 *
 * Merges extraction results from multiple sources (code extractors, linkers, diagrams),
 * deduplicates by contentHash, writes staged JSONL, and generates gap reports.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { NodeType } from '../types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StagedEntry {
  readonly id: string;
  readonly source: 'extractor' | 'linker' | 'diagram';
  readonly extractorName?: string;
  readonly nodeType: NodeType;
  readonly name: string;
  readonly confidence: number;
  readonly contentHash: string;
  readonly timestamp: string;
}

export interface DomainCoverage {
  readonly domain: string;
  readonly entryCount: number;
}

export interface GapReport {
  readonly domains: readonly DomainCoverage[];
  readonly totalEntries: number;
  readonly generatedAt: string;
}

export interface AggregateResult {
  readonly staged: number;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export class KnowledgeStagingAggregator {
  constructor(private readonly projectDir: string) {}

  async aggregate(
    extractorResults: readonly StagedEntry[],
    linkerResults: readonly StagedEntry[],
    diagramResults: readonly StagedEntry[]
  ): Promise<AggregateResult> {
    const all = [...extractorResults, ...linkerResults, ...diagramResults];

    // Deduplicate by contentHash, keeping highest confidence
    const byHash = new Map<string, StagedEntry>();
    for (const entry of all) {
      const existing = byHash.get(entry.contentHash);
      if (!existing || entry.confidence > existing.confidence) {
        byHash.set(entry.contentHash, entry);
      }
    }

    const deduplicated = Array.from(byHash.values());

    if (deduplicated.length === 0) {
      return { staged: 0 };
    }

    // Write to .harness/knowledge/staged/pipeline-staged.jsonl
    const stagedDir = path.join(this.projectDir, '.harness', 'knowledge', 'staged');
    await fs.mkdir(stagedDir, { recursive: true });

    const jsonl = deduplicated.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
    await fs.writeFile(path.join(stagedDir, 'pipeline-staged.jsonl'), jsonl, 'utf-8');

    return { staged: deduplicated.length };
  }

  async generateGapReport(knowledgeDir: string): Promise<GapReport> {
    const domains: DomainCoverage[] = [];
    let totalEntries = 0;

    try {
      const entries = await fs.readdir(knowledgeDir, { withFileTypes: true });
      const domainDirs = entries.filter((e) => e.isDirectory());

      for (const dir of domainDirs) {
        const domainPath = path.join(knowledgeDir, dir.name);
        const files = await fs.readdir(domainPath);
        const mdFiles = files.filter((f) => f.endsWith('.md'));
        const entryCount = mdFiles.length;
        totalEntries += entryCount;
        domains.push({ domain: dir.name, entryCount });
      }
    } catch {
      // Knowledge directory doesn't exist — return empty report
    }

    return {
      domains,
      totalEntries,
      generatedAt: new Date().toISOString(),
    };
  }

  async writeGapReport(report: GapReport): Promise<void> {
    const gapsDir = path.join(this.projectDir, '.harness', 'knowledge');
    await fs.mkdir(gapsDir, { recursive: true });

    const lines: string[] = [
      '# Knowledge Gaps Report',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      '## Coverage by Domain',
      '',
      '| Domain | Entries |',
      '| ------ | ------- |',
    ];

    for (const domain of report.domains) {
      lines.push(`| ${domain.domain} | ${domain.entryCount} |`);
    }

    lines.push('', `## Total Entries: ${report.totalEntries}`, '');

    await fs.writeFile(path.join(gapsDir, 'gaps.md'), lines.join('\n'), 'utf-8');
  }
}
