import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import type { StrategySectionName } from '@harness-engineering/types';
import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode, IngestResult, NodeType, EdgeType } from '../types.js';
import { emptyResult } from './ingestUtils.js';
import { DEFAULT_SKIP_DIRS } from './skip-dirs.js';

// Local schema mirror of @harness-engineering/core's SolutionDocFrontmatterSchema.
// Inlined because the graph layer cannot depend on core (layer rule:
// graph -> {types}; core depends on graph). The contract is documented in
// packages/types/src/solutions.ts and any divergence here will be caught by
// the BusinessKnowledgeIngestor.solutions tests.
const BUG_TRACK_CATEGORIES = [
  'build-errors',
  'test-failures',
  'runtime-errors',
  'performance-issues',
  'database-issues',
  'security-issues',
  'ui-bugs',
  'integration-issues',
  'logic-errors',
] as const;

const KNOWLEDGE_TRACK_CATEGORIES = [
  'architecture-patterns',
  'design-patterns',
  'tooling-decisions',
  'conventions',
  'dx',
  'best-practices',
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SolutionBaseSchema = z.object({
  module: z.string().min(1),
  tags: z.array(z.string()),
  problem_type: z.string().min(1),
  last_updated: z.string().regex(ISO_DATE, 'last_updated must be ISO date YYYY-MM-DD'),
});

const SolutionDocFrontmatterSchema = z.discriminatedUnion('track', [
  SolutionBaseSchema.merge(
    z.object({
      track: z.literal('bug-track'),
      category: z.enum(BUG_TRACK_CATEGORIES),
    })
  ),
  SolutionBaseSchema.merge(
    z.object({
      track: z.literal('knowledge-track'),
      category: z.enum(KNOWLEDGE_TRACK_CATEGORIES),
    })
  ),
]);

const BUSINESS_KNOWLEDGE_TYPES = new Set<string>([
  'business_rule',
  'business_process',
  'business_concept',
  'business_term',
  'business_metric',
]);

const GOVERNS_SOURCE_TYPES = new Set<string>(['business_rule', 'business_process']);
const CODE_NODE_TYPES: readonly NodeType[] = [
  'file',
  'function',
  'class',
  'method',
  'interface',
  'variable',
];
const MEASURABLE_TYPES = new Set<string>(['business_process', 'business_concept']);

// Local mirror of REQUIRED_STRATEGY_SECTIONS / OPTIONAL_STRATEGY_SECTIONS from
// @harness-engineering/types. Inlined because the graph layer takes types-only
// imports from @harness-engineering/types (see types/src/strategy.ts header) —
// runtime constants must be local. Any divergence is caught by
// BusinessKnowledgeIngestor.strategy tests, which assert section coverage
// against the same canonical list.
const STRATEGY_REQUIRED_SECTIONS: readonly StrategySectionName[] = [
  'Target problem',
  'Our approach',
  "Who it's for",
  'Key metrics',
  'Tracks',
];
const STRATEGY_OPTIONAL_SECTIONS: readonly StrategySectionName[] = [
  'Milestones',
  'Not working on',
  'Marketing',
];
const STRATEGY_KNOWN_SECTIONS = new Set<string>([
  ...STRATEGY_REQUIRED_SECTIONS,
  ...STRATEGY_OPTIONAL_SECTIONS,
]);

// Frontmatter placeholder marker — same prefix the harness-strategy template
// uses for unfilled section bodies (e.g. `<2-4 sentences. ...>`). Sections
// whose body matches this verbatim placeholder are not ingested.
const STRATEGY_PLACEHOLDER_RE = /^<[^>]+>\s*$/;

interface Frontmatter {
  type: string;
  domain: string;
  source?: string;
  tags?: string[];
  related?: string[];
}

interface NodeEntry {
  nodeId: string;
  node: GraphNode;
  content: string;
}

export class BusinessKnowledgeIngestor {
  constructor(private readonly store: GraphStore) {}

  async ingest(knowledgeDir: string): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];

    let files: string[];
    try {
      files = await this.findMarkdownFiles(knowledgeDir);
    } catch {
      return emptyResult(Date.now() - start);
    }

    const nodeEntries = await this.createNodes(files, knowledgeDir, errors);
    const edgesAdded = this.createEdges(nodeEntries);

    return {
      nodesAdded: nodeEntries.length,
      nodesUpdated: 0,
      edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  async ingestSolutions(solutionsDir: string): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];
    let files: string[];
    try {
      files = await this.findMarkdownFiles(solutionsDir);
    } catch {
      return emptyResult(Date.now() - start);
    }

    let nodesAdded = 0;
    for (const filePath of files) {
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = parseSolutionFrontmatter(raw);
        if (!parsed) {
          errors.push(`${filePath}: no frontmatter found`);
          continue;
        }
        const validation = SolutionDocFrontmatterSchema.safeParse(parsed.frontmatter);
        if (!validation.success) {
          errors.push(`${filePath}: ${validation.error.message}`);
          continue;
        }
        if (validation.data.track !== 'knowledge-track') continue;
        const relPath = path.relative(solutionsDir, filePath).replaceAll('\\', '/');
        const filename = path.basename(filePath, '.md');
        const nodeId = `bk:solutions:${validation.data.module}:${filename}`;
        const titleMatch = parsed.body.match(/^#\s+(.+)$/m);
        const name = titleMatch ? titleMatch[1]!.trim() : filename;
        const node: GraphNode = {
          id: nodeId,
          type: 'business_concept',
          name,
          path: relPath,
          content: parsed.body.trim(),
          metadata: {
            domain: validation.data.module,
            tags: validation.data.tags,
            problem_type: validation.data.problem_type,
            last_updated: validation.data.last_updated,
            source: 'solutions',
            category: validation.data.category,
          },
        };
        this.store.addNode(node);
        nodesAdded++;
      } catch (err) {
        errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Ingest the repo-root STRATEGY.md anchor as `business_fact` nodes — one per
   * non-empty section. Soft-fails when the file is absent (returns empty result
   * with no errors) so existing projects without a strategy doc keep working.
   *
   * Each emitted node carries `metadata.domain === 'strategy'` and
   * `metadata.source === 'STRATEGY.md'`, making the strategy domain
   * discoverable through the same filters as other business-knowledge nodes.
   */
  async ingestStrategy(strategyPath: string): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];

    let raw: string;
    try {
      raw = await fs.readFile(strategyPath, 'utf-8');
    } catch {
      // Absent file is the common case; do not surface as an error.
      return emptyResult(Date.now() - start);
    }

    const parsed = parseStrategyMarkdown(raw);
    if (!parsed) {
      errors.push(`${strategyPath}: no frontmatter found`);
      return { ...emptyResult(Date.now() - start), errors };
    }

    const relPath = path.basename(strategyPath);
    let nodesAdded = 0;
    for (const section of parsed.sections) {
      const node = this.buildStrategyNode(section, parsed.frontmatter, relPath);
      if (node === null) continue;
      this.store.addNode(node);
      nodesAdded++;
    }

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Build a single STRATEGY.md `business_fact` node from a parsed section.
   * Returns null when the section is unknown, empty, or carries unfilled
   * template placeholder text — callers iterate and skip nulls.
   */
  private buildStrategyNode(
    section: { name: string; body: string },
    frontmatter: Record<string, unknown>,
    relPath: string
  ): GraphNode | null {
    if (!STRATEGY_KNOWN_SECTIONS.has(section.name)) return null;
    const body = section.body.trim();
    if (body.length === 0) return null;
    if (STRATEGY_PLACEHOLDER_RE.test(body)) return null;

    const productName = typeof frontmatter.name === 'string' ? frontmatter.name : 'unnamed-product';
    return {
      id: `bk:strategy:${slugifyStrategySection(section.name)}`,
      type: 'business_fact',
      name: section.name,
      path: relPath,
      content: body,
      metadata: {
        domain: 'strategy',
        source: 'STRATEGY.md',
        section_name: section.name,
        product_name: productName,
        ...(typeof frontmatter.last_updated === 'string' && {
          last_updated: frontmatter.last_updated,
        }),
        ...(typeof frontmatter.version === 'number' && { version: frontmatter.version }),
      },
    };
  }

  private async createNodes(
    files: string[],
    knowledgeDir: string,
    errors: string[]
  ): Promise<NodeEntry[]> {
    const entries: NodeEntry[] = [];

    for (const filePath of files) {
      try {
        const entry = await this.parseAndAddNode(filePath, knowledgeDir);
        if (entry) entries.push(entry);
      } catch (err) {
        errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return entries;
  }

  private async parseAndAddNode(filePath: string, knowledgeDir: string): Promise<NodeEntry | null> {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = parseFrontmatter(raw);
    if (!parsed) return null;

    const { frontmatter, body } = parsed;
    if (!BUSINESS_KNOWLEDGE_TYPES.has(frontmatter.type)) return null;

    const relPath = path.relative(knowledgeDir, filePath).replaceAll('\\', '/');
    const domain = frontmatter.domain ?? relPath.split('/')[0] ?? 'unknown';
    const filename = path.basename(filePath, '.md');
    const nodeId = `bk:${domain}:${filename}`;

    const titleMatch = body.match(/^#\s+(.+)$/m);
    const name = titleMatch ? titleMatch[1]!.trim() : filename;

    const node: GraphNode = {
      id: nodeId,
      type: frontmatter.type as NodeType,
      name,
      path: relPath,
      content: body.trim(),
      metadata: {
        domain,
        ...(frontmatter.source && { source: frontmatter.source }),
        ...(frontmatter.tags && { tags: frontmatter.tags }),
        ...(frontmatter.related && { related: frontmatter.related }),
      },
    };

    this.store.addNode(node);
    return { nodeId, node, content: body };
  }

  private createEdges(nodeEntries: NodeEntry[]): number {
    let edgesAdded = 0;

    for (const { nodeId, node, content } of nodeEntries) {
      if (GOVERNS_SOURCE_TYPES.has(node.type)) {
        edgesAdded += this.linkToNodes(content, nodeId, 'governs', CODE_NODE_TYPES);
      } else {
        edgesAdded += this.linkToNodes(content, nodeId, 'documents', CODE_NODE_TYPES);
      }

      if (node.type === 'business_metric') {
        edgesAdded += this.linkToBusinessNodes(content, nodeId, 'measures', MEASURABLE_TYPES);
      }
    }

    return edgesAdded;
  }

  private linkToNodes(
    content: string,
    sourceNodeId: string,
    edgeType: EdgeType,
    targetTypes: readonly NodeType[]
  ): number {
    let count = 0;
    for (const nodeType of targetTypes) {
      const nodes = this.store.findNodes({ type: nodeType });
      for (const node of nodes) {
        if (node.name.length < 3) continue;
        const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const namePattern = new RegExp(`\\b${escaped}\\b`, 'i');
        if (namePattern.test(content)) {
          this.store.addEdge({ from: sourceNodeId, to: node.id, type: edgeType });
          count++;
        }
      }
    }
    return count;
  }

  private linkToBusinessNodes(
    content: string,
    sourceNodeId: string,
    edgeType: EdgeType,
    targetTypes: Set<string>
  ): number {
    let count = 0;
    for (const node of this.store.findNodes({})) {
      if (!targetTypes.has(node.type)) continue;
      if (node.name.length < 3) continue;
      const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const namePattern = new RegExp(`\\b${escaped}\\b`, 'i');
      if (namePattern.test(content)) {
        this.store.addEdge({ from: sourceNodeId, to: node.id, type: edgeType });
        count++;
      }
    }
    return count;
  }

  private async findMarkdownFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !DEFAULT_SKIP_DIRS.has(entry.name)) {
        results.push(...(await this.findMarkdownFiles(fullPath)));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
    return results;
  }
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const yamlBlock = match[1]!;
  const body = match[2]!;

  const frontmatter: Record<string, unknown> = {};
  for (const line of yamlBlock.split('\n')) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1]!;
    const value = kvMatch[2]!.trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim());
    } else {
      frontmatter[key] = value;
    }
  }

  if (!frontmatter.type || typeof frontmatter.type !== 'string') return null;
  if (!frontmatter.domain || typeof frontmatter.domain !== 'string') return null;

  return {
    frontmatter: frontmatter as unknown as Frontmatter,
    body,
  };
}

/**
 * Convert a strategy section name into the kebab-case slug used as the trailing
 * segment of its `bk:strategy:<slug>` node id. Lowercases, strips apostrophes,
 * collapses runs of non-alphanumeric characters to single hyphens, and trims
 * leading/trailing hyphens — so `"Who it's for"` becomes `who-its-for`.
 */
function slugifyStrategySection(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Minimal STRATEGY.md parser — mirrors @harness-engineering/core's
 * parseStrategyDoc shape (frontmatter + H2 sections) without pulling in the
 * gray-matter runtime, which the graph layer doesn't depend on. Returns null
 * when no frontmatter is found; returns sections with raw (un-validated)
 * names so the caller can filter against the known-section allowlist.
 */
function parseStrategyMarkdown(raw: string): {
  frontmatter: Record<string, unknown>;
  sections: { name: string; body: string }[];
} | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  const yamlBlock = match[1]!;
  const body = match[2]!;

  const frontmatter: Record<string, unknown> = {};
  for (const line of yamlBlock.split(/\r?\n/)) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1]!;
    const rawValue = kvMatch[2]!.trim();
    const unquoted = rawValue.replace(/^["']|["']$/g, '');
    const asNumber = Number(unquoted);
    if (unquoted !== '' && !Number.isNaN(asNumber) && /^-?\d+(?:\.\d+)?$/.test(unquoted)) {
      frontmatter[key] = asNumber;
    } else {
      frontmatter[key] = unquoted;
    }
  }

  const sections: { name: string; body: string }[] = [];
  const h2Re = /^##[ \t]+(.+?)[ \t]*$/gm;
  const matches: { name: string; headingStart: number; bodyStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = h2Re.exec(body)) !== null) {
    matches.push({
      name: (m[1] ?? '').trim(),
      headingStart: m.index,
      bodyStart: m.index + m[0].length,
    });
  }
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!;
    const sliceEnd = matches[i + 1]?.headingStart ?? body.length;
    sections.push({
      name: current.name,
      body: body.slice(current.bodyStart, sliceEnd).trim(),
    });
  }

  return { frontmatter, sections };
}

function parseSolutionFrontmatter(
  raw: string
): { frontmatter: Record<string, unknown>; body: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  const yamlBlock = match[1]!;
  const body = match[2]!;
  const frontmatter: Record<string, unknown> = {};
  for (const line of yamlBlock.split(/\r?\n/)) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1]!;
    const value = kvMatch[2]!.trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim());
    } else {
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body };
}
