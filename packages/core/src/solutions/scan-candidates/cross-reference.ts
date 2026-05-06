import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BUG_TRACK_CATEGORIES, KNOWLEDGE_TRACK_CATEGORIES } from '../schema';
import type { ScannedCommit } from './git-scan';

const TRACK_CATEGORIES: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['bug-track', BUG_TRACK_CATEGORIES],
  ['knowledge-track', KNOWLEDGE_TRACK_CATEGORIES],
];

const STOPWORDS = new Set([
  'fix',
  'the',
  'a',
  'an',
  'in',
  'on',
  'of',
  'and',
  'or',
  'to',
  'for',
  'with',
  'is',
  'be',
  'when',
  'if',
  'this',
  'that',
  'edge',
  'case',
  'handle',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith('.md')) yield p;
  }
}

async function readDocumentedTokens(solutionsDir: string): Promise<Array<Set<string>>> {
  const docs: Array<Set<string>> = [];
  for (const [track, categories] of TRACK_CATEGORIES) {
    for (const category of categories) {
      const dir = path.join(solutionsDir, track, category);
      for await (const file of walk(dir)) {
        const raw = await fs.readFile(file, 'utf-8');
        // Title = first H1; fall back to filename.
        const m = /^#\s+(.+)$/m.exec(raw);
        const title = m?.[1] ?? path.basename(file, '.md');
        docs.push(tokenize(title));
      }
    }
  }
  return docs;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export async function crossReferenceUndocumentedFixes(
  commits: ScannedCommit[],
  solutionsDir: string
): Promise<ScannedCommit[]> {
  const documented = await readDocumentedTokens(solutionsDir);
  const OVERLAP_THRESHOLD = 0.4;
  return commits.filter((c) => {
    const tokens = tokenize(c.subject);
    return !documented.some((d) => jaccard(tokens, d) >= OVERLAP_THRESHOLD);
  });
}
