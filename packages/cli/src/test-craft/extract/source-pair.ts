/**
 * Source-pair resolver — best-effort heuristic to map a test file to
 * its source file under test. Returns null when no match found
 * (caller falls back to test-file-only critique).
 *
 * v1 heuristics (first match wins):
 *   1. Sibling: foo.test.ts → foo.ts (same dir)
 *   2. Co-located in src: tests/foo.test.ts → ../src/foo.ts
 *   3. Monorepo: packages/cli/tests/foo.test.ts → packages/cli/src/foo.ts
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md
 *   (Technical Design → Source pairing).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const MAX_SOURCE_CHARS = 2000;

export interface SourcePairResult {
  file: string;
  /** Truncated source content for LLM prompt. */
  content: string;
}

export function resolveSourceFile(testFile: string): SourcePairResult | null {
  const dir = path.dirname(testFile);
  const ext = /\.tsx$/.test(testFile) ? '.tsx' : '.ts';
  const base = path.basename(testFile).replace(/\.(?:test|spec)\.(?:tsx?|jsx?)$/, '');

  const candidates = [
    // Sibling (most common in co-located setups)
    path.join(dir, base + ext),
    // tests/ peer to src/
    path.join(dir, '..', 'src', base + ext),
    // tests/ one level deeper than src/
    path.join(dir, '..', '..', 'src', base + ext),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf-8');
        const content =
          raw.length > MAX_SOURCE_CHARS
            ? raw.slice(0, MAX_SOURCE_CHARS) + '\n[…truncated for prompt cost…]'
            : raw;
        return { file: candidate, content };
      } catch {
        // Read failure — try next candidate
        continue;
      }
    }
  }
  return null;
}
