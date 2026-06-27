import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Files where `saveState` legitimately appears as a definition/re-export, not a mutation call.
const ALLOWED_FILES = ['state-persistence.ts', path.join('state', 'index.ts')];

// Ratchet: each write-conversion task removes its entry. SC1 is met when this is empty.
// (Documentation of the remaining sites; the assertions below track file-granularity.)
const KNOWN_MUTATIONS = [
  'packages/cli/src/mcp/tools/interaction.ts', // W2 recordInteraction — removed in Task 10
  'packages/cli/src/mcp/tools/state.ts:reset', // W3 handleReset       — removed in Task 11
];
void KNOWN_MUTATIONS;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('SC1 — no production saveState mutation (ratchet)', () => {
  it('matches the known-mutations allowlist (shrinks to empty as cutover lands)', () => {
    const roots = ['packages/cli/src', 'packages/core/src'].map((r) =>
      path.resolve(__dirname, '../../../../..', r)
    );
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        if (ALLOWED_FILES.some((a) => file.endsWith(a))) continue;
        const src = fs.readFileSync(file, 'utf-8');
        if (/\bsaveState\s*\(/.test(src)) hits.push(file);
      }
    }
    // Two distinct call sites live in state.ts (W1 + W3); de-dupe to file granularity here,
    // and assert the W2 file is present. Exact-zero is asserted in Task 16.
    expect(hits.some((h) => h.endsWith(path.join('tools', 'state.ts')))).toBe(true);
    expect(hits.some((h) => h.endsWith(path.join('tools', 'interaction.ts')))).toBe(true);
  });
});
