import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode, IngestResult, NodeType, EdgeType } from '../types.js';
import { emptyResult } from './ingestUtils.js';

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

interface Frontmatter {
  type: string;
  domain: string;
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
      if (
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        entry.name !== 'dist' &&
        entry.name !== 'target' &&
        entry.name !== 'build' &&
        entry.name !== '.git' &&
        entry.name !== '.gradle' &&
        entry.name !== '.harness' &&
        entry.name !== 'vendor' &&
        entry.name !== 'bin' &&
        entry.name !== 'obj' &&
        entry.name !== 'venv' &&
        entry.name !== '_build' &&
        entry.name !== 'deps' &&
        entry.name !== 'coverage'
      ) {
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
