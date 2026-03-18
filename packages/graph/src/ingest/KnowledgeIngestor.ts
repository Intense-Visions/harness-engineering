import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { GraphStore } from '../store/GraphStore.js';
import type { IngestResult, EdgeType } from '../types.js';

const CODE_NODE_TYPES = ['file', 'function', 'class', 'method', 'interface', 'variable'] as const;

function hash(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex').slice(0, 8);
}

function mergeResults(...results: IngestResult[]): IngestResult {
  return {
    nodesAdded: results.reduce((s, r) => s + r.nodesAdded, 0),
    nodesUpdated: results.reduce((s, r) => s + r.nodesUpdated, 0),
    edgesAdded: results.reduce((s, r) => s + r.edgesAdded, 0),
    edgesUpdated: results.reduce((s, r) => s + r.edgesUpdated, 0),
    errors: results.flatMap((r) => r.errors),
    durationMs: results.reduce((s, r) => s + r.durationMs, 0),
  };
}

function emptyResult(durationMs = 0): IngestResult {
  return { nodesAdded: 0, nodesUpdated: 0, edgesAdded: 0, edgesUpdated: 0, errors: [], durationMs };
}

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

        // Extract title from first # heading
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1]!.trim() : filename;

        // Extract date and status
        const dateMatch = content.match(/\*\*Date:\*\*\s*(.+)/);
        const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/);
        const date = dateMatch ? dateMatch[1]!.trim() : undefined;
        const status = statusMatch ? statusMatch[1]!.trim() : undefined;

        const nodeId = `adr:${filename}`;
        this.store.addNode({
          id: nodeId,
          type: 'adr',
          name: title,
          path: filePath,
          metadata: { date, status },
        });
        nodesAdded++;

        // Link to code nodes
        edgesAdded += this.linkToCode(content, nodeId, 'documents');
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

  async ingestLearnings(projectPath: string): Promise<IngestResult> {
    const start = Date.now();
    const filePath = path.join(projectPath, '.harness', 'learnings.md');

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      return emptyResult(Date.now() - start);
    }

    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    // Parse entries: ## headings start sections, bullets are individual learnings
    const lines = content.split('\n');
    let currentDate: string | undefined;

    for (const line of lines) {
      // Section heading: ## date — description
      const headingMatch = line.match(/^##\s+(\S+)/);
      if (headingMatch) {
        currentDate = headingMatch[1]!;
        continue;
      }

      // Bullet point: individual learning
      const bulletMatch = line.match(/^-\s+(.+)/);
      if (!bulletMatch) continue;

      const text = bulletMatch[1]!;

      // Extract tags
      const skillMatch = text.match(/\[skill:([^\]]+)\]/);
      const outcomeMatch = text.match(/\[outcome:([^\]]+)\]/);
      const skill = skillMatch ? skillMatch[1]! : undefined;
      const outcome = outcomeMatch ? outcomeMatch[1]! : undefined;

      const nodeId = `learning:${hash(text)}`;
      this.store.addNode({
        id: nodeId,
        type: 'learning',
        name: text,
        metadata: { skill, outcome, date: currentDate },
      });
      nodesAdded++;

      // Link to code nodes
      edgesAdded += this.linkToCode(text, nodeId, 'applies_to');
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

  async ingestFailures(projectPath: string): Promise<IngestResult> {
    const start = Date.now();
    const filePath = path.join(projectPath, '.harness', 'failures.md');

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      return emptyResult(Date.now() - start);
    }

    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    // Parse structured entries within ## sections
    const sections = content.split(/^##\s+/m).filter((s) => s.trim());

    for (const section of sections) {
      const dateMatch = section.match(/\*\*Date:\*\*\s*(.+)/);
      const skillMatch = section.match(/\*\*Skill:\*\*\s*(.+)/);
      const typeMatch = section.match(/\*\*Type:\*\*\s*(.+)/);
      const descMatch = section.match(/\*\*Description:\*\*\s*(.+)/);

      const date = dateMatch ? dateMatch[1]!.trim() : undefined;
      const skill = skillMatch ? skillMatch[1]!.trim() : undefined;
      const failureType = typeMatch ? typeMatch[1]!.trim() : undefined;
      const description = descMatch ? descMatch[1]!.trim() : undefined;

      if (!description) continue;

      const nodeId = `failure:${hash(description)}`;
      this.store.addNode({
        id: nodeId,
        type: 'failure',
        name: description,
        metadata: { date, skill, type: failureType },
      });
      nodesAdded++;

      // Link to code nodes
      edgesAdded += this.linkToCode(description, nodeId, 'caused_by');
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
