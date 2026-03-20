import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { IngestResult } from '../types.js';
import { hash, mergeResults, emptyResult } from './ingestUtils.js';

interface DTCGToken {
  $value: unknown;
  $type: string;
  $description?: string;
}

function isDTCGToken(obj: unknown): obj is DTCGToken {
  return typeof obj === 'object' && obj !== null && '$value' in obj && '$type' in obj;
}

async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function parseJsonOrError(
  content: string,
  filePath: string
): { data: Record<string, unknown> } | { error: string } {
  try {
    return { data: JSON.parse(content) as Record<string, unknown> };
  } catch (err) {
    return {
      error: `Failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function walkDTCGTokens(
  store: GraphStore,
  obj: Record<string, unknown>,
  groupPath: string[],
  topGroup: string,
  tokensPath: string
): number {
  let count = 0;
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;

    if (isDTCGToken(value)) {
      const tokenPath = [...groupPath, key].join('.');
      store.addNode({
        id: `design_token:${tokenPath}`,
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
      count++;
    } else if (typeof value === 'object' && value !== null) {
      count += walkDTCGTokens(
        store,
        value as Record<string, unknown>,
        [...groupPath, key],
        topGroup || key,
        tokensPath
      );
    }
  }
  return count;
}

interface AestheticDirection {
  style?: string;
  tone?: string;
  differentiator?: string;
  strictness?: string;
}

function parseAestheticDirection(content: string): AestheticDirection {
  const extract = (pattern: RegExp): string | undefined => {
    const m = content.match(pattern);
    return m ? m[1]!.trim() : undefined;
  };

  return {
    style: extract(/\*\*Style:\*\*\s*(.+)/),
    tone: extract(/\*\*Tone:\*\*\s*(.+)/),
    differentiator: extract(/\*\*Differentiator:\*\*\s*(.+)/),
    strictness: extract(/^level:\s*(strict|standard|permissive)\s*$/m),
  };
}

function parseAntiPatterns(content: string): string[] {
  const lines = content.split('\n');
  const patterns: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (/^##\s+Anti-Patterns/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) {
      break;
    }
    if (inSection) {
      const bulletMatch = line.match(/^-\s+(.+)/);
      if (bulletMatch) {
        patterns.push(bulletMatch[1]!.trim());
      }
    }
  }

  return patterns;
}

export class DesignIngestor {
  constructor(private readonly store: GraphStore) {}

  async ingestTokens(tokensPath: string): Promise<IngestResult> {
    const start = Date.now();

    const content = await readFileOrNull(tokensPath);
    if (content === null) return emptyResult(Date.now() - start);

    const parsed = parseJsonOrError(content, tokensPath);
    if ('error' in parsed) {
      return { ...emptyResult(Date.now() - start), errors: [parsed.error] };
    }

    const nodesAdded = walkDTCGTokens(this.store, parsed.data, [], '', tokensPath);

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors: [],
      durationMs: Date.now() - start,
    };
  }

  async ingestDesignIntent(designPath: string): Promise<IngestResult> {
    const start = Date.now();

    const content = await readFileOrNull(designPath);
    if (content === null) return emptyResult(Date.now() - start);

    let nodesAdded = 0;

    // Create aesthetic_intent node
    const direction = parseAestheticDirection(content);
    const metadata: Record<string, string> = {};
    if (direction.style) metadata.style = direction.style;
    if (direction.tone) metadata.tone = direction.tone;
    if (direction.differentiator) metadata.differentiator = direction.differentiator;
    if (direction.strictness) metadata.strictness = direction.strictness;

    this.store.addNode({
      id: 'aesthetic_intent:project',
      type: 'aesthetic_intent',
      name: 'project',
      path: designPath,
      metadata,
    });
    nodesAdded++;

    // Create design_constraint nodes for anti-patterns
    for (const text of parseAntiPatterns(content)) {
      this.store.addNode({
        id: `design_constraint:${hash(text)}`,
        type: 'design_constraint',
        name: text,
        path: designPath,
        metadata: { rule: text, severity: 'warn', scope: 'project' },
      });
      nodesAdded++;
    }

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors: [],
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
