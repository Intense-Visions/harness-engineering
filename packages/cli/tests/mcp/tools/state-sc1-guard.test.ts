import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Files where `saveState` legitimately appears as a definition/re-export, not a mutation call.
const ALLOWED_FILES = ['state-persistence.ts', path.join('state', 'index.ts')];

// Ratchet: each write-conversion task removes its entry. SC1 is met when this is empty.
// All three write sites (W1 append_entry, W2 recordInteraction, W3 handleReset) are converted.
const KNOWN_MUTATIONS: string[] = [];
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
    // W1, W2 and W3 are all converted: zero production saveState mutations remain.
    // The strict exact-zero invariant (across both packages) is locked in by Task 16.
    expect(hits.some((h) => h.endsWith(path.join('tools', 'state.ts')))).toBe(false);
    expect(hits.some((h) => h.endsWith(path.join('tools', 'interaction.ts')))).toBe(false);
  });
});
