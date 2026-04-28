import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode, IngestResult, NodeType, EdgeType } from '../types.js';
import { emptyResult } from './ingestUtils.js';

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

/**
 * Ingests ADR files from docs/knowledge/decisions/ into the knowledge graph.
 *
 * Parses YAML frontmatter with fields: number, title, date, status, tier,
 * source, supersedes. Creates `decision` type graph nodes with `decided`
 * edges to code nodes mentioned in the body.
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
}
