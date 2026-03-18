import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GraphStore } from '../store/GraphStore.js';
import type { IngestResult } from '../types.js';

const execFileAsync = promisify(execFile);

export type GitRunner = (rootDir: string, args: string[]) => Promise<string>;

interface ParsedCommit {
  readonly hash: string;
  readonly shortHash: string;
  readonly author: string;
  readonly email: string;
  readonly date: string;
  readonly message: string;
  readonly files: readonly string[];
}

/**
 * Ingests git history into the graph, creating commit nodes,
 * triggered_by edges (file -> commit), and co_changes_with edges
 * for files frequently modified together.
 */
export class GitIngestor {
  constructor(
    private readonly store: GraphStore,
    private readonly gitRunner?: GitRunner
  ) {}

  async ingest(rootDir: string): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];
    let nodesAdded = 0;
    let nodesUpdated = 0;
    let edgesAdded = 0;
    let edgesUpdated = 0;

    let output: string;
    try {
      output = await this.runGit(rootDir, [
        'log',
        '--format=%H|%an|%ae|%aI|%s',
        '--name-only',
        '-n',
        '100',
      ]);
    } catch (err) {
      errors.push(`git log failed: ${err instanceof Error ? err.message : String(err)}`);
      return {
        nodesAdded: 0,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors,
        durationMs: Date.now() - start,
      };
    }

    const commits = this.parseGitLog(output);

    // Create commit nodes
    for (const commit of commits) {
      const nodeId = `commit:${commit.shortHash}`;
      this.store.addNode({
        id: nodeId,
        type: 'commit',
        name: commit.message,
        metadata: {
          author: commit.author,
          email: commit.email,
          date: commit.date,
          hash: commit.hash,
        },
      });
      nodesAdded++;

      // Create triggered_by edges from file nodes to commit nodes
      for (const file of commit.files) {
        const fileNodeId = `file:${file}`;
        const existingNode = this.store.getNode(fileNodeId);
        if (existingNode) {
          this.store.addEdge({
            from: fileNodeId,
            to: nodeId,
            type: 'triggered_by',
          });
          edgesAdded++;
        }
      }
    }

    // Compute and create co_changes_with edges
    const coChanges = this.computeCoChanges(commits);
    for (const { fileA, fileB, count } of coChanges) {
      const fileAId = `file:${fileA}`;
      const fileBId = `file:${fileB}`;
      // Only create edges if both file nodes exist
      const nodeA = this.store.getNode(fileAId);
      const nodeB = this.store.getNode(fileBId);
      if (nodeA && nodeB) {
        this.store.addEdge({
          from: fileAId,
          to: fileBId,
          type: 'co_changes_with',
          metadata: { count },
        });
        edgesAdded++;
      }
    }

    return {
      nodesAdded,
      nodesUpdated,
      edgesAdded,
      edgesUpdated,
      errors,
      durationMs: Date.now() - start,
    };
  }

  private async runGit(rootDir: string, args: string[]): Promise<string> {
    if (this.gitRunner) {
      return this.gitRunner(rootDir, args);
    }
    const { stdout } = await execFileAsync('git', args, { cwd: rootDir });
    return stdout;
  }

  private parseGitLog(output: string): ParsedCommit[] {
    if (!output.trim()) return [];

    const commits: ParsedCommit[] = [];
    const lines = output.split('\n');
    let current: {
      hash: string;
      shortHash: string;
      author: string;
      email: string;
      date: string;
      message: string;
      files: string[];
      hasFiles: boolean;
    } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        // Empty line after files means end of commit entry.
        // Empty line right after the header (before files) is skipped.
        if (current && current.hasFiles) {
          commits.push({
            hash: current.hash,
            shortHash: current.shortHash,
            author: current.author,
            email: current.email,
            date: current.date,
            message: current.message,
            files: current.files,
          });
          current = null;
        }
        continue;
      }

      // Try to parse as a commit header line (contains | delimiters)
      const parts = trimmed.split('|');
      if (parts.length >= 5 && /^[0-9a-f]{7,40}$/.test(parts[0]!)) {
        // If we have a pending commit, push it first
        if (current) {
          commits.push({
            hash: current.hash,
            shortHash: current.shortHash,
            author: current.author,
            email: current.email,
            date: current.date,
            message: current.message,
            files: current.files,
          });
        }
        current = {
          hash: parts[0]!,
          shortHash: parts[0]!.substring(0, 7),
          author: parts[1]!,
          email: parts[2]!,
          date: parts[3]!,
          message: parts.slice(4).join('|'), // message may contain |
          files: [],
          hasFiles: false,
        };
      } else if (current) {
        // It's a file path
        current.files.push(trimmed);
        current.hasFiles = true;
      }
    }

    // Don't forget the last commit
    if (current) {
      commits.push({
        hash: current.hash,
        shortHash: current.shortHash,
        author: current.author,
        email: current.email,
        date: current.date,
        message: current.message,
        files: current.files,
      });
    }

    return commits;
  }

  private computeCoChanges(
    commits: readonly ParsedCommit[]
  ): Array<{ fileA: string; fileB: string; count: number }> {
    const pairCounts = new Map<string, number>();

    for (const commit of commits) {
      const files = [...commit.files].sort();
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          const key = `${files[i]}||${files[j]}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    const results: Array<{ fileA: string; fileB: string; count: number }> = [];
    for (const [key, count] of pairCounts) {
      if (count >= 2) {
        const [fileA, fileB] = key.split('||');
        results.push({ fileA: fileA!, fileB: fileB!, count });
      }
    }

    return results;
  }
}
