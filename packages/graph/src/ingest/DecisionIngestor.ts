import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode, IngestResult, NodeType, EdgeType } from '../types.js';
import { emptyResult } from './ingestUtils.js';
import { DEFAULT_SKIP_DIRS } from './skip-dirs.js';

const CODE_NODE_TYPES: readonly NodeType[] = [
  'file',
  'function',
  'class',
  'method',
  'interface',
  'variable',
];

interface DecisionFrontmatter {
  number: string;
  title: string;
  date?: string;
  status?: string;
  tier?: string;
  source?: string;
  supersedes?: string;
}

// Recognizes `# ADR-<n>: <title>` H1. Tolerates leading whitespace before the
// hash. The two captures are the number and the trailing title.
const ARCHITECTURE_ADR_H1 = /^\s*#\s+ADR[-\s]*(\d+)\s*[:\-—]\s*(.+?)\s*$/im;

// Field lines of the form `**Date:** 2026-04-27` written by the
// architecture-advisor template. Case-insensitive on the field name.
function matchField(body: string, field: string): string | undefined {
  const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`, 'i');
  const m = body.match(re);
  return m ? m[1]!.trim() : undefined;
}

/**
 * Ingests ADR files from docs/knowledge/decisions/ into the knowledge graph.
 *
 * Parses YAML frontmatter with fields: number, title, date, status, tier,
 * source, supersedes. Creates `decision` type graph nodes with `decided`
 * edges to code nodes mentioned in the body.
 *
 * Also supports markdown-style ADRs written by `harness-architecture-advisor`
 * at `docs/architecture/<topic>/ADR-<n>.md` (no YAML frontmatter — fields are
 * `**Date:**`, `**Status:**`, `**Deciders:**` lines). See `ingestArchitecture`.
 */
export class DecisionIngestor {
  constructor(private readonly store: GraphStore) {}

  async ingest(decisionsDir: string): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];

    let files: string[];
    try {
      files = await this.findDecisionFiles(decisionsDir);
    } catch {
      return emptyResult(Date.now() - start);
    }

    let nodesAdded = 0;
    let edgesAdded = 0;

    for (const filePath of files) {
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = this.parseFrontmatter(raw);
        if (!parsed) continue;

        const { frontmatter, body } = parsed;
        if (!frontmatter.number || !frontmatter.title) continue;

        const filename = path.basename(filePath, '.md');
        const nodeId = `decision:${filename}`;

        const node: GraphNode = {
          id: nodeId,
          type: 'decision' as NodeType,
          name: frontmatter.title,
          path: filePath,
          content: body.trim(),
          metadata: {
            number: frontmatter.number,
            ...(frontmatter.date && { date: frontmatter.date }),
            ...(frontmatter.status && { status: frontmatter.status }),
            ...(frontmatter.tier && { tier: frontmatter.tier }),
            ...(frontmatter.source && { source: frontmatter.source }),
            ...(frontmatter.supersedes && { supersedes: frontmatter.supersedes }),
          },
        };

        this.store.addNode(node);
        nodesAdded++;

        edgesAdded += this.linkToCode(body, nodeId);
      } catch (err) {
        errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Ingest ADRs written by `harness-architecture-advisor` from
   * `docs/architecture/<topic>/ADR-<n>.md`. These files do not carry YAML
   * frontmatter — the canonical format is:
   *
   * ```
   * # ADR-<n>: <Title>
   *
   * **Date:** <date>
   * **Status:** Accepted | Proposed | Superseded | Deprecated
   * **Deciders:** <who>
   * ```
   *
   * The first directory under `architectureDir` becomes `metadata.domain`
   * (the "topic"), so projects whose only knowledge substrate is ADRs surface
   * `architecture/<topic>` as a documented domain rather than reporting empty.
   *
   * Soft-fails when the directory is absent (the common case for projects that
   * do not use the architecture-advisor convention).
   */
  async ingestArchitecture(architectureDir: string): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];

    let files: string[];
    try {
      files = await this.findArchitectureAdrFiles(architectureDir);
    } catch {
      return emptyResult(Date.now() - start);
    }

    let nodesAdded = 0;
    let edgesAdded = 0;

    for (const filePath of files) {
      const delta = await this.processArchitectureAdrFile(filePath, architectureDir, errors);
      nodesAdded += delta.nodesAdded;
      edgesAdded += delta.edgesAdded;
    }

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Read, parse, and add a single architecture-advisor ADR. Returns the delta
   * the caller should fold into the aggregate counts. Errors are appended to
   * the shared `errors` array rather than thrown, matching the soft-fail
   * contract of `ingest()`.
   */
  private async processArchitectureAdrFile(
    filePath: string,
    architectureDir: string,
    errors: string[]
  ): Promise<{ nodesAdded: number; edgesAdded: number }> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = parseArchitectureAdr(raw);
      if (!parsed) return { nodesAdded: 0, edgesAdded: 0 };

      const node = buildArchitectureAdrNode(parsed, filePath, architectureDir);
      this.store.addNode(node);
      const edgesAdded = this.linkToCode(parsed.body, node.id);
      return { nodesAdded: 1, edgesAdded };
    } catch (err) {
      errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      return { nodesAdded: 0, edgesAdded: 0 };
    }
  }

  private parseFrontmatter(raw: string): { frontmatter: DecisionFrontmatter; body: string } | null {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const yamlBlock = match[1]!;
    const body = match[2]!;

    const frontmatter: Record<string, string> = {};
    for (const line of yamlBlock.split('\n')) {
      const kvMatch = line.match(/^(\w+):\s*(.+)$/);
      if (!kvMatch) continue;
      frontmatter[kvMatch[1]!] = kvMatch[2]!.trim();
    }

    // Require `number` and `title` to distinguish ADRs from other markdown
    if (!frontmatter.number || !frontmatter.title) return null;

    return {
      frontmatter: frontmatter as unknown as DecisionFrontmatter,
      body,
    };
  }

  private linkToCode(content: string, sourceNodeId: string): number {
    let count = 0;

    for (const nodeType of CODE_NODE_TYPES) {
      const codeNodes = this.store.findNodes({ type: nodeType });
      for (const node of codeNodes) {
        if (node.name.length < 3) continue;
        const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const namePattern = new RegExp(`\\b${escaped}\\b`, 'i');
        if (namePattern.test(content)) {
          this.store.addEdge({
            from: sourceNodeId,
            to: node.id,
            type: 'decided' as EdgeType,
          });
          count++;
        }
      }
    }

    return count;
  }

  private async findDecisionFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
      .map((e) => path.join(dir, e.name));
  }

  /**
   * Recursively find `ADR-*.md` files under `dir`. Skips default skip dirs
   * (node_modules etc.) to keep the scan bounded on large repos.
   */
  private async findArchitectureAdrFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (DEFAULT_SKIP_DIRS.has(entry.name)) continue;
        results.push(...(await this.findArchitectureAdrFiles(full)));
      } else if (entry.isFile() && entry.name.endsWith('.md') && /^ADR[-_]?\d/i.test(entry.name)) {
        results.push(full);
      }
    }
    return results;
  }
}

interface ParsedArchitectureAdr {
  number: string;
  title: string;
  body: string;
  date?: string;
  status?: string;
  deciders?: string;
}

/**
 * Parse a markdown-style ADR written by `harness-architecture-advisor`.
 *
 * Returns `null` when the H1 does not match `# ADR-<n>: <title>` — that
 * signals the file is not an ADR (e.g. a topic README), so the caller skips
 * it rather than producing a malformed node.
 */
function buildArchitectureAdrNode(
  parsed: ParsedArchitectureAdr,
  filePath: string,
  architectureDir: string
): GraphNode {
  const filename = path.basename(filePath, '.md');
  const relFromArch = path.relative(architectureDir, filePath).replaceAll('\\', '/');
  const topic = relFromArch.includes('/') ? relFromArch.split('/')[0]! : '';
  const nodeId = topic
    ? `decision:architecture:${topic}:${filename}`
    : `decision:architecture:${filename}`;
  return {
    id: nodeId,
    type: 'decision' as NodeType,
    name: parsed.title,
    path: filePath,
    content: parsed.body.trim(),
    metadata: {
      number: parsed.number,
      ...(topic && { domain: topic }),
      source: 'architecture',
      ...(parsed.date && { date: parsed.date }),
      ...(parsed.status && { status: parsed.status }),
      ...(parsed.deciders && { deciders: parsed.deciders }),
    },
  };
}

function parseArchitectureAdr(raw: string): ParsedArchitectureAdr | null {
  const h1 = raw.match(ARCHITECTURE_ADR_H1);
  if (!h1) return null;
  const number = h1[1]!;
  const title = h1[2]!.trim();
  const date = matchField(raw, 'Date');
  const status = matchField(raw, 'Status');
  const deciders = matchField(raw, 'Deciders');

  return {
    number,
    title,
    body: raw,
    ...(date && { date }),
    ...(status && { status }),
    ...(deciders && { deciders }),
  };
}
