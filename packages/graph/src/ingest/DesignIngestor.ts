import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { GraphStore } from '../store/GraphStore.js';
import type { IngestResult } from '../types.js';

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

interface DTCGToken {
  $value: unknown;
  $type: string;
  $description?: string;
}

function isDTCGToken(obj: unknown): obj is DTCGToken {
  return typeof obj === 'object' && obj !== null && '$value' in obj && '$type' in obj;
}

export class DesignIngestor {
  constructor(private readonly store: GraphStore) {}

  async ingestTokens(tokensPath: string): Promise<IngestResult> {
    const start = Date.now();

    let content: string;
    try {
      content = await fs.readFile(tokensPath, 'utf-8');
    } catch {
      return emptyResult(Date.now() - start);
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      return {
        ...emptyResult(Date.now() - start),
        errors: [
          `Failed to parse ${tokensPath}: ${err instanceof Error ? err.message : String(err)}`,
        ],
      };
    }

    let nodesAdded = 0;
    const errors: string[] = [];

    // Walk DTCG structure recursively
    const walkTokens = (
      obj: Record<string, unknown>,
      groupPath: string[],
      topGroup: string
    ): void => {
      for (const [key, value] of Object.entries(obj)) {
        // Skip $schema and other $ meta keys at root level
        if (key.startsWith('$')) continue;

        if (isDTCGToken(value)) {
          const tokenPath = [...groupPath, key].join('.');
          const nodeId = `design_token:${tokenPath}`;
          this.store.addNode({
            id: nodeId,
            type: 'design_token',
            name: tokenPath,
            path: tokensPath,
            metadata: {
              tokenType: value.$type,
              value: value.$value,
              group: topGroup || groupPath[0] || key,
              ...(value.$description ? { description: value.$description } : {}),
            },
          });
          nodesAdded++;
        } else if (typeof value === 'object' && value !== null) {
          // It's a group — recurse
          const nextTopGroup = topGroup || key;
          walkTokens(value as Record<string, unknown>, [...groupPath, key], nextTopGroup);
        }
      }
    };

    walkTokens(data, [], '');

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  async ingestDesignIntent(designPath: string): Promise<IngestResult> {
    const start = Date.now();

    let content: string;
    try {
      content = await fs.readFile(designPath, 'utf-8');
    } catch {
      return emptyResult(Date.now() - start);
    }

    const errors: string[] = [];
    let nodesAdded = 0;

    // Parse aesthetic direction
    const styleMatch = content.match(/\*\*Style:\*\*\s*(.+)/);
    const toneMatch = content.match(/\*\*Tone:\*\*\s*(.+)/);
    const differentiatorMatch = content.match(/\*\*Differentiator:\*\*\s*(.+)/);
    const strictnessMatch = content.match(/level:\s*(.+)/);

    const style = styleMatch ? styleMatch[1]!.trim() : undefined;
    const tone = toneMatch ? toneMatch[1]!.trim() : undefined;
    const differentiator = differentiatorMatch ? differentiatorMatch[1]!.trim() : undefined;
    const strictness = strictnessMatch ? strictnessMatch[1]!.trim() : undefined;

    // Create aesthetic_intent node
    this.store.addNode({
      id: 'aesthetic_intent:project',
      type: 'aesthetic_intent',
      name: 'project',
      path: designPath,
      metadata: {
        ...(style ? { style } : {}),
        ...(tone ? { tone } : {}),
        ...(differentiator ? { differentiator } : {}),
        ...(strictness ? { strictness } : {}),
      },
    });
    nodesAdded++;

    // Parse anti-patterns: lines starting with "- " after "## Anti-Patterns" heading
    const lines = content.split('\n');
    let inAntiPatterns = false;

    for (const line of lines) {
      // Detect the Anti-Patterns section
      if (/^##\s+Anti-Patterns/i.test(line)) {
        inAntiPatterns = true;
        continue;
      }

      // Stop at the next ## heading
      if (inAntiPatterns && /^##\s+/.test(line)) {
        inAntiPatterns = false;
        continue;
      }

      if (inAntiPatterns) {
        const bulletMatch = line.match(/^-\s+(.+)/);
        if (bulletMatch) {
          const text = bulletMatch[1]!.trim();
          const nodeId = `design_constraint:${hash(text)}`;
          this.store.addNode({
            id: nodeId,
            type: 'design_constraint',
            name: text,
            path: designPath,
            metadata: {
              rule: text,
              severity: 'warn',
              scope: 'project',
            },
          });
          nodesAdded++;
        }
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

  async ingestAll(designDir: string): Promise<IngestResult> {
    const start = Date.now();
    const [tokensResult, intentResult] = await Promise.all([
      this.ingestTokens(path.join(designDir, 'tokens.json')),
      this.ingestDesignIntent(path.join(designDir, 'DESIGN.md')),
    ]);
    const merged = mergeResults(tokensResult, intentResult);
    return { ...merged, durationMs: Date.now() - start };
  }
}
