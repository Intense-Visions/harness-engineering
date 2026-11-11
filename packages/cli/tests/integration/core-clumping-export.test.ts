/**
 * Proves Phase 1 of clumping is REACHABLE, not merely present on disk.
 *
 * cli resolves `@harness-engineering/core` through the pnpm workspace symlink to
 * `packages/core/dist` (the package exports only `"."`), so this suite fails if the
 * generated barrel was not regenerated, if `fleet/index.ts` does not export the
 * module, or if core was not rebuilt. Those three are the ways Phase 1 ships
 * broken-but-green.
 *
 * Deliberately in cli, not core: a core-internal test imports by relative path and
 * would pass with a completely unwired barrel.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as core from '@harness-engineering/core';
import { DEFAULT_CLUMP_POLICY, formClumps, resolveFloor } from '@harness-engineering/core';
import type {
  Clump,
  ClumpResult,
  ClumpableItem,
  Confidence,
  CraftTier,
  Grade,
  Impact,
} from '@harness-engineering/core';

describe('@harness-engineering/core resolves the clumping primitive', () => {
  it('exports formClumps and resolveFloor as callable functions', () => {
    expect(typeof formClumps).toBe('function');
    expect(typeof resolveFloor).toBe('function');
  });

  it('exports the policy defaults', () => {
    expect(DEFAULT_CLUMP_POLICY).toMatchObject({
      maxPerClump: 12,
      maxClumps: 20,
      minToClump: 2,
    });
  });

  // POSITIVE CONTROL: the probes above can FAIL. A name that was never added must be
  // undefined on the same namespace object — otherwise "it is a function" could be
  // satisfied by a permissive module shape and the whole suite would be vacuous.
  it('does not export a name that was never added', () => {
    expect((core as Record<string, unknown>).formClumpsNotAThing).toBeUndefined();
    expect((core as Record<string, unknown>).resolveFloorNotAThing).toBeUndefined();
  });

  it('round-trips a real item through the resolved export', () => {
    const grade: Grade = {
      kind: 'axes',
      tier: 'foundational',
      impact: 'large',
      confidence: 'low',
    };
    const item: ClumpableItem = {
      id: 'a',
      scope: 'src/api',
      kind: 'CODE',
      grade,
      weight: 1,
      conflictKeys: ['src/api/a.ts'],
    };
    // The criterion-3 positive control, re-asserted across the package boundary.
    expect(resolveFloor(item, {}).below).toBe(false);

    const result: ClumpResult = formClumps([
      item,
      { ...item, id: 'b', conflictKeys: ['src/api/b.ts'] },
    ]);
    expect(result.counts.input).toBe(2);
    const clump: Clump | undefined = result.clumps[0];
    expect(clump?.members).toHaveLength(2);
    expect(clump?.id).toMatch(/^clump-[0-9a-f]{16}$/);
  });

  it('exports the relocated craft axis vocabulary (CraftTier, Impact, Confidence)', () => {
    // Type-only: these lines compile ONLY if the names are on the published .d.ts.
    const tier: CraftTier = 'foundational';
    const impact: Impact = 'large';
    const confidence: Confidence = 'low';
    expect([tier, impact, confidence]).toEqual(['foundational', 'large', 'low']);
  });

  it('still exports harness-strength Tier — craft was ADDED, not shadowed', () => {
    // `core.Tier` must still be harness-strength's
    // 'solid' | 'incomplete' | 'at-risk' | 'theatre'
    // (packages/core/src/harness-strength/types.ts:16), NOT the craft union.
    //
    // This line is the INTENT, not the gate. It is NOT a compile-time assertion
    // here, despite looking like one: packages/cli/tsconfig.json carries
    // `"exclude": [..., "tests"]`, so `tsc --noEmit` never sees this file, and
    // vitest strips types without checking them. Under a deliberate shadowing of
    // the barrel's `Tier` with the craft union, this line was MEASURED to keep
    // compiling and the cli typecheck to keep exiting 0. The executable gate is the
    // next test, which reads the built declaration surface.
    const strengthTier: core.Tier = 'solid';
    expect(strengthTier).toBe('solid');
  });

  /**
   * The real anti-shadowing gate.
   *
   * Option C in the plan — re-exporting craft's `Tier` explicitly alongside the
   * `harness-strength` star export — compiles, exits 0 on both package typechecks,
   * and SILENTLY republishes `Tier` as the craft union. Nothing in the type system
   * catches it from here, so the check has to read the artifact the barrel actually
   * publishes: `dist/index.d.ts`, which is also the file cli resolves core through.
   *
   * tsup's DTS bundler renames the craft union to a suffixed local (`Tier$1`,
   * because `harness-strength`'s `Tier` claimed the bare name first) and then
   * aliases it in the export list. The craft union must appear there as
   * `<local> as CraftTier` and must NEVER appear as `<local> as Tier` — the latter
   * IS the silent public-name redefinition.
   */
  it('publishes the craft union ONLY as CraftTier, never as Tier', () => {
    const dts = readFileSync(
      fileURLToPath(new URL('../../../core/dist/index.d.ts', import.meta.url)),
      'utf8'
    );

    // Locate whatever local name tsup gave the craft union, rather than hardcoding
    // `Tier$1`: a hardcoded suffix would silently stop matching if an unrelated
    // edit changed the collision order, and a probe that matches nothing looks
    // exactly like a probe that found nothing wrong.
    const declaration = /type (Tier\$?\d*) = 'foundational' \| 'polish' \| 'aspirational';/.exec(
      dts
    );
    expect(
      declaration,
      'the craft union is not on the published declaration surface'
    ).not.toBeNull();
    const local = declaration![1]!;

    expect(dts).toContain(`${local} as CraftTier`);
    expect(dts).not.toContain(`${local} as Tier,`);
    expect(dts).not.toContain(`${local} as Tier }`);
    expect(dts).not.toContain(`${local} as Tier;`);
  });
});
