// packages/core/src/fleet/clumping/config.ts
//
// The `clumping` block of `harness.config.json` — the adopter-facing surface for
// `ClumpPolicy` (docs/changes/clumping/proposal.md, Phase 6, success criterion
// 13: "absent a `clumping` block, defaults shall apply and no path shall error").
//
// The Zod schema lives HERE, in core, rather than in `packages/cli/src/config/
// schema.ts`, for the reason `ArchConfigSchema` / `GoldenConfigSchema` /
// `PatternConfigSchema` already live in core and are imported by the cli schema:
// the review seam (`review/output/clump-comments.ts`) is core code reached
// through `runReviewPipeline({ config })`, so core must be able to read the
// block. A second hand-written copy of the shape in cli would be a
// dual-source-of-truth whose halves drift silently — one validating a field the
// other never reads. The cli schema imports this one.
//
// Pure: no fs, no network, no clock. Callers hand in the already-parsed block.

import { z } from 'zod';

import type { ClumpPolicy } from './types';

/**
 * Every `ClumpPolicy` field, each optional.
 *
 * Optional rather than `.default(...)`: a `.default()` would make the parsed
 * object carry a value for every field whether or not the adopter wrote one,
 * which destroys the distinction between "not configured" and "configured to
 * the default value". {@link resolveSeamClumpPolicy} layers a seam baseline
 * UNDER the config, and a seam baseline can only survive a field the adopter
 * left out if that field arrives as `undefined`. With `.default()`, the intake
 * seam's uncapped `maxClumps` would be silently overwritten by 20 on every
 * project that so much as declares `"clumping": {}`.
 *
 * Bounds are the ones the primitive's semantics require, not taste:
 * - `maxPerClump` / `maxClumps` ≥ 1 — a cap of 0 emits nothing at all.
 * - `minToClump` ≥ 2 — "a group below this many members stays solo", so 1 would
 *   mean a one-member group is a clump, which is what `solo` already is.
 *
 * NOT `.strict()`. A typo'd key is reported by the cli loader's stripped-key
 * warner (issue #862) and the config still loads; `.strict()` would fail the
 * WHOLE config load over one misspelled clumping field, taking down commands
 * that never read this block.
 */
const ClumpPolicyOverrideSchema = z.object({
  /** Max members in one clump. Absent ⇒ 12. */
  maxPerClump: z.number().int().min(1).optional(),
  /** Max EMITTED WORK UNITS (clumps + solos), never findings (D9). Absent ⇒ the seam's own default. */
  maxClumps: z.number().int().min(1).optional(),
  /** A group below this many members stays as solo items. Absent ⇒ 2. */
  minToClump: z.number().int().min(2).optional(),
  /** The CEILING a sub-floor item may resolve to; the touched set narrows it. Absent ⇒ `'act'`. */
  floorResolution: z.enum(['act', 'file']).optional(),
  /** Escape hatch, cf. `--no-claim`. Absent ⇒ true. */
  floorEnabled: z.boolean().optional(),
});

/**
 * The three seams phases 3-5 bound, named so an override can be aimed at one.
 *
 * A per-seam block exists because the seams have DIFFERENT correct defaults and
 * those differences were each established by measurement, not preference:
 *
 * - `intake` runs UNCAPPED (`INTAKE_CLUMP_POLICY`). D9's `maxClumps` bounds
 *   emitted work units at a seam that CREATES work; intake creates nothing —
 *   every issue was filed before it ran — and a cap of 20 over the measured
 *   347-issue backlog would push ~300 already-filed issues into a bucket.
 * - `review` runs with the floor already applied (`floorEnabled: false` at the
 *   `formClumps` call), because the floor ran one loop earlier and is what
 *   SELECTED the candidate set; running it twice would return zero clumps.
 * - `craft` runs on the primitive's defaults, with no touched set, so every
 *   sub-floor item degrades to `'file'` by `resolveFloor`'s own rule.
 *
 * A single block applying to all three would therefore have to pick one seam's
 * answer and be wrong at the other two. The top-level fields are the "all
 * seams" dialect for the adopter who wants one number everywhere;
 * `seams.<name>` narrows it.
 */
export type ClumpSeam = 'craft' | 'review' | 'intake';

/** The `clumping` block. Every field optional; an absent block is `undefined`. */
export const ClumpingConfigSchema = ClumpPolicyOverrideSchema.extend({
  /** Per-seam overrides. A seam's entry wins over the top-level fields. */
  seams: z
    .object({
      /** The craft creation seam (`clumpCraftFindings`). */
      craft: ClumpPolicyOverrideSchema.optional(),
      /** The review creation seam (`formatClumpedComments`). */
      review: ClumpPolicyOverrideSchema.optional(),
      /** The intake seam (`harness fleet clump-issues`). */
      intake: ClumpPolicyOverrideSchema.optional(),
    })
    .optional(),
});

export type ClumpingConfig = z.infer<typeof ClumpingConfigSchema>;
type ClumpPolicyOverride = z.infer<typeof ClumpPolicyOverrideSchema>;

/**
 * Overlay `over` onto `under`, SKIPPING every `undefined` field.
 *
 * `??` per field rather than an object spread, and for the reason `floor.ts`
 * gives for the same choice one module over: `{ ...under, ...over }` lets an
 * explicitly-`undefined` key — ordinary output from a config loader, from
 * `JSON.parse` of `{"maxClumps": null}` after a schema strip, or from an
 * optional TS field — clobber a real value with `undefined`. The seam baseline
 * it would clobber is `INTAKE_CLUMP_POLICY`, whose whole purpose is to stop
 * ~300 filed issues being shed, so the difference is not cosmetic.
 */
function overlay(
  under: Partial<ClumpPolicy>,
  over: ClumpPolicyOverride | undefined
): Partial<ClumpPolicy> {
  if (over === undefined) return under;
  const out: Partial<ClumpPolicy> = { ...under };
  if (over.maxPerClump !== undefined) out.maxPerClump = over.maxPerClump;
  if (over.maxClumps !== undefined) out.maxClumps = over.maxClumps;
  if (over.minToClump !== undefined) out.minToClump = over.minToClump;
  if (over.floorResolution !== undefined) out.floorResolution = over.floorResolution;
  if (over.floorEnabled !== undefined) out.floorEnabled = over.floorEnabled;
  return out;
}

/**
 * The policy a seam runs under, given the `clumping` block and the seam's own
 * built-in baseline.
 *
 * Precedence, innermost wins:
 *
 *     DEFAULT_CLUMP_POLICY        (resolved later, inside resolveFloor/formClumps)
 *       ← seamBaseline            (code, e.g. INTAKE_CLUMP_POLICY)
 *         ← clumping.<field>      (config, all seams)
 *           ← clumping.seams.<s>  (config, this seam)
 *             ← the caller's own argument (a CLI flag), applied by the caller
 *
 * Adopter config beats a built-in seam baseline deliberately: an adopter who
 * writes `maxClumps` is saying "bound work units here", and both seams that
 * carry a non-default baseline DEGRADE an over-cap unit to individual items
 * rather than dropping it, so honouring the override cannot silently shed
 * anything. `clumpable-issues.test.ts` and `clump-comments.test.ts` pin that
 * degrade; this function only decides the number.
 *
 * ABSENT CONFIG ⇒ the seam baseline, unmodified, and never a throw. That is
 * success criterion 13, and it is why `clumping` is accepted as `undefined`
 * rather than required.
 */
export function resolveSeamClumpPolicy(
  clumping: ClumpingConfig | undefined,
  seam: ClumpSeam,
  seamBaseline: Partial<ClumpPolicy> = {}
): Partial<ClumpPolicy> {
  if (clumping === undefined) return { ...seamBaseline };
  return overlay(overlay({ ...seamBaseline }, clumping), clumping.seams?.[seam]);
}

/** `clumping.seams.craft.maxClumps: <message>`, or bare `clumping` when the block itself is wrong. */
function describeIssue(issue: z.ZodIssue): string {
  const where = issue.path.length === 0 ? 'clumping' : `clumping.${issue.path.join('.')}`;
  return `${where}: ${issue.message}`;
}

/**
 * Say, on stderr, that a `clumping` block was ignored — and why.
 *
 * THE DEGRADE IS WHOLE-BLOCK, which is the part worth saying out loud: zod's
 * `safeParse` has no partial success, so a block setting `minToClump` correctly
 * and `maxClumps` to 0 loses BOTH. Measured before this existed:
 * `{"clumping":{"minToClump":4,"maxClumps":0}}` made `harness fleet clump-issues`
 * clump a 3-issue group that `minToClump: 4` forbids, exit 0, nothing on stderr.
 *
 * ONE reporter for all three seams, because all three were separately believed
 * to be covered by one of the others and none of them reported anything.
 *
 * stderr, never stdout: `clump-issues --json` and the craft MCP tools put
 * machine-readable output there. `HARNESS_SUPPRESS_CONFIG_WARNINGS` is the cli
 * loader's own opt-out (#862), so one switch silences config diagnostics.
 */
export function reportIgnoredClumpingBlock(reasons: readonly string[]): void {
  if (process.env.HARNESS_SUPPRESS_CONFIG_WARNINGS === '1') return;
  const lines = [
    'harness: the `clumping` config block was IGNORED WHOLE; this run used the built-in defaults.',
  ];
  for (const reason of reasons) {
    // A reason can arrive multi-line — `CLIError`'s "Invalid config:" already
    // carries its own indented issue list — so only its FIRST line takes a
    // bullet. Bulleting every line produced `- Invalid config:` followed by
    // `- clumping.maxClumps: …`, which reads as two unrelated problems.
    const [head, ...rest] = reason.split('\n');
    lines.push(`  - ${head ?? ''}`);
    for (const line of rest) lines.push(`    ${line.trim()}`);
  }
  process.stderr.write(`${lines.join('\n')}\n`);
}

/**
 * Read the `clumping` block out of a loose config object and validate it.
 *
 * Core receives the harness config as `Record<string, unknown>`
 * (`RunPipelineOptions.config`), never as a typed `HarnessConfig`, so the block
 * has to be re-validated at the boundary rather than trusted.
 *
 * DEGRADES TO `undefined` on a malformed block instead of throwing, and that is
 * the opposite of {@link validateSpendEnvelope}'s posture ON PURPOSE: a bad
 * spend envelope must stop dispatch, because the alternative is spending real
 * money past a cap the adopter asked for. A bad clumping block has no such
 * downside — the seam falls back to its baseline, which is exactly the
 * behaviour of a project with no block at all — and throwing here would take
 * down a whole review run over a mistyped tuning number.
 *
 * The degrade is REPORTED by {@link reportIgnoredClumpingBlock}, not swallowed.
 * This comment used to claim the cli loader "has already reported" it; it had
 * not — `resolveConfig` returns `Err(CLIError)` and prints nothing, and the
 * craft seam never reaches the loader at all.
 */
export function clumpingFromConfig(config: unknown): ClumpingConfig | undefined {
  if (config === null || typeof config !== 'object') return undefined;
  const block = (config as Record<string, unknown>)['clumping'];
  if (block === undefined) return undefined;
  const parsed = ClumpingConfigSchema.safeParse(block);
  if (parsed.success) return parsed.data;
  reportIgnoredClumpingBlock(parsed.error.issues.map(describeIssue));
  return undefined;
}
