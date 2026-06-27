import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const CORE_SRC = path.resolve(__dirname, '../../../../..', 'packages/core/src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/**
 * All production .ts files under packages/{cli,core}/src.
 *
 * Phase 6: the former ALLOWED_FILES carve-out (state-persistence.ts, state/index.ts)
 * is gone — the deprecated `saveState`/`loadState` definitions and their barrel
 * re-export were physically deleted, so the zero-call assertions below now cover the
 * whole tree with no exceptions.
 */
function productionFiles(): string[] {
  const roots = ['packages/cli/src', 'packages/core/src'].map((r) =>
    path.resolve(__dirname, '../../../../..', r)
  );
  const files: string[] = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      files.push(file);
    }
  }
  return files;
}

function callSites(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of productionFiles()) {
    if (pattern.test(fs.readFileSync(file, 'utf-8'))) hits.push(file);
  }
  return hits;
}

describe('SC1 — event log is the authoritative store (no legacy state-file calls)', () => {
  it('has ZERO production saveState mutations (cutover complete)', () => {
    // Every write site (W1 append_entry, W2 recordInteraction, W3 reset) emits events instead.
    expect(callSites(/\bsaveState\s*\(/)).toEqual([]);
  });

  it('has ZERO production loadState readers (all readers migrated to the snapshot projection)', () => {
    // R1 handleShow, R2 gather_context, R3 state resource, R4 state show all read via
    // readHarnessState(toHarnessState(readSnapshot(...))) now.
    expect(callSites(/\bloadState\s*\(/)).toEqual([]);
  });

  it('has NO saveState/loadState definitions or barrel re-export left (physically removed)', () => {
    // The dead state-persistence.ts (which held only the two deprecated defs) is deleted.
    expect(fs.existsSync(path.join(CORE_SRC, 'state', 'state-persistence.ts'))).toBe(false);
    // ...and the state barrel no longer re-exports the symbols.
    const barrel = fs.readFileSync(path.join(CORE_SRC, 'state', 'index.ts'), 'utf-8');
    expect(/\b(saveState|loadState)\b/.test(barrel)).toBe(false);
  });
});
