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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ClumpingConfigSchema,
  clumpingFromConfig,
  reportIgnoredClumpingBlock,
  resolveSeamClumpPolicy,
  type ClumpingConfig,
} from './config';
import { DEFAULT_CLUMP_POLICY, resolveClumpPolicy } from './floor';
import type { ClumpPolicy } from './types';

/** The intake seam's built-in baseline, mirrored so core's test does not import cli. */
const INTAKE_BASELINE: Partial<ClumpPolicy> = { maxClumps: Number.MAX_SAFE_INTEGER };

/**
 * The resolution a SEAM actually performs: the partial from the config, handed
 * to the same `resolveClumpPolicy` every seam's `formClumps`/`resolveFloor`
 * call reaches.
 *
 * Written here rather than exported from `config.ts` on purpose. An earlier
 * draft shipped this as a public `describeSeamClumpPolicy`, and its only caller
 * was this file — an export whose sole consumer is its own test is dead code
 * wearing an API costume, which is the exact defect class this spec keeps
 * catching. Composing the two real functions instead means these assertions run
 * through the production path rather than a parallel one that could drift from
 * it.
 */
function seamPolicy(
  clumping: ClumpingConfig | undefined,
  seam: Parameters<typeof resolveSeamClumpPolicy>[1],
  baseline: Partial<ClumpPolicy> = {}
): ClumpPolicy {
  return resolveClumpPolicy(resolveSeamClumpPolicy(clumping, seam, baseline));
}

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
    expect(seamPolicy(undefined, 'craft')).toEqual(DEFAULT_CLUMP_POLICY);
    expect(seamPolicy(undefined, 'review')).toEqual(DEFAULT_CLUMP_POLICY);
    // …and that is the same object `resolveClumpPolicy` would hand back for an
    // absent partial, so the config path and the no-config path agree.
    expect(seamPolicy(undefined, 'craft')).toEqual(resolveClumpPolicy(undefined));
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
    expect(seamPolicy(cfg, 'craft')).toEqual({
      maxPerClump: 3,
      maxClumps: 5,
      minToClump: 7,
      floorResolution: 'file',
      floorEnabled: false,
    });
    // Pinned as a COMPLEMENT over the policy's own keys, so a sixth field added
    // to ClumpPolicy fails here rather than being silently unconfigurable.
    expect(Object.keys(seamPolicy(cfg, 'craft')).sort()).toEqual(
      Object.keys(DEFAULT_CLUMP_POLICY).sort()
    );
  });

  it('`floorEnabled: false` survives — the field `||` would have eaten', () => {
    const cfg = clumpingFromConfig({ clumping: { floorEnabled: false } })!;
    expect(resolveSeamClumpPolicy(cfg, 'review').floorEnabled).toBe(false);
    expect(seamPolicy(cfg, 'review').floorEnabled).toBe(false);
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
  // Every case below is a malformed block, which now REPORTS on stderr (see the
  // next describe). Silenced here so these assertions stay about the degrade.
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(process.stderr, 'write').mockImplementation((): boolean => true);
  });
  afterEach(() => spy.mockRestore());

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

/**
 * THE PROPERTY: a `clumping` block that is thrown away must SAY SO.
 *
 * Stated before the encoding, because the encoding is the easy half. zod's
 * `safeParse` has no partial success, so ONE bad field discards the WHOLE block
 * — a config that sets `minToClump` correctly and `maxClumps` to 0 loses both
 * and the seam silently runs on its baseline. Measured on the shipped binary
 * before this existed: `harness fleet clump-issues` with
 * `{"clumping":{"minToClump":4,"maxClumps":0}}` clumped a 3-issue group that
 * `minToClump: 4` forbids, exit 0, and wrote nothing to stderr about it. Three
 * separate comments in this change claimed the cli loader had already reported
 * it; the loader returns an `Err` and prints nothing, and the craft seam never
 * reaches the loader at all.
 *
 * So: the report is the property, the field name is the evidence, and the
 * SILENCE on a valid block is the positive control that separates "reports a
 * degrade" from "prints on every call".
 */
describe('an ignored block is REPORTED, not swallowed', () => {
  let stderr: string[];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderr = [];
    spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown): boolean => (stderr.push(String(chunk)), true));
  });
  afterEach(() => {
    spy.mockRestore();
    delete process.env.HARNESS_SUPPRESS_CONFIG_WARNINGS;
  });

  it('names the field that failed AND says the whole block was ignored', () => {
    expect(clumpingFromConfig({ clumping: { minToClump: 4, maxClumps: 0 } })).toBeUndefined();
    const text = stderr.join('');
    expect(text).toContain('clumping.maxClumps');
    expect(text).toMatch(/IGNORED WHOLE/);
  });

  it('POSITIVE CONTROL: a block that parses prints nothing at all', () => {
    // Without this, a reporter that fires unconditionally passes the test above.
    expect(clumpingFromConfig({ clumping: { minToClump: 4 } })).toEqual({ minToClump: 4 });
    expect(stderr.join('')).toBe('');
    // …and so does an absent block, and a config that is not an object.
    expect(clumpingFromConfig({})).toBeUndefined();
    expect(clumpingFromConfig(null)).toBeUndefined();
    expect(stderr.join('')).toBe('');
  });

  it('reports the BLOCK itself when the block is not an object', () => {
    // `issue.path` is empty here, so a naive `clumping.${path.join('.')}` would
    // print a bare trailing dot and name no field.
    expect(clumpingFromConfig({ clumping: 7 })).toBeUndefined();
    const text = stderr.join('');
    expect(text).toContain('clumping:');
    expect(text).not.toContain('clumping.:');
  });

  it("honours HARNESS_SUPPRESS_CONFIG_WARNINGS, the cli loader's own opt-out", () => {
    process.env.HARNESS_SUPPRESS_CONFIG_WARNINGS = '1';
    expect(clumpingFromConfig({ clumping: { maxClumps: 0 } })).toBeUndefined();
    expect(stderr.join('')).toBe('');
  });

  it('is ONE reporter the other two seams call with their own reason', () => {
    // The craft and intake seams degrade for reasons zod never sees (an
    // unreadable file, a config that failed schema validation elsewhere), so
    // they hand in their own text and get the same headline.
    reportIgnoredClumpingBlock(['/p/harness.config.json is not valid JSON — Unexpected token']);
    const text = stderr.join('');
    expect(text).toMatch(/IGNORED WHOLE/);
    expect(text).toContain('is not valid JSON');
  });
});
