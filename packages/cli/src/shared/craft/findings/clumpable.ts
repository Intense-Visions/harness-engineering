// packages/cli/src/shared/craft/findings/clumpable.ts
//
// The CRAFT half of the creation seam (docs/changes/clumping/proposal.md,
// Phase 3): "a set of like findings becomes one work item rather than N",
// applied at the only boundary a craft run owns — EMISSION.
//
// Why emission and not filing: `craft-fleet` is a SKILL.md, not code. A craft
// run's findings become issues when an AGENT reads them and calls
// `manage_roadmap` (`mcp/tools/roadmap.ts:371`, one feature → one row → one
// issue). There is no code point between emission and filing to group at, so
// grouping happens in the output every one of those agents reads. That is
// honestly weaker than "files 1 issue" — it proves emission, not consumption —
// and the proposal's Phase 5 is what closes the gap by making craft-fleet read
// `clumps` instead of `findings`.
//
// ONE adapter for all eleven families, because all eleven findings carry the
// same three things this needs: a `CODE-R\d{3}`-shaped `code`, a `target.file`,
// and the ADR-0019 axis trio.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  clumpingFromConfig,
  formClumps,
  reportIgnoredClumpingBlock,
  resolveSeamClumpPolicy,
  type ClumpPolicy,
  type ClumpResult,
  type ClumpableItem,
  type ClumpingConfig,
} from '@harness-engineering/core';

import type { Confidence, Impact, Tier } from './axes.js';
import { derivePriority } from './derived.js';

/**
 * The slice of a craft finding this adapter reads — and nothing more.
 *
 * `cite` IS DELIBERATELY ABSENT, and that absence is the design.
 * Ten families declare `cite: { rubricId, source }`; design-craft declares
 * `cite: { rubricOrPatternId, source }` (`design-craft/findings/schema.ts:78`)
 * because its findings come from rubrics OR patterns. The obvious way to derive
 * a rubric family is `cite.rubricId.split('-')[0]`, and on design-craft that
 * reads `undefined` — in plain JS a `kind` of `"undefined"`, which would silently
 * fold every CRITIQUE and POLISH finding in the repo into one bogus group that
 * LOOKS like a working clump. So the family comes from `code`, which every
 * family declares identically, and `cite` is not part of this contract at all.
 * `clumpable.test.ts` pins design-craft's real `CraftFinding` shape mapping to
 * `CRAFT`, with the ten `rubricId` families as the positive control.
 *
 * `target.line` is optional because api / cli-ergonomics / docs / knowledge
 * findings have no line — their target is a whole file or surface.
 *
 * `target.relative` is optional because exactly four families declare it
 * (api / cli-ergonomics / docs / knowledge, each as
 * `path.relative(projectRoot, full).replaceAll('\\', '/')`). It is read when
 * present and derived from `projectRoot` otherwise — see {@link craftPath}.
 */
export interface CraftClumpableFinding {
  code: string;
  tier: Tier;
  impact: Impact;
  confidence: Confidence;
  target: { file: string; line?: number; relative?: string };
}

/**
 * The rubric family: the prefix of the finding code.
 *
 * `CODE-R004` → `CODE`, `CRAFT-P001` → `CRAFT`. Nothing in the finding schemas
 * exposes a family directly, so the code namespace is the only mechanical
 * source. A code with no hyphen is its own family rather than an error: an LLM
 * can emit a malformed code, and a thrown adapter would take the whole run's
 * findings down with it when the correct degrade is "this one groups alone".
 */
export function craftKind(code: string): string {
  const cut = code.indexOf('-');
  return cut === -1 ? code : code.slice(0, cut);
}

/**
 * The PROJECT-RELATIVE POSIX path a clump is keyed on.
 *
 * THIS IS THE PORTABILITY FIX the proposal defers here from Phase 3, and the
 * defect it answers was measured, not assumed: `discoverSourceFiles`
 * (`code-craft/extract/discover.ts:50`) builds `path.join(projectRoot, ...)`, so
 * seven of the eleven families put an ABSOLUTE `target.file` on every finding —
 * e.g. `/var/folders/xy/T/alpha/packages/api/src/a.ts`. That path reaches the
 * published clump id twice: once through `scope` and once through each member
 * `id`, both of which `formClumps` hashes. Two clones of the same repo at
 * different absolute roots therefore published DIFFERENT ids for the SAME
 * finding set — success criterion 7 (determinism) held inside one clone and
 * failed across clones, which is the only place the id is actually exchanged.
 *
 * Relativizing `scope` ALONE would not have fixed it; the member ids carry the
 * path too. So the path is relativized ONCE, here, and `id`, `scope` and
 * `conflictKeys` are all derived from the result.
 *
 * Three cases, in order, and the last one is the honest limit:
 *
 *   1. `target.relative` when the family declares one. Exactly four do (api,
 *      cli-ergonomics, docs, knowledge), each already
 *      `path.relative(projectRoot, full)` in POSIX form. Preferring it means
 *      those four are portable even from a caller that cannot name a root.
 *   2. Otherwise, `path.relative(projectRoot, file)` in POSIX form — the answer
 *      for the seven families that expose NO relative path. `projectRoot` is
 *      required by {@link clumpCraftFindings} rather than optional precisely so
 *      a call site that forgets it is a COMPILE error instead of a silently
 *      machine-local id.
 *   3. The path is returned UNCHANGED when it is already relative (nothing to
 *      do) or when it is absolute but OUTSIDE `projectRoot`. The second is not
 *      laziness: `path.relative` would answer `../../other/x.ts`, whose leading
 *      `..` count is a function of how deep the root sits, so the "relative"
 *      form is just as machine-local as the absolute one. A finding on a file
 *      outside the project is not portable by any encoding, and pretending
 *      otherwise would hide that behind a plausible-looking path.
 */
export function craftPath(finding: CraftClumpableFinding, projectRoot: string): string {
  const declared = finding.target.relative;
  if (declared !== undefined && declared !== '') return declared;
  const file = finding.target.file;
  if (projectRoot === '' || !path.isAbsolute(file)) return file;
  const rel = path.relative(projectRoot, file).replaceAll('\\', '/');
  if (rel === '' || rel === '..' || rel.startsWith('../')) return file;
  return rel;
}

/**
 * The directory the finding lives in.
 *
 * Split on `/` explicitly rather than `path.dirname`: this is handed the POSIX
 * path {@link craftPath} produced, and `path.dirname` on win32 would
 * additionally split on `\`, so the same finding would produce a different
 * scope per platform and the emitted clump ids would differ between CI legs.
 */
export function craftScope(file: string): string {
  const cut = file.lastIndexOf('/');
  return cut === -1 ? '.' : file.slice(0, cut);
}

/**
 * Normalize one run's findings into the seam-neutral candidates core reads.
 *
 * Taken as a batch, not one at a time, because `ClumpableItem.id` MUST be
 * unique within a call (`formClumps` throws on a duplicate rather than collapse
 * two items) and a craft finding carries no id of its own. `code:file:line` is
 * the most identifying tuple available and it is NOT unique — two rubrics can
 * fire on two units declared on the same line of the same file — so an
 * occurrence ordinal disambiguates. The ordinal is a function of the findings
 * array, so the mapping stays deterministic for a given run.
 */
export function toClumpableItems(
  findings: readonly CraftClumpableFinding[],
  projectRoot: string
): ClumpableItem[] {
  const seen = new Map<string, number>();
  return findings.map((finding) => {
    // The relative path, NOT `target.file`. It feeds the member `id`, the
    // `scope` and the `conflictKeys` — every input the clump id is hashed from.
    const file = craftPath(finding, projectRoot);
    const stem = `${finding.code}:${file}:${finding.target.line ?? '-'}`;
    const ordinal = seen.get(stem) ?? 0;
    seen.set(stem, ordinal + 1);
    return {
      id: `${stem}#${ordinal}`,
      scope: craftScope(file),
      kind: craftKind(finding.code),
      grade: {
        kind: 'axes',
        tier: finding.tier,
        impact: finding.impact,
        confidence: finding.confidence,
      },
      // `derivePriority` is the repo's existing sort-only surface (ADR 0019,
      // `derived.ts:48`) and `weight` is documented as ordering ONLY, so the two
      // agree by construction. The floor never reads this number — it reads
      // `grade`.
      weight: derivePriority(finding.tier, finding.impact, finding.confidence),
      conflictKeys: [file],
      ref: finding,
    };
  });
}

/**
 * Form the clumps a craft run emits alongside its findings.
 *
 * NO TOUCHED SET IS PASSED, and that is the spec's stated, deliberate outcome
 * rather than an oversight. A craft sweep walks the repository; it is not an
 * in-flight diff, so there is no set of files the caller already has open. By
 * `resolveFloor`'s rule an absent touched set degrades every sub-floor item to
 * `'file'`, so Goal 3's `'act'` resolution is STRUCTURALLY UNREACHABLE at this
 * seam — reachable only at the review seam, which has the diff. Recording that
 * is better than letting a goal read as met everywhere, and
 * `clumpable.test.ts` asserts it so it cannot drift to `'act'` silently the day
 * someone threads a plausible-looking file list through here.
 *
 * `projectRoot` is REQUIRED, not optional with a defaulted fallback. Every one
 * of the eleven families' call sites already has the root in scope, and a
 * required parameter makes an omission a compile error — the alternative, a
 * default of `process.cwd()`, would let a forgotten call site keep publishing
 * machine-local clump ids while every test stayed green. Pass `''` only when
 * the findings genuinely carry project-relative paths already.
 */
export function clumpCraftFindings(
  findings: readonly CraftClumpableFinding[],
  projectRoot: string,
  policy?: Partial<ClumpPolicy>
): ClumpResult {
  return formClumps(toClumpableItems(findings, projectRoot), {
    ...craftClumpPolicy(projectRoot),
    ...policy,
  });
}

/**
 * The `clumping` block of the project's `harness.config.json`, read from
 * EXACTLY `<projectRoot>/harness.config.json`.
 *
 * Not `findConfigFile`'s walk toward the filesystem root, and the difference
 * is load-bearing rather than stylistic. `projectRoot` here is already the
 * project — every family computes it as `sanitizePath(input.path)` — so a walk
 * could only ever find a DIFFERENT project's config above this one and tune
 * this run by it. It would also make these tests machine-dependent: a fixture
 * root under `/var/folders/...` would pick up whatever config happens to sit
 * above the temp directory on the running machine.
 *
 * Every failure mode resolves to `undefined` — no file, unreadable file,
 * invalid JSON, malformed block — so a craft run never fails because of a
 * tuning field, which is success criterion 13 at this seam.
 *
 * THREE of those four are REPORTED on stderr rather than swallowed. This
 * comment used to say the cli loader reports a malformed config "on its own
 * paths"; that was false twice over — the loader returns an `Err` and prints
 * nothing, and this seam, reached through the craft MCP tools, never invokes it
 * at all. The one silent case is an ABSENT file, which is not a degrade.
 *
 * Validation goes through core's `clumpingFromConfig` rather than a second
 * local `safeParse`, so this seam and the review seam cannot drift apart.
 */
export function craftClumpingConfig(projectRoot: string): ClumpingConfig | undefined {
  if (projectRoot === '') return undefined;
  const file = path.join(projectRoot, 'harness.config.json');
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (error) {
    // ENOENT is the ordinary "no config here" case and says nothing. Anything
    // else — a directory at that path, a permission denial — is a config the
    // adopter wrote and this run could not read, which is a degrade.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      reportIgnoredClumpingBlock([`${file} could not be read — ${(error as Error).message}`]);
    }
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    reportIgnoredClumpingBlock([`${file} is not valid JSON — ${(error as Error).message}`]);
    return undefined;
  }
  return clumpingFromConfig(parsed);
}

/** The craft seam's policy. No seam baseline — craft runs on the primitive's defaults. */
function craftClumpPolicy(projectRoot: string): Partial<ClumpPolicy> {
  return resolveSeamClumpPolicy(craftClumpingConfig(projectRoot), 'craft');
}
