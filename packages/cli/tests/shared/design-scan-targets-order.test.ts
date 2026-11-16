/**
 * Pins the ORDER of the design scan walk (#2349).
 *
 * `collectDesignScanFiles` returned raw `readdirSync` order, which is
 * filesystem-defined (lexicographic-ish on APFS, hash order on ext4), so the
 * same tree produced differently ordered findings JSON on different machines.
 * A real filesystem cannot force a hostile order, so `readdirSync` is replaced
 * here with one that returns entries in DESCENDING name order — the walk must
 * still return an ascending, POSIX-normalized path order.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ hostileOrder: false }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const readdirSync = ((...args: Parameters<typeof actual.readdirSync>) => {
    const entries = actual.readdirSync(...args) as unknown[];
    if (!control.hostileOrder) return entries;
    const name = (e: unknown): string =>
      typeof e === 'string' ? e : String((e as { name: string }).name);
    return [...entries].sort((a, b) => (name(a) < name(b) ? 1 : name(a) > name(b) ? -1 : 0));
  }) as typeof actual.readdirSync;
  return { ...actual, default: { ...actual, readdirSync }, readdirSync };
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { collectDesignScanFiles } from '../../src/shared/design-scan-targets';

describe('design scan walk order', () => {
  let dir = '';

  afterEach(() => {
    control.hostileOrder = false;
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  it('returns files in ascending POSIX path order regardless of readdir order', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-scan-order-'));
    // `a.css` sorts BEFORE `a/z.css` ('.' < '/'), which a depth-first walk
    // that visits `a/` first would invert even under ascending readdir order.
    const relative = ['a.css', 'a/z.css', 'b/c/d.tsx', 'b/c.ts', 'z.ts'];
    for (const rel of relative) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, 'export const x = 1;\n');
    }

    control.hostileOrder = true;
    const collected = collectDesignScanFiles(dir, undefined, []).files.map((f) =>
      path.relative(dir, f).replaceAll('\\', '/')
    );

    expect(collected).toEqual([...relative].sort());
  });
});
