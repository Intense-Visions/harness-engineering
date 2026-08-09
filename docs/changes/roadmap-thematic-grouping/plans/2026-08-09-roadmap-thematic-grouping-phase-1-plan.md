# Plan: Roadmap thematic grouping — Phase 1 (model + parser + serializer + tests)

**Date:** 2026-08-09 | **Spec:** `docs/changes/roadmap-thematic-grouping/proposal.md` | **Tasks:** 12 | **Time:** ~42 min | **Integration Tier:** medium

## Goal

An author can mark an `### Group: <name>` H3 inside a milestone; the roadmap parses successfully with that section captured verbatim on `milestone.groups`, the serializer re-emits it, and strict roadmaps parse to a byte-identical object shape.

## Scope guard

This plan implements the spec's "Implementation order — Phase 1" as written. It does **not** revisit D1–D4. Every task below traces to one of the spec's 6 steps and 6 success criteria. Non-goals stay non-goals: no nested-feature syntax, no sharded-mode grouping, no content inference, no change to `milestone.features`, `parseFeatureBlock`, or `validateStatus`.

## Observable Truths (Acceptance Criteria)

Written in EARS form; the trailing tag is the spec success criterion each satisfies.

1. **When** `parseRoadmap` encounters an H3 whose heading text begins with `Group: `, the system shall record `{ name, body }` on that milestone's `groups` array and shall not emit a `RoadmapFeature` for it. _(crit. 1)_
2. **While** a group body contains free-form markdown (inline `Status:` prose, unmodeled `- **Key:**` bullets, blockquotes, cross-repo links), the system shall capture it verbatim (trimmed of surrounding blank lines) and shall not feature-validate it. _(crit. 1, D3)_
3. The system shall parse `VALID_ROADMAP_MD` to exactly `VALID_ROADMAP`, and each parsed milestone of a group-free roadmap shall have own-keys exactly `['name', 'isBacklog', 'features']`. _(crit. 2, D4)_
4. **If** a **feature** H3 (no `Group: ` prefix) has a missing or invalid `Status`, **then** the system shall return the same `Err` message as today: `Feature "<name>" has invalid status: "(missing)". Valid statuses: …`. _(crit. 3, crit. 6)_
5. **When** `serializeRoadmap` emits a milestone carrying `groups`, the system shall emit each group after that milestone's features as a blank line, `### Group: <name>`, a blank line, then the verbatim body. _(crit. 4, D2)_
6. `parseRoadmap → serializeRoadmap → parseRoadmap` of a grouped roadmap shall yield a deep-equal object, and for the sanctioned layout (groups after features) shall also yield byte-identical markdown. _(crit. 4)_
7. **While** a roadmap carries groups, `checkRoadmapHealth` shall produce exactly the findings it produces for the same roadmap with its groups removed (groups are invisible to roadmapHealth). _(crit. 5)_
8. **If** a monolith write path or a monolith→shard migration would drop a group, **then** the system shall fail loudly rather than silently discard it (documented and locked by characterization tests). _(D2, non-goal "no sharded grouping")_
9. `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap` shall pass with the new group suites green and every pre-existing roadmap test unchanged.
10. `pnpm generate-docs --check`, `pnpm generate:plugin:check`, `pnpm generate:barrels:check`, `pnpm format:check` shall all exit 0; `harness check-deps` and `harness check-perf --structural` shall exit 0; `.harness/arch/baselines.json` shall be unchanged; `harness validate` shall show no new findings versus the recorded pre-change baseline.

## NFR Targets

None elicited. This is a pure in-memory parser/serializer change with no I/O, no untrusted-input surface beyond markdown the parser already reads, and no load dimension. Existing machinery stands unchanged and is asserted in the gauntlet: `harness check-perf --structural` (complexity/coupling budgets — `parseFeatures` gains one branch) and `harness check-security` at its configured floor via `harness validate`. No `category: nfr` tasks are emitted.

## Uncertainties

- **[ASSUMPTION]** Group bodies never contain a column-0 `### ` line. The parser splits milestone bodies on `^### `, so a nested H3 inside a group body would split the group. The sanctioned layout documented in Task 8 says to use `#### ` or deeper inside a group body. If an adopter needs column-0 H3s inside a group, Task 2's design needs revision (out of scope here).
- **[ASSUMPTION]** Vitest's `toEqual` ignoring `undefined`-valued keys is not sufficient for D4, so Task 3 asserts own-keys explicitly. (`assertRegeneratedRoundTrip` uses `node:util.isDeepStrictEqual`, which is **not** `undefined`-tolerant — this is why D4's "add the key only when non-empty" is load-bearing, not cosmetic.)
- **[DEFERRABLE → CHECKPOINT]** The spec is silent on two existing write-path guards that grouped monoliths will trip. Both fail loudly (D2 is satisfied — nothing is silently dropped), but the failure messages do not mention groups:
  - `findUnpreservedLines` (`packages/core/src/roadmap/preservation.ts`) does not model group-body lines, so `MonolithStore.write` refuses any whole-file rewrite of a grouped monolith with the "cannot preserve" error.
  - `harness roadmap shard` calls `assertSemanticRoundTrip`, whose `isDeepStrictEqual` comparison will now differ (original has `groups`, shard-assembled does not), so sharding a grouped monolith aborts to protect the file.
    Task 6 locks both behaviors with characterization tests and raises a `[checkpoint:decision]` for whether to accept them as shipped semantics or open a follow-up.
- **[RESOLVED at execution time]** This uncertainty originally read: `packages/*/dist` are **symlinks into the root checkout** which two other sessions are using, so `turbo run build` would rewrite their artifacts and success criterion 5's **CLI-level** verification "cannot run locally" and must defer to PR CI. **Both halves are false as executed.** The `dist` symlinks were replaced with **real local directories** before execution began, so the worktree-clobbering hazard was gone; the Task 11 `[checkpoint:decision]` was answered "run the full build", `turbo run build` completed locally (13/13 tasks), and criterion 5 was verified **end-to-end locally through the built binary** — not deferred to CI. Task 7's `checkRoadmapHealth` unit-level check stands as the narrower complement, not as a substitute.

## Recorded pre-change baseline (measured in this worktree, 2026-08-09)

Used by Task 12 as the comparison point. `harness validate` **already fails on this branch before any change** — the gauntlet asserts "no new findings", not "exit 0".

| Command                                                                                                               | Pre-change result                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `harness validate`                                                                                                    | exit 1 — `Validation failed (390 issues)`; 75 `docs/roadmap.md` findings (1 stale-aggregate + 74 roadmapHealth advisories) |
| `harness check-deps`                                                                                                  | exit 0 — `Analyzed 2310 module(s) across 9 layer(s)`                                                                       |
| `harness check-perf --structural`                                                                                     | exit 1 — `Validation failed (974 issues)` (all pre-existing; see note below)                                               |
| `git diff --exit-code .harness/arch/baselines.json`                                                                   | exit 0 (clean)                                                                                                             |
| `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/parse.test.ts tests/roadmap/serialize.test.ts` | 2 files, 16 tests passed                                                                                                   |

> **Correction (measured during execution).** The `check-perf --structural` row originally
> read "exit 0 (warnings only)". That was wrong: the command already exits 1 with **974**
> pre-existing structural issues (e.g. `packages/orchestrator/src/orchestrator.ts` at 5195
> lines). Re-measured before and after this change with the same freshly built binary:
> **974 → 975**. The single new finding is
> `packages/core/src/roadmap/parse.ts — File has 305 lines (threshold: 300)`, i.e. the file
> crossed the 300-line file-length advisory. **Accepted, not refactored:** it is not part of
> `harness validate`'s gate (validate output is byte-identical to baseline), and it is the
> same finding class as 974 pre-existing instances, including `health.ts` (317 lines) and
> `preservation.ts` in this very directory. So the `check-perf` gate for this change is
> "exactly one new advisory, accepted", not "exit 0".

## File Map

```
MODIFY packages/types/src/roadmap.ts                        (add RoadmapGroup, optional groups)
MODIFY packages/types/src/index.ts                          (barrel export + header comment)
MODIFY packages/core/src/roadmap/parse.ts                   (GROUP_PREFIX branch, parseFeatures return shape)
MODIFY packages/core/src/roadmap/serialize.ts               (re-emit groups)
MODIFY packages/core/tests/roadmap/fixtures.ts              (GROUPED_ROADMAP_MD + GROUPED_ROADMAP)
CREATE packages/core/tests/roadmap/parse-groups.test.ts
CREATE packages/core/tests/roadmap/serialize-groups.test.ts
CREATE packages/core/tests/roadmap/groups-write-paths.test.ts
MODIFY packages/core/tests/roadmap/health.test.ts           (append one describe block)
MODIFY docs/guides/roadmap-sharding.md                      (new section (g))
CREATE .changeset/roadmap-narrative-group-sections.md
```

No new source files, so no barrel regeneration is expected — Task 10 asserts that with `generate:barrels:check`.

> **Correction (measured during execution).** This map originally also listed
> `MODIFY docs/reference/source-map.md (regenerated — indexes the 3 new test files)`. That
> was wrong and the file was correctly **not** modified: `source-map.md` is a curated
> sample, not an exhaustive test index, so the three new test files produce no delta and
> `pnpm generate-docs --check` exits 0 without regeneration. Task 10 therefore produced no
> generated-docs commit.

## Skeleton

1. Model — types + barrel export (~1 task, ~3 min)
2. Parser — group branch, fixture, positive + negative + shape tests (~2 tasks, ~9 min)
3. Serializer — emit groups, round-trip (~2 tasks, ~8 min)
4. Write-path + health characterization (~2 tasks, ~7 min)
5. Docs + changeset (~2 tasks, ~7 min)
6. Gauntlet — generated artifacts, build, validate vs baseline (~3 tasks, ~8 min)

**Estimated total:** 12 tasks, ~42 minutes. _Skeleton approval is folded into the single plan sign-off gate at the end of this document (autopilot `APPROVE_PLAN`)._

---

## Tasks

### Task 1: Add `RoadmapGroup` type and optional `RoadmapMilestone.groups`

**Depends on:** none | **Files:** `packages/types/src/roadmap.ts`, `packages/types/src/index.ts` | **Owns:** `packages/types/src/**`
**Skills:** `ts-utility-types` (reference)

> Type-declaration-only task: there is no runtime behavior to test, and `packages/types/tsconfig.json` has `include: ["src/**/*"]` so a test-file type assertion would not be typechecked. The TDD red signal for this change lives in Task 2, whose parse test cannot compile until `RoadmapGroup` exists. Verification here is `typecheck` on both packages.

1. In `packages/types/src/roadmap.ts`, insert immediately **above** `export interface RoadmapMilestone`:

   ```ts
   /**
    * A thematic grouping / narrative section in a milestone. Authored as an
    * `### Group: <name>` H3. Its body is free-form markdown captured verbatim and
    * NOT parsed as roadmap features.
    */
   export interface RoadmapGroup {
     /** Group/theme name (heading text after the "Group: " prefix). */
     name: string;
     /** Verbatim markdown body of the section (trimmed of surrounding blank lines). */
     body: string;
   }
   ```

2. In the same file, add the optional field to `RoadmapMilestone` after `features`:

   ```ts
     /** Features in this milestone, in document order */
     features: RoadmapFeature[];
     /** Narrative grouping sections, in document order. Present only when non-empty. */
     groups?: RoadmapGroup[];
   ```

3. In `packages/types/src/index.ts`, add `RoadmapGroup` to the `// --- Roadmap ---` export block, after `RoadmapMilestone`:

   ```ts
   export type {
     FeatureStatus,
     Priority,
     RoadmapFeature,
     RoadmapMilestone,
     RoadmapGroup,
     AssignmentRecord,
     RoadmapFrontmatter,
     Roadmap,
   } from './roadmap';
   ```

4. In the same file's header doc comment, update the roadmap line to:

   ```
    *   roadmap.ts   — FeatureStatus, RoadmapFeature, RoadmapMilestone, RoadmapGroup, Roadmap
   ```

5. Run: `pnpm --filter @harness-engineering/types typecheck`
6. Run: `pnpm --filter @harness-engineering/core typecheck` (proves every existing `RoadmapMilestone` constructor — assembler, promote, monolith-store — still type-checks with the optional field)
7. Commit: `feat(types): add RoadmapGroup and optional milestone groups`

---

### Task 2: Teach the parser the `### Group:` marker (TDD)

**Depends on:** Task 1 | **Files:** `packages/core/tests/roadmap/fixtures.ts`, `packages/core/tests/roadmap/parse-groups.test.ts`, `packages/core/src/roadmap/parse.ts` | **Owns:** `packages/core/src/roadmap/parse.ts`
**Skills:** `ts-type-guards` (reference), `ts-error-handling-types` (reference)

1. Append the grouped fixture to `packages/core/tests/roadmap/fixtures.ts` (bottom of file). The layout is the sanctioned one — groups **after** strict features, plus an all-narrative Backlog — so it byte-round-trips in Task 5. `owner/other-repo#7` is a fictional placeholder in test-only code:

   ```ts
   /**
    * Roadmap markdown with narrative `### Group:` sections: one after a milestone's
    * strict features, and one in an all-narrative Backlog. Bodies deliberately carry
    * free-form content the feature parser would reject (inline `Status:` prose, an
    * unmodeled bullet, a blockquote, a cross-repo link) to prove group bodies are
    * captured verbatim and never feature-validated.
    */
   export const GROUPED_ROADMAP_MD = `---
   project: grouped-project
   version: 1
   last_synced: 2026-05-01T10:00:00Z
   last_manual_edit: 2026-05-01T09:00:00Z
   ---
   
   # Roadmap
   
   ## Delivery Arc
   
   ### Ship the parser
   
   - **Status:** in-progress
   - **Spec:** —
   - **Summary:** Teach the parser the group marker
   - **Blockers:** —
   - **Plan:** —
   
   ### Group: Narrative arc
   
   - Status: shipped in spirit, not in bytes.
   - Tracks the cross-repo thread at owner/other-repo#7.
   - **Note:** no Status bullet is required in a group body.
   
   > A blockquote inside a group body is captured verbatim.
   
   ## Backlog
   
   ### Group: Someday themes
   
   - Grouping is narrative; shards stay strict.
   `;

   export const GROUPED_ROADMAP: Roadmap = {
     frontmatter: {
       project: 'grouped-project',
       version: 1,
       lastSynced: '2026-05-01T10:00:00Z',
       lastManualEdit: '2026-05-01T09:00:00Z',
     },
     milestones: [
       {
         name: 'Delivery Arc',
         isBacklog: false,
         features: [
           {
             name: 'Ship the parser',
             status: 'in-progress',
             spec: null,
             plans: [],
             blockedBy: [],
             summary: 'Teach the parser the group marker',
             assignee: null,
             priority: null,
             externalId: null,
             updatedAt: null,
           },
         ],
         groups: [
           {
             name: 'Narrative arc',
             body: [
               '- Status: shipped in spirit, not in bytes.',
               '- Tracks the cross-repo thread at owner/other-repo#7.',
               '- **Note:** no Status bullet is required in a group body.',
               '',
               '> A blockquote inside a group body is captured verbatim.',
             ].join('\n'),
           },
         ],
       },
       {
         name: 'Backlog',
         isBacklog: true,
         features: [],
         groups: [{ name: 'Someday themes', body: '- Grouping is narrative; shards stay strict.' }],
       },
     ],
     assignmentHistory: [],
   };
   ```

   > The template literal must start at column 0 (the surrounding indentation shown above is markdown only). Keep the `—` escapes — the file uses them for every em dash.

2. Create `packages/core/tests/roadmap/parse-groups.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { parseRoadmap } from '../../src/roadmap/parse';
   import { GROUPED_ROADMAP_MD, GROUPED_ROADMAP } from './fixtures';

   describe('parseRoadmap() — `### Group:` narrative sections', () => {
     it('parses a grouped roadmap to the expected object', () => {
       const result = parseRoadmap(GROUPED_ROADMAP_MD);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value).toEqual(GROUPED_ROADMAP);
     });

     it('captures the group name without the marker prefix', () => {
       const result = parseRoadmap(GROUPED_ROADMAP_MD);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.milestones[0]?.groups?.map((g) => g.name)).toEqual(['Narrative arc']);
     });

     it('emits no feature for a group section', () => {
       const result = parseRoadmap(GROUPED_ROADMAP_MD);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.milestones[0]?.features.map((f) => f.name)).toEqual(['Ship the parser']);
       expect(result.value.milestones[1]?.features).toEqual([]);
     });

     it('captures the group body verbatim, trimmed of surrounding blank lines', () => {
       const result = parseRoadmap(GROUPED_ROADMAP_MD);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const body = result.value.milestones[0]?.groups?.[0]?.body ?? '';
       expect(body.startsWith('- Status: shipped in spirit')).toBe(true);
       expect(body.endsWith('captured verbatim.')).toBe(true);
       expect(body).toContain('> A blockquote inside a group body is captured verbatim.');
     });

     it('supports an all-narrative milestone with no features', () => {
       const result = parseRoadmap(GROUPED_ROADMAP_MD);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const backlog = result.value.milestones[1];
       expect(backlog?.isBacklog).toBe(true);
       expect(backlog?.groups).toEqual([
         { name: 'Someday themes', body: '- Grouping is narrative; shards stay strict.' },
       ]);
     });
   });
   ```

3. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/parse-groups.test.ts` — **observe failure** (the group H3 is parsed as a feature and errors with `Feature "Group: Narrative arc" has invalid status: "(missing)"`).
4. In `packages/core/src/roadmap/parse.ts`, add `RoadmapGroup` to the type import list from `@harness-engineering/types` (after `RoadmapFeature`).
5. In the same file, add the marker constant next to `EM_DASH`:

   ```ts
   /** Heading-text prefix that marks an H3 as a narrative group rather than a feature. */
   const GROUP_PREFIX = 'Group: ';
   ```

6. Replace the body of `parseFeatures` so it returns both collections (the H3 collection loop above is unchanged):

   ```ts
   /** The two kinds of H3 section a milestone body can hold. */
   interface MilestoneSections {
     features: RoadmapFeature[];
     groups: RoadmapGroup[];
   }

   function parseFeatures(sectionBody: string): Result<MilestoneSections> {
     const features: RoadmapFeature[] = [];
     const groups: RoadmapGroup[] = [];
     // Split on H3 headings — accept both "### Feature: X" and "### X"
     const h3Pattern = /^### (?:Feature: )?(.+)$/gm;
     const h3Matches: Array<{ name: string; startIndex: number; fullMatch: string }> = [];
     let match: RegExpExecArray | null;
     while ((match = h3Pattern.exec(sectionBody)) !== null) {
       h3Matches.push({ name: match[1]!, startIndex: match.index, fullMatch: match[0] });
     }

     for (let i = 0; i < h3Matches.length; i++) {
       const h3 = h3Matches[i]!;
       const nextStart =
         i + 1 < h3Matches.length ? h3Matches[i + 1]!.startIndex : sectionBody.length;
       const featureBody = sectionBody.slice(h3.startIndex + h3.fullMatch.length, nextStart);

       // Explicit `### Group: <name>` marker: capture the section verbatim and skip
       // feature validation entirely. The marker is authoritative — a plain `### X`
       // with no Status still errors below (no silent inference).
       if (h3.name.startsWith(GROUP_PREFIX)) {
         groups.push({ name: h3.name.slice(GROUP_PREFIX.length), body: featureBody.trim() });
         continue;
       }

       const featureResult = parseFeatureBlock(h3.name, featureBody);
       if (!featureResult.ok) return featureResult;
       features.push(featureResult.value);
     }

     return Ok({ features, groups });
   }
   ```

7. In `parseMilestones`, replace the `parseFeatures` call and the `milestones.push({...})` block with:

   ```ts
   const sectionsResult = parseFeatures(sectionBody);
   if (!sectionsResult.ok) return sectionsResult;
   const { features, groups } = sectionsResult.value;

   // `groups` is attached ONLY when non-empty, so a strict roadmap's milestones
   // keep their exact prior own-key shape (name, isBacklog, features). The
   // shard round-trip guard compares with isDeepStrictEqual, which is not
   // undefined-tolerant, so this gating is load-bearing.
   const milestone: RoadmapMilestone = { name: milestoneName, isBacklog, features };
   if (groups.length > 0) milestone.groups = groups;
   milestones.push(milestone);
   ```

8. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/parse-groups.test.ts` — **observe pass**.
9. Run the pre-existing parse suites: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/parse.test.ts tests/roadmap/parse-extended.test.ts tests/roadmap/parse-block.test.ts` — all green, unchanged.
10. Commit: `feat(roadmap): parse explicit "### Group:" narrative sections`

---

### Task 3: Lock the explicit-marker and byte-identical-shape contracts

**Depends on:** Task 2 | **Files:** `packages/core/tests/roadmap/parse-groups.test.ts`
**Skills:** `ts-testing-types` (reference)

No source change — these tests characterize D1, D3, D4 and success criteria 2, 3, 6. Append to `parse-groups.test.ts`:

```ts
describe('parseRoadmap() — the marker is explicit (no inference)', () => {
  const MD = (section: string) => `---
project: p
version: 1
last_synced: 2026-05-01T10:00:00Z
last_manual_edit: 2026-05-01T09:00:00Z
---

# Roadmap

## M1

${section}
`;

  it('still errors on a plain H3 with no status (crit. 6)', () => {
    const result = parseRoadmap(MD('### Mystery section\n\n- some prose, no status bullet\n'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain(
      'Feature "Mystery section" has invalid status: "(missing)"'
    );
  });

  it('still errors on a feature H3 with an invalid status (crit. 3)', () => {
    const result = parseRoadmap(MD('### Bad Status\n\n- **Status:** cancelled\n'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Feature "Bad Status" has invalid status: "cancelled"');
  });

  it('does not feature-validate a group body that looks like a feature (D3)', () => {
    const result = parseRoadmap(MD('### Group: Looks like a feature\n\n- **Status:** cancelled\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.milestones[0]?.features).toEqual([]);
    expect(result.value.milestones[0]?.groups?.[0]?.body).toBe('- **Status:** cancelled');
  });

  it('does not treat a lowercase or unspaced marker as a group', () => {
    expect(parseRoadmap(MD('### group: not the marker\n\n- prose\n')).ok).toBe(false);
    expect(parseRoadmap(MD('### Group:no-space\n\n- prose\n')).ok).toBe(false);
  });
});

describe('parseRoadmap() — strict roadmaps keep their exact object shape (D4)', () => {
  it('adds no `groups` key to milestones of a group-free roadmap', () => {
    const result = parseRoadmap(VALID_ROADMAP_MD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const milestone of result.value.milestones) {
      expect(Object.keys(milestone)).toEqual(['name', 'isBacklog', 'features']);
      expect('groups' in milestone).toBe(false);
    }
    expect(result.value).toEqual(VALID_ROADMAP);
  });
});
```

1. Extend the file's fixture import to `import { GROUPED_ROADMAP_MD, GROUPED_ROADMAP, VALID_ROADMAP_MD, VALID_ROADMAP } from './fixtures';`
2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/parse-groups.test.ts` — all pass.
3. Commit: `test(roadmap): lock explicit group marker and strict milestone shape`

---

### Task 4: Re-emit groups from `serializeRoadmap` (TDD)

**Depends on:** Task 2 | **Files:** `packages/core/tests/roadmap/serialize-groups.test.ts`, `packages/core/src/roadmap/serialize.ts` | **Owns:** `packages/core/src/roadmap/serialize.ts`

1. Create `packages/core/tests/roadmap/serialize-groups.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { serializeRoadmap } from '../../src/roadmap/serialize';
   import {
     GROUPED_ROADMAP,
     GROUPED_ROADMAP_MD,
     VALID_ROADMAP,
     VALID_ROADMAP_MD,
   } from './fixtures';

   describe('serializeRoadmap() — `### Group:` narrative sections', () => {
     it('emits a grouped roadmap byte-identically to its fixture', () => {
       expect(serializeRoadmap(GROUPED_ROADMAP)).toBe(GROUPED_ROADMAP_MD);
     });

     it('emits the marker heading and the verbatim body', () => {
       const out = serializeRoadmap(GROUPED_ROADMAP);
       expect(out).toContain('### Group: Narrative arc');
       expect(out).toContain('> A blockquote inside a group body is captured verbatim.');
     });

     it('emits groups after the milestone features', () => {
       const out = serializeRoadmap(GROUPED_ROADMAP);
       expect(out.indexOf('### Ship the parser')).toBeLessThan(
         out.indexOf('### Group: Narrative arc')
       );
     });

     it('leaves a group-free roadmap byte-identical', () => {
       expect(serializeRoadmap(VALID_ROADMAP)).toBe(VALID_ROADMAP_MD);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/serialize-groups.test.ts` — **observe failure** (groups are dropped).
3. In `packages/core/src/roadmap/serialize.ts`, inside `serializeRoadmap`'s milestone loop, append the group loop directly after the feature loop:

   ```ts
   for (const milestone of roadmap.milestones) {
     lines.push('');
     lines.push(serializeMilestoneHeading(milestone));
     for (const feature of milestone.features) {
       lines.push('');
       lines.push(...serializeFeature(feature));
     }
     // Narrative `### Group:` sections are re-emitted verbatim AFTER the strict
     // features so a parse → mutate → serialize cycle never silently drops them.
     for (const group of milestone.groups ?? []) {
       lines.push('');
       lines.push(`### Group: ${group.name}`);
       lines.push('');
       lines.push(group.body);
     }
   }
   ```

4. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/serialize-groups.test.ts` — **observe pass**.
5. Run the pre-existing serialize suites: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/serialize.test.ts tests/roadmap/serialize-extended.test.ts` — green, unchanged.
6. Commit: `feat(roadmap): re-emit narrative group sections on serialize`

---

### Task 5: Prove the round-trip preserves groups (crit. 4)

**Depends on:** Task 4 | **Files:** `packages/core/tests/roadmap/serialize-groups.test.ts`

1. Append to `serialize-groups.test.ts` (extend the imports with `import { parseRoadmap } from '../../src/roadmap/parse';`):

   ```ts
   describe('round-trip with narrative groups (crit. 4)', () => {
     it('parse → serialize reproduces the source bytes', () => {
       const parsed = parseRoadmap(GROUPED_ROADMAP_MD);
       expect(parsed.ok).toBe(true);
       if (!parsed.ok) return;
       expect(serializeRoadmap(parsed.value)).toBe(GROUPED_ROADMAP_MD);
     });

     it('parse → serialize → parse yields an equal object (groups not dropped)', () => {
       const first = parseRoadmap(GROUPED_ROADMAP_MD);
       expect(first.ok).toBe(true);
       if (!first.ok) return;
       const second = parseRoadmap(serializeRoadmap(first.value));
       expect(second.ok).toBe(true);
       if (!second.ok) return;
       expect(second.value).toEqual(first.value);
       expect(second.value.milestones[0]?.groups).toEqual(first.value.milestones[0]?.groups);
     });

     it('survives a mutate-in-the-middle write cycle', () => {
       const parsed = parseRoadmap(GROUPED_ROADMAP_MD);
       expect(parsed.ok).toBe(true);
       if (!parsed.ok) return;
       parsed.value.milestones[0]!.features[0]!.status = 'done';
       const reparsed = parseRoadmap(serializeRoadmap(parsed.value));
       expect(reparsed.ok).toBe(true);
       if (!reparsed.ok) return;
       expect(reparsed.value.milestones[0]?.features[0]?.status).toBe('done');
       expect(reparsed.value.milestones[0]?.groups).toEqual(GROUPED_ROADMAP.milestones[0]?.groups);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/serialize-groups.test.ts` — all pass.
3. Commit: `test(roadmap): assert group round-trip survives a mutate-and-write cycle`

---

### Task 6: Characterize the two existing write-path guards `[checkpoint:decision]`

**Depends on:** Task 4 | **Files:** `packages/core/tests/roadmap/groups-write-paths.test.ts`

**[checkpoint:decision]** Present to the human before committing:

> Grouped monoliths trip two pre-existing guards. Both fail **loudly** (D2 holds — no silent drop), but neither message mentions groups:
>
> |            | A) Accept loud-failure semantics, document them (recommended)                   | B) Make `findUnpreservedLines` group-aware in this phase                     | C) Open a follow-up for group-aware write paths |
> | ---------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
> | **Pros**   | Zero behavior change; the guards keep protecting the file; spec scope respected | Grouped monoliths become editable via `manage_roadmap`                       | Ships Phase 1 unchanged; the gap is tracked     |
> | **Cons**   | Grouped monoliths are read-mostly (edit by hand or shard)                       | Weakens the data-loss guard; needs group-body line ranges; out of spec scope | Requires a follow-up intake                     |
> | **Risk**   | Low                                                                             | High                                                                         | Low                                             |
> | **Effort** | Low                                                                             | High                                                                         | Low                                             |
>
> **Recommendation:** A, plus C if the human wants the gap tracked. Either way this task's tests are identical — they only lock current behavior.

1. Create `packages/core/tests/roadmap/groups-write-paths.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { serializeRoadmap } from '../../src/roadmap/serialize';
   import { findUnpreservedLines } from '../../src/roadmap/preservation';
   import { roadmapToShards, assertSemanticRoundTrip } from '../../src/roadmap/store/migration';
   import { GROUPED_ROADMAP } from './fixtures';

   describe('narrative groups vs the monolith write-preservation guard', () => {
     it('reports group-body lines, so a whole-file rewrite is refused rather than destructive', () => {
       const lost = findUnpreservedLines(serializeRoadmap(GROUPED_ROADMAP));
       expect(lost.length).toBeGreaterThan(0);
       expect(lost.map((l) => l.text)).toContain('- Status: shipped in spirit, not in bytes.');
     });

     it('does not report the group marker heading itself', () => {
       const lost = findUnpreservedLines(serializeRoadmap(GROUPED_ROADMAP));
       expect(lost.map((l) => l.text)).not.toContain('### Group: Narrative arc');
     });
   });

   describe('narrative groups vs monolith → shard migration (sharded mode stays strict)', () => {
     it('aborts the shard round-trip instead of silently dropping groups', () => {
       const { shards, meta } = roadmapToShards(GROUPED_ROADMAP);
       const result = assertSemanticRoundTrip(GROUPED_ROADMAP, shards, meta);
       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error.message).toContain('round-trip');
     });

     it('emits no shard for a group section', () => {
       const { shards } = roadmapToShards(GROUPED_ROADMAP);
       expect(shards.map((s) => s.feature.name)).toEqual(['Ship the parser']);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/groups-write-paths.test.ts` — all pass (characterization, no source change).
3. Run the pre-existing guard suites to prove no regression: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/preservation.test.ts tests/roadmap/store` — green.
4. Commit: `test(roadmap): characterize group behavior on monolith write and shard paths`

---

### Task 7: Prove `roadmapHealth` is blind to groups (crit. 5)

**Depends on:** Task 2 | **Files:** `packages/core/tests/roadmap/health.test.ts`

1. Append to `packages/core/tests/roadmap/health.test.ts` (reuse the file's existing `feature`/roadmap helpers; add `GROUPED_ROADMAP` to imports from `./fixtures` if the file does not already import it):

   ```ts
   describe('checkRoadmapHealth() — narrative groups are invisible', () => {
     it('produces identical findings with and without groups', () => {
       const withGroups = GROUPED_ROADMAP;
       const withoutGroups = {
         ...withGroups,
         milestones: withGroups.milestones.map(({ name, isBacklog, features }) => ({
           name,
           isBacklog,
           features,
         })),
       };
       expect(checkRoadmapHealth(withGroups)).toEqual(checkRoadmapHealth(withoutGroups));
     });

     it('emits no finding whose feature name is a group name', () => {
       const findings = checkRoadmapHealth(GROUPED_ROADMAP);
       for (const finding of findings) {
         expect(JSON.stringify(finding)).not.toContain('Narrative arc');
         expect(JSON.stringify(finding)).not.toContain('Someday themes');
       }
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/health.test.ts` — all pass, including every pre-existing roadmapHealth test.
3. Commit: `test(roadmap): assert roadmapHealth ignores narrative group sections`

---

### Task 8: Document the `### Group:` authoring convention

**Depends on:** Task 4 | **Files:** `docs/guides/roadmap-sharding.md`

Shipped doc — **no issue or PR numbers**. Keep angle brackets inside backticks (the VitePress build gate rejects bare ones) and keep inline code on a single line.

1. Insert a new section into `docs/guides/roadmap-sharding.md` immediately **before** `## See also`. The inner fenced example is part of the doc text:

   ````markdown
   ## (g) Narrative grouping sections — `### Group: <name>`

   Every `### H3` inside a milestone is parsed as a strict feature row and must carry a
   valid `- **Status:** <status>` bullet. To author a **thematic grouping / narrative**
   section instead — a hand-written arc with free-form bullets and prose — prefix the
   heading text with the literal marker `Group: `:

   ```markdown
   ## Delivery Arc

   ### Ship the parser

   - **Status:** in-progress
   - **Spec:** —
   - **Summary:** A strict feature row, validated as usual
   - **Blockers:** —
   - **Plan:** —

   ### Group: Why this arc matters

   - Free-form bullets. No `Status:` bullet is required or parsed here.
   - Prose, blockquotes, and links are captured verbatim.
   ```

   Rules:

   - **The marker is explicit and case-sensitive.** Only `### Group: ` opts a section out
     of feature validation. A plain `### <name>` with no status bullet still fails to
     parse — group-ness is never inferred from content, so real work is never silently
     skipped.
   - **Group bodies are never validated.** Text that merely looks like a field (for
     example `Status: shipped` written as prose) is recorded as-is.
   - **Groups are preserved, not dropped.** The serializer re-emits every group, so a
     parse → edit → write cycle keeps the narrative intact.
   - **Layout.** Groups are emitted after a milestone's strict features. Author them that
     way — after the features, or in a dedicated all-narrative milestone — and the file
     round-trips byte-for-byte. Use `#### ` or deeper for sub-headings inside a group
     body; a column-0 `### ` starts a new section.
   - **Groups are a monolith concept.** Shards are one strict row per file by
     construction, so `harness roadmap shard` refuses to shard a roadmap that carries
     groups rather than flatten them away. For the same reason the single-file writer
     refuses whole-file rewrites of a grouped roadmap (the same data-loss guard that
     protects any hand-authored prose) — a grouped monolith is edited by hand.
   - **Grouping is invisible to tooling.** Pilot scoring, `manage_roadmap` reads, and the
     `roadmapHealth` check in `harness validate` all read `milestone.features` only.
   ````

2. Run: `pnpm format:check` (or `pnpm prettier --write docs/guides/roadmap-sharding.md` then re-check).
3. Commit: `docs(roadmap): document the "### Group:" narrative section convention`

---

### Task 9: Add the changeset

**Depends on:** Task 1 | **Files:** `.changeset/roadmap-narrative-group-sections.md`

Both `packages/types/src/` and `packages/core/src/` change, so `scripts/check-changesets.mjs` requires both packages in the frontmatter. **No issue or PR numbers.**

1. Create `.changeset/roadmap-narrative-group-sections.md`:

   ```markdown
   ---
   '@harness-engineering/types': minor
   '@harness-engineering/core': minor
   ---

   Support thematic grouping / narrative sections in a roadmap milestone.

   An `### H3` whose heading text begins with the literal marker `Group: ` is now parsed as a narrative grouping section rather than a strict feature row: its body is captured verbatim on the new optional `RoadmapMilestone.groups` field (`RoadmapGroup`) and is never feature-validated, so free-form bullets, prose, blockquotes, and links no longer make the whole roadmap fail to parse. `serializeRoadmap` re-emits every group after its milestone's features, so a parse → edit → write cycle preserves the narrative instead of flattening it.

   The marker is explicit: a plain `### <name>` with no `- **Status:**` bullet still fails to parse, so real work is never silently skipped. Strict roadmaps are unaffected — `groups` is attached only when a milestone actually has one, so their parsed shape is byte-identical to before, and feature validation, `milestone.features`, and sharded mode are unchanged.
   ```

2. Run: `BASE_REF=origin/main node scripts/check-changesets.mjs` (informational — it diffs against `origin/main`).
3. Commit: `chore(changeset): roadmap narrative group sections`

---

### Task 10: Regenerate and verify generated artifacts

**Depends on:** Task 3, Task 5, Task 6, Task 7, Task 8, Task 9 | **Files:** `docs/reference/source-map.md`

`docs/reference/source-map.md` indexes test files, so the three new test files make `generate-docs --check` fail until it is regenerated.

1. Run: `pnpm generate-docs`
2. Run: `git diff --stat docs/` — expect only `docs/reference/source-map.md` (three added test-file entries).
3. Run: `pnpm generate-docs --check` — exit 0.
4. Run: `pnpm generate:plugin:check` — exit 0 (no skill/command surface changed; plugin count unchanged).
5. Run: `pnpm generate:barrels:check` — exit 0 (no new source files).
6. Run: `pnpm format:check` — exit 0.
7. Commit: `docs(reference): regenerate source map for roadmap group test suites`

---

### Task 11: Build + full-suite gauntlet `[checkpoint:decision]`

**Depends on:** Task 10 | **Files:** none (verification only)

**[checkpoint:decision]** Ask before running any build:

> In this worktree `packages/*/dist` are **symlinks into the root checkout**, which two other sessions are actively using. `turbo run build` would rewrite their built artifacts (including the `harness` binary they run).
>
> |            | A) Defer the full build to PR CI; verify locally with typecheck + lint + vitest (recommended) | B) Run `turbo run build` through the symlinks now | C) Replace the dist symlinks with real directories, then build |
> | ---------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
> | **Pros**   | Zero impact on the other sessions; tests run from `src` so they need no dist                  | Full local build signal, including dts emit       | Full local build signal, isolated                              |
> | **Cons**   | No local dts/bundle signal; CLI-level check of criterion 5 waits for CI                       | Overwrites artifacts two live sessions depend on  | Explicitly forbidden by this worktree's setup constraints      |
> | **Risk**   | Low                                                                                           | High                                              | High                                                           |
> | **Effort** | Low                                                                                           | Medium                                            | Medium                                                         |
>
> **Recommendation:** A (confidence: high). Note that `tsc --noEmit` may still touch `packages/*/dist/.tsbuildinfo` through the symlink — gitignored build metadata only, not shipped output.

1. Run: `pnpm --filter @harness-engineering/types typecheck && pnpm --filter @harness-engineering/core typecheck`
2. Run: `pnpm --filter @harness-engineering/core lint`
3. Run the whole roadmap suite: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap` — every pre-existing test green, all new suites green.
4. Run the full core package suite: `pnpm --filter @harness-engineering/core test`
5. Run the downstream consumers that read the milestone shape: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/roadmap` and `pnpm --filter @harness-engineering/dashboard exec vitest run tests/server/gather/roadmap.test.ts`
6. If (and only if) the human chose option B: `pnpm turbo run build`.
7. No commit (verification only). Record the outcome in the session handoff.

---

### Task 12: Final gauntlet against the recorded baseline `[checkpoint:human-verify]`

**Depends on:** Task 11 | **Files:** none (verification only)

1. Run: `node packages/cli/dist/bin/harness.js validate 2>&1 | tail -3` — compare the issue count to the recorded baseline (**390 issues, exit 1, 75 `docs/roadmap.md` findings**). The gate is **no new findings**, not exit 0. Note that this binary is the root checkout's prebuilt CLI unless option B was taken in Task 11, so it exercises the pre-change parser — it proves this change introduced no regression in the repo's own strict roadmap, and the grouped-roadmap CLI path is verified by PR CI.
2. Run: `node packages/cli/dist/bin/harness.js check-deps` — exit 0, `Analyzed 2310 module(s) across 9 layer(s)`.
3. Run: `node packages/cli/dist/bin/harness.js check-perf --structural` — exit 0, no new error-severity finding naming `packages/core/src/roadmap/parse.ts` (the file gained one branch).
4. Run: `git diff --exit-code .harness/arch/baselines.json` — exit 0 (baselines unchanged).
5. Run: `git status --porcelain` — no unintended files; nothing outside this worktree touched.
6. Run: `git log --oneline origin/main..HEAD` — confirm the commit series matches Tasks 1-10.
7. **[checkpoint:human-verify]** Present: the diff stat, the test counts (new suites plus the unchanged pre-existing roadmap suites), the validate/check-deps/check-perf/baseline results against the recorded baseline table, and the outcome of the Task 6 and Task 11 decisions. Wait for confirmation before the plan is considered complete.

---

## Traceability

| Spec success criterion                  | Tasks        |
| --------------------------------------- | ------------ |
| 1. Grouped roadmap parses               | 1, 2         |
| 2. Strict roadmap validates unchanged   | 3, 4, 11, 12 |
| 3. Malformed input still errors cleanly | 3            |
| 4. Round-trip preserves groups          | 4, 5         |
| 5. Read-only tooling stops failing      | 7, 12        |
| 6. Marker is explicit                   | 3            |
| Spec step 5 (docs, changeset)           | 8, 9         |
| Spec step 6 (gauntlet)                  | 10, 11, 12   |
| D2 "never dropped on any write path"    | 4, 5, 6      |
| D4 "byte-identical strict object shape" | 1, 2, 3      |

## Parallelization notes

- Task 3 and Task 7 are independent of each other once Task 2 lands (different files).
- Task 8 (docs) and Task 9 (changeset) touch no code and can run alongside Tasks 5-7.
- Tasks 10-12 are strictly serial and must run last.
