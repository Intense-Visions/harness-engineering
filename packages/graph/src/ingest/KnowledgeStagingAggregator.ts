/**
 * Knowledge Staging Aggregator
 *
 * Merges extraction results from multiple sources (code extractors, linkers, diagrams),
 * deduplicates by contentHash, writes staged JSONL, and generates gap reports.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { NodeType } from '../types.js';
import type { GraphStore } from '../store/GraphStore.js';

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

export interface GapEntry {
  readonly nodeId: string;
  readonly name: string;
  readonly nodeType: NodeType;
  readonly source: string;
  readonly hasContent: boolean;
}

export interface DomainCoverage {
  readonly domain: string;
  readonly entryCount: number;
  readonly extractedCount: number;
  readonly gapCount: number;
  readonly gapEntries: readonly GapEntry[];
}

export interface GapReport {
  readonly domains: readonly DomainCoverage[];
  readonly totalEntries: number;
  readonly totalExtracted: number;
  readonly totalGaps: number;
  readonly generatedAt: string;
}

export interface AggregateResult {
  readonly staged: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BUSINESS_NODE_TYPES: readonly NodeType[] = [
  'business_concept',
  'business_rule',
  'business_process',
  'business_term',
  'business_metric',
  'business_fact',
];

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

  private async extractDocName(filePath: string): Promise<string> {
    const raw = await fs.readFile(filePath, 'utf-8');
    // Skip frontmatter if present
    const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = fmMatch ? fmMatch[1]! : raw;
    const titleMatch = body.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1]!.trim() : path.basename(filePath, '.md');
  }

  async generateGapReport(knowledgeDir: string, store?: GraphStore): Promise<GapReport> {
    // Step 1: Collect documented entries per domain (existing logic)
    const domainDocNames = new Map<string, string[]>(); // domain -> normalized names
    const domainEntryCounts = new Map<string, number>();
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
        domainEntryCounts.set(dir.name, entryCount);

        // Step 2: Extract documented names for comparison
        if (store) {
          const names: string[] = [];
          for (const file of mdFiles) {
            const name = await this.extractDocName(path.join(domainPath, file));
            names.push(name.toLowerCase().trim());
          }
          domainDocNames.set(dir.name, names);
        }
      }
    } catch {
      // Knowledge directory doesn't exist — return empty report
    }

    // Step 3: If no store, return backward-compatible result
    if (!store) {
      const domains: DomainCoverage[] = [];
      for (const [domain, entryCount] of domainEntryCounts) {
        domains.push({ domain, entryCount, extractedCount: 0, gapCount: 0, gapEntries: [] });
      }
      return {
        domains,
        totalEntries,
        totalExtracted: 0,
        totalGaps: 0,
        generatedAt: new Date().toISOString(),
      };
    }

    // Step 4: Query store for all business nodes, group by domain, deduplicate by name
    const extractedByDomain = new Map<string, import('../types.js').GraphNode[]>();
    for (const nodeType of BUSINESS_NODE_TYPES) {
      const nodes = store.findNodes({ type: nodeType });
      for (const node of nodes) {
        const domain = (node.metadata?.domain as string) ?? 'unknown';
        const list = extractedByDomain.get(domain) ?? [];
        list.push(node);
        extractedByDomain.set(domain, list);
      }
    }

    // Deduplicate nodes with the same normalized name within each domain.
    // After materialization + re-ingestion, both extracted:* and bk:* nodes
    // can exist for the same concept. Keep the first occurrence per name.
    for (const [domain, nodes] of extractedByDomain) {
      const seen = new Set<string>();
      const deduped = nodes.filter((n) => {
        const key = n.name.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      extractedByDomain.set(domain, deduped);
    }

    // Step 5: Build domain coverage with gap analysis
    const allDomains = new Set([...domainEntryCounts.keys(), ...extractedByDomain.keys()]);
    const domains: DomainCoverage[] = [];
    let totalExtracted = 0;
    let totalGaps = 0;

    for (const domain of allDomains) {
      const entryCount = domainEntryCounts.get(domain) ?? 0;
      const extractedNodes = extractedByDomain.get(domain) ?? [];
      const extractedCount = extractedNodes.length;
      totalExtracted += extractedCount;

      const docNames = domainDocNames.get(domain) ?? [];
      const gapEntries: GapEntry[] = [];

      for (const node of extractedNodes) {
        const normalizedName = node.name.toLowerCase().trim();
        if (!docNames.includes(normalizedName)) {
          gapEntries.push({
            nodeId: node.id,
            name: node.name,
            nodeType: node.type,
            source: (node.metadata?.source as string) ?? 'unknown',
            hasContent: Boolean(node.content && node.content.trim().length >= 10),
          });
        }
      }

      totalGaps += gapEntries.length;
      domains.push({ domain, entryCount, extractedCount, gapCount: gapEntries.length, gapEntries });
    }

    return {
      domains,
      totalEntries,
      totalExtracted,
      totalGaps,
      generatedAt: new Date().toISOString(),
    };
  }

  async writeGapReport(report: GapReport): Promise<void> {
    const gapsDir = path.join(this.projectDir, '.harness', 'knowledge');
    await fs.mkdir(gapsDir, { recursive: true });

    const hasDifferential = report.totalExtracted > 0;
    const lines: string[] = [
      '# Knowledge Gaps Report',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      '## Coverage by Domain',
      '',
    ];

    if (hasDifferential) {
      lines.push(
        '| Domain | Documented | Extracted | Gaps |',
        '| ------ | ---------- | --------- | ---- |'
      );
      for (const domain of report.domains) {
        lines.push(
          `| ${domain.domain} | ${domain.entryCount} | ${domain.extractedCount} | ${domain.gapCount} |`
        );
      }
      lines.push(
        '',
        `## Summary`,
        '',
        `- **Total Documented:** ${report.totalEntries}`,
        `- **Total Extracted:** ${report.totalExtracted}`,
        `- **Total Gaps:** ${report.totalGaps}`,
        ''
      );
    } else {
      lines.push('| Domain | Entries |', '| ------ | ------- |');
      for (const domain of report.domains) {
        lines.push(`| ${domain.domain} | ${domain.entryCount} |`);
      }
      lines.push('', `## Total Entries: ${report.totalEntries}`, '');
    }

    await fs.writeFile(path.join(gapsDir, 'gaps.md'), lines.join('\n'), 'utf-8');
  }
}
