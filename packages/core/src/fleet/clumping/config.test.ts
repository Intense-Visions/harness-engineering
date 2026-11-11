// Laws for the `clumping` block of harness.config.json
// (docs/changes/clumping/proposal.md, Phase 6, success criterion 13).
//
// THE PROPERTY these tests are about, stated before any encoding: an adopter
// must be able to tune the clumping control WITHOUT a code change, and a
// project that never heard of the block must behave exactly as it did before
// the block existed.
//
// Those two halves are only meaningful TOGETHER. A `clumping` block that is
// declared in the schema and read by nothing satisfies the second half
// perfectly — "absent config ⇒ defaults" is trivially true of a block nobody
// consults — so every "absent ⇒ defaults" assertion below is PAIRED with a
// positive control that the same code path reads the block when it IS present.
// Without the pair, an ignored block and a correctly-defaulting one are
// indistinguishable in output.

import { describe, expect, it } from 'vitest';

import {
  ClumpingConfigSchema,
  clumpingFromConfig,
  describeSeamClumpPolicy,
  resolveSeamClumpPolicy,
  type ClumpingConfig,
} from './config';
import { DEFAULT_CLUMP_POLICY, resolveClumpPolicy } from './floor';
import type { ClumpPolicy } from './types';

/** The intake seam's built-in baseline, mirrored so core's test does not import cli. */
const INTAKE_BASELINE: Partial<ClumpPolicy> = { maxClumps: Number.MAX_SAFE_INTEGER };

describe('criterion 13 — absent config ⇒ defaults apply and nothing errors', () => {
  it('an entirely absent block resolves to the seam baseline and does not throw', () => {
    for (const seam of ['craft', 'review', 'intake'] as const) {
      expect(() => resolveSeamClumpPolicy(undefined, seam)).not.toThrow();
      expect(resolveSeamClumpPolicy(undefined, seam)).toEqual({});
    }
  });

  it('an absent block leaves a seam baseline intact', () => {
    // The case that matters: intake is uncapped BY MEASUREMENT (a cap of 20
    // over the measured 347-issue backlog would bucket ~300 filed issues), so
    // "defaults apply" must not mean "the primitive's 20 is restored".
    expect(resolveSeamClumpPolicy(undefined, 'intake', INTAKE_BASELINE)).toEqual({
      maxClumps: Number.MAX_SAFE_INTEGER,
    });
  });

  it('a config object with NO clumping key yields undefined, not a throw', () => {
    expect(clumpingFromConfig({ version: 1, name: 'adopter' })).toBeUndefined();
    expect(clumpingFromConfig({})).toBeUndefined();
    expect(clumpingFromConfig(undefined)).toBeUndefined();
    expect(clumpingFromConfig(null)).toBeUndefined();
    expect(clumpingFromConfig('not an object')).toBeUndefined();
  });

  it('the resolved policy equals DEFAULT_CLUMP_POLICY when nothing is configured', () => {
    expect(describeSeamClumpPolicy(undefined, 'craft')).toEqual(DEFAULT_CLUMP_POLICY);
    expect(describeSeamClumpPolicy(undefined, 'review')).toEqual(DEFAULT_CLUMP_POLICY);
    // …and that is the same object `resolveClumpPolicy` would hand back for an
    // absent partial, so the config path and the no-config path agree.
    expect(describeSeamClumpPolicy(undefined, 'craft')).toEqual(resolveClumpPolicy(undefined));
  });

  it('an EMPTY block behaves exactly as an absent one — `{}` is not "configured"', () => {
    // The trap `.default()` would have set: `"clumping": {}` must not quietly
    // stamp every field with the primitive default and wipe the seam baseline.
    const empty = ClumpingConfigSchema.parse({});
    expect(resolveSeamClumpPolicy(empty, 'intake', INTAKE_BASELINE)).toEqual(INTAKE_BASELINE);
    expect(resolveSeamClumpPolicy(empty, 'craft')).toEqual({});
  });
});

describe('POSITIVE CONTROL — the block is actually read when present', () => {
  // Without these, every assertion above is satisfied by a block nobody reads.

  it('a top-level field reaches every seam', () => {
    const cfg = clumpingFromConfig({ clumping: { maxPerClump: 4 } })!;
    expect(cfg).toBeDefined();
    for (const seam of ['craft', 'review', 'intake'] as const) {
      expect(resolveSeamClumpPolicy(cfg, seam).maxPerClump).toBe(4);
    }
    // …and it is NOT the default, so the assertion can tell the two apart.
    expect(DEFAULT_CLUMP_POLICY.maxPerClump).not.toBe(4);
  });

  it('every one of the five ClumpPolicy fields is expressible', () => {
    const cfg = clumpingFromConfig({
      clumping: {
        maxPerClump: 3,
        maxClumps: 5,
        minToClump: 7,
        floorResolution: 'file',
        floorEnabled: false,
      },
    })!;
    expect(describeSeamClumpPolicy(cfg, 'craft')).toEqual({
      maxPerClump: 3,
      maxClumps: 5,
      minToClump: 7,
      floorResolution: 'file',
      floorEnabled: false,
    });
    // Pinned as a COMPLEMENT over the policy's own keys, so a sixth field added
    // to ClumpPolicy fails here rather than being silently unconfigurable.
    expect(Object.keys(describeSeamClumpPolicy(cfg, 'craft')).sort()).toEqual(
      Object.keys(DEFAULT_CLUMP_POLICY).sort()
    );
  });

  it('`floorEnabled: false` survives — the field `||` would have eaten', () => {
    const cfg = clumpingFromConfig({ clumping: { floorEnabled: false } })!;
    expect(resolveSeamClumpPolicy(cfg, 'review').floorEnabled).toBe(false);
    expect(describeSeamClumpPolicy(cfg, 'review').floorEnabled).toBe(false);
  });
});

describe('a per-seam override is expressible — the seams have different correct defaults', () => {
  it('a seam entry wins over the top-level fields', () => {
    const cfg = clumpingFromConfig({
      clumping: { maxPerClump: 4, seams: { intake: { maxPerClump: 50 } } },
    })!;
    expect(resolveSeamClumpPolicy(cfg, 'intake').maxPerClump).toBe(50);
    // …and ONLY at that seam. If `seams` leaked, this would read 50 too.
    expect(resolveSeamClumpPolicy(cfg, 'craft').maxPerClump).toBe(4);
    expect(resolveSeamClumpPolicy(cfg, 'review').maxPerClump).toBe(4);
  });

  it('a seam entry leaves the fields it does not name alone', () => {
    const cfg = clumpingFromConfig({
      clumping: { maxPerClump: 4, minToClump: 3, seams: { craft: { maxPerClump: 9 } } },
    })!;
    expect(resolveSeamClumpPolicy(cfg, 'craft')).toEqual({ maxPerClump: 9, minToClump: 3 });
  });

  it('intake can be capped deliberately while craft and review stay uncapped-by-seam', () => {
    // The adopter's dialect for "yes, I really do want a bound at intake".
    const cfg = clumpingFromConfig({ clumping: { seams: { intake: { maxClumps: 20 } } } })!;
    expect(resolveSeamClumpPolicy(cfg, 'intake', INTAKE_BASELINE).maxClumps).toBe(20);
    expect(resolveSeamClumpPolicy(cfg, 'craft').maxClumps).toBeUndefined();
  });

  it('a top-level field DOES override a seam baseline, deliberately', () => {
    // Adopter config beats a built-in default. Safe because both seams carrying
    // a non-default baseline DEGRADE an over-cap unit to individual items
    // rather than dropping it — the cap changes grouping, never membership.
    const cfg = clumpingFromConfig({ clumping: { maxClumps: 20 } })!;
    expect(resolveSeamClumpPolicy(cfg, 'intake', INTAKE_BASELINE).maxClumps).toBe(20);
  });

  it('a field the adopter did NOT write never clobbers the seam baseline with undefined', () => {
    // The spread bug this module exists to avoid: `{...baseline, ...block}`
    // where `block.maxClumps` is an explicitly-`undefined` key restores the
    // primitive's 20 at intake and sheds ~300 filed issues.
    const cfg: ClumpingConfig = { maxPerClump: 6, maxClumps: undefined };
    expect(resolveSeamClumpPolicy(cfg, 'intake', INTAKE_BASELINE)).toEqual({
      maxPerClump: 6,
      maxClumps: Number.MAX_SAFE_INTEGER,
    });
  });
});

describe('a malformed block degrades to the baseline instead of taking the run down', () => {
  it('a bad field type yields undefined, not a throw', () => {
    expect(() => clumpingFromConfig({ clumping: { maxPerClump: 'twelve' } })).not.toThrow();
    expect(clumpingFromConfig({ clumping: { maxPerClump: 'twelve' } })).toBeUndefined();
  });

  it('…and that means the seam runs on its baseline, identical to no block at all', () => {
    const bad = clumpingFromConfig({ clumping: { maxClumps: -1 } });
    expect(resolveSeamClumpPolicy(bad, 'intake', INTAKE_BASELINE)).toEqual(
      resolveSeamClumpPolicy(undefined, 'intake', INTAKE_BASELINE)
    );
  });

  it('rejects the values whose semantics the primitive cannot honour', () => {
    // A cap of 0 emits nothing; `minToClump: 1` means a one-member group is a
    // clump, which is what `solo` already is.
    expect(ClumpingConfigSchema.safeParse({ maxClumps: 0 }).success).toBe(false);
    expect(ClumpingConfigSchema.safeParse({ maxPerClump: 0 }).success).toBe(false);
    expect(ClumpingConfigSchema.safeParse({ minToClump: 1 }).success).toBe(false);
    expect(ClumpingConfigSchema.safeParse({ floorResolution: 'maybe' }).success).toBe(false);
    // POSITIVE CONTROL: the same shapes one notch inside the bound DO parse, so
    // the four rejections above are the bounds and not a schema that rejects
    // everything.
    expect(ClumpingConfigSchema.safeParse({ maxClumps: 1 }).success).toBe(true);
    expect(ClumpingConfigSchema.safeParse({ maxPerClump: 1 }).success).toBe(true);
    expect(ClumpingConfigSchema.safeParse({ minToClump: 2 }).success).toBe(true);
    expect(ClumpingConfigSchema.safeParse({ floorResolution: 'file' }).success).toBe(true);
  });

  it('an unknown key is DROPPED, not fatal — the cli loader reports it instead', () => {
    // `.strict()` here would fail the WHOLE config load over one misspelled
    // tuning field, taking down commands that never read this block.
    const parsed = ClumpingConfigSchema.safeParse({ maxPerClump: 4, maxPerClamp: 9 });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ maxPerClump: 4 });
  });
});
