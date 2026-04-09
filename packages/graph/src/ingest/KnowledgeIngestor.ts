import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode, IngestResult, EdgeType } from '../types.js';
import { hash, mergeResults, emptyResult } from './ingestUtils.js';

const CODE_NODE_TYPES = ['file', 'function', 'class', 'method', 'interface', 'variable'] as const;

export class KnowledgeIngestor {
  constructor(private readonly store: GraphStore) {}

  async ingestADRs(adrDir: string): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    let files: string[];
    try {
      files = await this.findMarkdownFiles(adrDir);
    } catch {
      return emptyResult(Date.now() - start);
    }

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const filename = path.basename(filePath, '.md');
        const nodeId = `adr:${filename}`;
        this.store.addNode(parseADRNode(nodeId, filePath, filename, content));
        nodesAdded++;
        edgesAdded += this.linkToCode(content, nodeId, 'documents');
      } catch (err) {
        errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return buildResult(nodesAdded, edgesAdded, errors, start);
  }

  async ingestLearnings(projectPath: string): Promise<IngestResult> {
    const start = Date.now();
    const filePath = path.join(projectPath, '.harness', 'learnings.md');
    const content = await readFileOrEmpty(filePath);
    if (content === null) return emptyResult(Date.now() - start);

    let nodesAdded = 0;
    let edgesAdded = 0;
    let currentDate: string | undefined;

    // Parse entries: ## headings start sections, bullets are individual learnings
    for (const line of content.split('\n')) {
      const headingMatch = line.match(/^##\s+(\S+)/);
      if (headingMatch) {
        currentDate = headingMatch[1]!;
        continue;
      }
      const bulletMatch = line.match(/^-\s+(.+)/);
      if (!bulletMatch) continue;

      const text = bulletMatch[1]!;
      const nodeId = `learning:${hash(text)}`;
      this.store.addNode(parseLearningNode(nodeId, text, currentDate));
      nodesAdded++;
      edgesAdded += this.linkToCode(text, nodeId, 'applies_to');
    }

    return buildResult(nodesAdded, edgesAdded, [], start);
  }

  async ingestFailures(projectPath: string): Promise<IngestResult> {
    const start = Date.now();
    const filePath = path.join(projectPath, '.harness', 'failures.md');
    const content = await readFileOrEmpty(filePath);
    if (content === null) return emptyResult(Date.now() - start);

    let nodesAdded = 0;
    let edgesAdded = 0;

    // Parse structured entries within ## sections
    for (const section of content.split(/^##\s+/m).filter((s) => s.trim())) {
      const parsed = parseFailureSection(section);
      if (!parsed) continue;
      const { description, node } = parsed;
      this.store.addNode(node);
      nodesAdded++;
      edgesAdded += this.linkToCode(description, node.id, 'caused_by');
    }

    return buildResult(nodesAdded, edgesAdded, [], start);
  }

  async ingestAll(projectPath: string, opts?: { adrDir?: string }): Promise<IngestResult> {
    const start = Date.now();
    const adrDir = opts?.adrDir ?? path.join(projectPath, 'docs', 'adr');
    const [adrResult, learningsResult, failuresResult] = await Promise.all([
      this.ingestADRs(adrDir),
      this.ingestLearnings(projectPath),
      this.ingestFailures(projectPath),
    ]);
    const merged = mergeResults(adrResult, learningsResult, failuresResult);
    return { ...merged, durationMs: Date.now() - start };
  }

  private linkToCode(content: string, sourceNodeId: string, edgeType: EdgeType): number {
    let count = 0;

    for (const nodeType of CODE_NODE_TYPES) {
      const codeNodes = this.store.findNodes({ type: nodeType });
      for (const node of codeNodes) {
        // Skip short names to avoid false positives (e.g. "to", "id")
        let nameMatches = false;
        if (node.name.length >= 3) {
          const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const namePattern = new RegExp(`\\b${escaped}\\b`, 'i');
          nameMatches = namePattern.test(content);
        }

        // Check path match — require at least a path segment (dir/file)
        let pathMatches = false;
        if (node.path && node.path.includes(path.sep)) {
          pathMatches = content.includes(node.path);
        }

        if (nameMatches || pathMatches) {
          this.store.addEdge({
            from: sourceNodeId,
            to: node.id,
            type: edgeType,
          });
          count++;
        }
      }
    }

    return count;
  }

  private async findMarkdownFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await this.findMarkdownFiles(fullPath)));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
    return results;
  }
}

// --- Module-level helpers ---

async function readFileOrEmpty(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function buildResult(
  nodesAdded: number,
  edgesAdded: number,
  errors: string[],
  start: number
): IngestResult {
  return {
    nodesAdded,
    nodesUpdated: 0,
    edgesAdded,
    edgesUpdated: 0,
    errors,
    durationMs: Date.now() - start,
  };
}

function parseADRNode(
  nodeId: string,
  filePath: string,
  filename: string,
  content: string
): GraphNode {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1]!.trim() : filename;
  const dateMatch = content.match(/\*\*Date:\*\*\s*(.+)/);
  const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/);
  return {
    id: nodeId,
    type: 'adr',
    name: title,
    path: filePath,
    metadata: {
      date: dateMatch ? dateMatch[1]!.trim() : undefined,
      status: statusMatch ? statusMatch[1]!.trim() : undefined,
    },
  };
}

function parseLearningNode(
  nodeId: string,
  text: string,
  currentDate: string | undefined
): GraphNode {
  const skillMatch = text.match(/\[skill:([^\]]+)\]/);
  const outcomeMatch = text.match(/\[outcome:([^\]]+)\]/);
  return {
    id: nodeId,
    type: 'learning',
    name: text,
    metadata: {
      skill: skillMatch ? skillMatch[1]! : undefined,
      outcome: outcomeMatch ? outcomeMatch[1]! : undefined,
      date: currentDate,
    },
  };
}

interface FailureParsed {
  description: string;
  node: GraphNode;
}

function parseFailureSection(section: string): FailureParsed | null {
  const descMatch = section.match(/\*\*Description:\*\*\s*(.+)/);
  const description = descMatch ? descMatch[1]!.trim() : undefined;
  if (!description) return null;
  const dateMatch = section.match(/\*\*Date:\*\*\s*(.+)/);
  const skillMatch = section.match(/\*\*Skill:\*\*\s*(.+)/);
  const typeMatch = section.match(/\*\*Type:\*\*\s*(.+)/);
  return {
    description,
    node: {
      id: `failure:${hash(description)}`,
      type: 'failure',
      name: description,
      metadata: {
        date: dateMatch ? dateMatch[1]!.trim() : undefined,
        skill: skillMatch ? skillMatch[1]!.trim() : undefined,
        type: typeMatch ? typeMatch[1]!.trim() : undefined,
      },
    },
  };
}
