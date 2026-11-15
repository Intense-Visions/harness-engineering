# Plan: Code-review host wiring (Phase 4)

**Date:** 2026-11-13 | **Spec:** `docs/changes/auto-wire-craft-at-review/proposal.md` (Phase 4)
**Branch:** `feat/auto-wire-craft-at-review` @ `cdb12047b` | **Tasks:** 8 | **Time:** ~55 min
**Integration Tier:** medium | **Rigor:** standard | **Checkpoints:** 1

> Phase 3 wired `harness-autopilot` at `after:REVIEW` / `after:FINAL_REVIEW`. Phase 4 wires the
> SECOND host, `harness-code-review`, at its own declared `after:mechanical`, and adds the
> "invoked as a review hook" forwarding sections to the craft SKILL.md files.
>
> **Out of scope** (named so nothing is silently absorbed): Phase 5 (ADRs, `docs/reference`,
> `AGENTS.md`), Phases 2b/2c, and DP-3 Option B (deriving `OUTLINE_LANGUAGES` from
> `ALL_SOURCE_LANGUAGES`).

---

## Goal

`harness-code-review` resolves craft's advisory domains at `after:mechanical` — with the timing
asymmetry, the hard-halt exception and the exclusion-set rule stated at the call site — and every
auto-wired craft skill documents the `files` + `promptBudget` forwarding contract it is invoked
under, each claim pinned by a law that has been shown to redden.

---

## This phase is smaller than it looks, and here is the measurement that says so

**Phase 4 ships no production code.** `packages/core/src/hooks/craft-review-hooks.ts` already
declares `'harness-code-review': ['after:mechanical']` (`:141-144`), and Phase 1 already tests the
code-review host end to end:

| Existing coverage                                       | Location                                           |
| ------------------------------------------------------- | -------------------------------------------------- |
| `resolveReviewHooksWithCraft` at `after:mechanical`     | `core/tests/hooks/craft-review-hooks.test.ts:1183` |
| Both hosts × all events, denominator pinned before loop | `…:285-306` (`asserted === 3`)                     |
| Crossed host/event yields a FULLY empty plan            | `…:308-325`                                        |
| The pre/post-review asymmetry note                      | `craft-review-hooks.ts:133-140`                    |

So Phase 4 is **documentation plus the laws that make the documentation falsifiable**. Eight tasks,
not twenty. Every task below either writes prose the hosts act on, or writes the law that reddens
when that prose is wrong.

---

## What measurement changed about the brief

Seven facts measured against this tree (`cdb12047b`, clean) during planning. **Three contradict the
brief**, and one of them changes the file map by a factor of four.

| #   | Fact                                                                                                   | Status                        | Encoded as       |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------- | ---------------- |
| 1   | The code-review doc-contract tests are **blind to craft in both directions** — measured, not assumed   | **BRIEF ITEM 3 CONFIRMED**    | Task 1 (DP-1)    |
| 2   | Craft SKILL.md mirrors are **real copies, not symlinks** — 4 copies per skill, 40 files, nothing syncs | **BRIEF ENV NOTE REFUTED**    | Tasks 3-5 (DP-2) |
| 3   | `design_craft` declares **no `promptBudget`** — the uniform "files + promptBudget" contract is false   | **NEW — spec claim is false** | Tasks 3-5 (DP-3) |
| 4   | `design_craft` **does** handle absolute `files` correctly (`critique.ts:158` `path.isAbsolute` branch) | **NEW**                       | Task 4 template  |
| 5   | Nothing in the repo enforces mirror parity; all 10 craft skills are in parity **today** (`distinct=1`) | **NEW**                       | Task 3 law 3     |
| 6   | `harness validate` baseline holds on this tree: 29642 lines, md5 `4c0e…3753`, exit 1                   | confirms brief                | Task 8           |
| 7   | `harness check-deps` passes (2707 modules, 10 layers)                                                  | confirms brief                | Task 8           |

### Fact 1 — the code-review doc law cannot fail for craft, and this was MEASURED, not inherited

The brief warned me not to repeat Phase 3's mistake of _asserting_ that an existing doc-contract
test would redden. So I measured it first, with the mutation diff printed in the same command as
the test result. The probe inserted a craft call site wired at a **bogus** event and a
**contradictory** hard-halt sentence into `harness-code-review/SKILL.md`:

```
=== MUTATION DIFF ===
+**PROBE PARAGRAPH (measurement only).** Resolve `resolveReviewHooksWithCraft(config,
+"harness-code-review", "after:WRONG_EVENT", { changedFiles, availableSkills })`. A not-installed
+craft domain is SKIPPED, never a hard halt.
=== TEST RESULT ===
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

Baseline (no craft anywhere): **19/19 green**. With craft wired at a nonsense event and a
self-contradicting halt claim: **19/19 green**. Both directions invisible, for two mechanical
reasons:

- `declares the after:mechanical hookable event…` matches
  `/resolveSkillHooks\(config, "harness-code-review", "after:mechanical"\)/`. The string
  `resolveReviewHooksWithCraft(` does not contain `resolveSkillHooks(`, so craft never enters that
  set, present or absent.
- `honors the framework hard-halt protection` matches `/hard halt/i` **anywhere in the file**. It is
  already satisfied by the user-declared-hook paragraph at `:204`, so a craft paragraph claiming the
  exact opposite still passes.

The file was restored (`git checkout --`), the tree verified clean, and the suite re-run at 19/19.

**DP-1: craft gets its own denominator in the code-review describe block**, exactly as Phase 3 did
with `CRAFT_WIRED` — and the comment above the new laws records this measurement so no future reader
takes the two pre-existing `it`s as evidence that craft is wired here. Their green is **not
evidence**; the plan says so at the site.

### Fact 2 — the craft SKILL.md files are NOT symlink-mirrored

The brief's environment note ("A SKILL.md edit is symlink-mirrored to cursor/codex/gemini-cli") is
true for `harness-autopilot` and `harness-code-review`, and **false for every craft skill**:

```
harness-code-review      cursor=symlink
harness-autopilot        cursor=symlink
code-craft               cursor=copy       (drwxr-xr-x, real directory)
…all 10 craft domains    cursor=copy, codex=copy, gemini-cli=copy
```

`scripts/lib/plugin-config.mjs:38-40` even asserts in a comment that "the per-platform dirs are
symlink mirrors into claude-code" — which is how this was missed. All 40 files are byte-identical
today (`md5 | sort -u | wc -l` = 1 for each of the 10 skills), so nothing has drifted yet; there is
simply nothing that would notice if it did.

**DP-2: edit all four copies, and add a mirror-parity law.** Editing only `claude-code/` would leave
30 stale copies and ship the forwarding contract to Claude users only, while the cursor/codex/gemini
plugin artifacts are generated from the stale copies. Converting the 30 craft mirror directories to
symlinks is the _real_ fix, but it is a structural change to 30 directories with no bearing on
whether craft is wired at review — it is recorded in `concerns` as a follow-up, not smuggled in here.
`[checkpoint:decision]` at Task 4 surfaces this once before 40 files are written.

### Fact 3 — "files plus a promptBudget" is false for the priority-1 domain

The spec says the craft host sections "mandate forwarding them as `files` plus a `promptBudget`",
and `harness-autopilot/SKILL.md:117-118` (Phase 3) says the same. Measured against the tool schemas:

| Tool                                           | `files` | `promptBudget` |
| ---------------------------------------------- | ------- | -------------- |
| `design_craft`                                 | yes     | **NO**         |
| the other 9 (`code_`, `test_`, `security_`, …) | yes     | yes            |

`design_craft` has no `promptBudget` and no `_finalize` twin — it is not a two-step prompt-collector
at all. Its cost is bounded by `phases` / `mode`.

**DP-3: the promptBudget line is DERIVED FROM THE TOOL SCHEMA, never from a hand-written table.**
The law reads `getToolDefinitions()` and requires the doc to carry
``**`promptBudget`** — accepted`` or ``**`promptBudget`** — not accepted`` according to what the
schema actually declares. Adding `promptBudget` to `design_craft` therefore reddens design-craft's
doc — which is mutant **M-CRAFT-SCHEMA**, and is what proves the derivation is real.

> Also measured, because the template depends on it: `design_craft` **does** handle absolute paths —
> `design-craft/phases/critique.ts:158` takes the `path.isAbsolute(target.file)` branch before
> `readFileSync`. So "forward ABSOLUTE paths" is uniformly correct across all ten domains, even
> though `design_craft`'s own schema description says "relative to project root" (stale; recorded in
> `concerns`, not fixed here).

---

## Observable Truths (EARS acceptance criteria)

1. **When** `harness-code-review` reaches `after:mechanical` with a changed-file set, **the system
   shall** resolve craft's advisory domains via
   `resolveReviewHooksWithCraft(config, "harness-code-review", "after:mechanical", …)`, and the
   SKILL.md shall name that call site at exactly the one event
   `CRAFT_REVIEW_EVENTS_BY_HOST['harness-code-review']` declares. _(Task 1; law: craft's own
   denominator, mutants M-CR-EVENT / M-CR-EVENT-DROP.)_
2. **The system shall** state at the code-review call site that `after:mechanical` fires BEFORE the
   AI fan-out while autopilot's events fire AFTER its reviewer, so craft runs pre-review under one
   host and post-review under the other. _(Task 1; mutant M-CR-ASYM.)_
3. **If** a craft domain is a forward-wired harness default that is not installed, **then** the
   system shall NOT hard-halt the review — it shall skip and record it in the denominator — while a
   user-declared unresolvable hook still hard-halts. _(Task 1; mutant M-CR-HALT.)_
4. **If** craft produces a finding at `file:line`, **then** the system shall not enter it into the
   Phase 2 mechanical exclusion set and shall not count it toward the `error`/`warn` severity
   counts. _(Task 1; mutant M-CR-EXCLUDE.)_
5. **The system shall** forward `plan.files[skill]` resolved to ABSOLUTE paths, report
   `no-diff-context` when the diff is unknown, and report the `craft domains: N/M activated`
   denominator. _(Task 1; mutant M-CR-FORWARD.)_
6. **The system shall** document, in every craft skill that `CRAFT_REVIEW_DOMAINS` lists, the
   review-hook forwarding contract naming its own MCP tool, the ABSOLUTE-path `files` requirement,
   and whether its tool accepts `promptBudget`. _(Tasks 3-5; mutants M-CRAFT-SECTION,
   M-CRAFT-SCHEMA.)_
7. **While** a craft skill ships to four platform trees, **the system shall** keep all four
   `SKILL.md` copies byte-identical. _(Task 3 law 3; mutant M-CRAFT-MIRROR.)_
8. **The system shall** leave `harness validate` byte-identical to the pre-phase baseline — 29642
   lines, md5 `4c0efe7709e813065698502570193753`, exit 1. _(Task 8.)_

### NFR elicitation (Phase 1.6)

All four dimensions **skipped**, deliberately and on the record: Phase 4 adds no runtime code path,
no new input surface, no load-bearing component and no new failure mode — it edits markdown and adds
doc-contract tests. Existing `check-perf` / `check-security` floors stand unchanged. **No NFR tasks
are emitted.** Manufacturing a benchmark for a markdown edit would be a fixture that reads as
coverage, which this phase's discipline forbids.

---

## File Map

Complete. Nothing below is created or modified outside this list.

```
MODIFY agents/skills/claude-code/harness-code-review/SKILL.md      (symlink-mirrored ×3)
MODIFY packages/cli/tests/integration/autopilot-skill-hooks.test.ts
CREATE packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts
MODIFY agents/skills/{claude-code,codex,cursor,gemini-cli}/harness-design-craft/SKILL.md
MODIFY agents/skills/{claude-code,codex,cursor,gemini-cli}/code-craft/SKILL.md
MODIFY agents/skills/{claude-code,codex,cursor,gemini-cli}/test-craft/SKILL.md
MODIFY agents/skills/{claude-code,codex,cursor,gemini-cli}/security-craft/SKILL.md
MODIFY agents/skills/{claude-code,codex,cursor,gemini-cli}/naming-craft/SKILL.md
MODIFY agents/skills/{claude-code,codex,cursor,gemini-cli}/cli-ergonomics-craft/SKILL.md
MODIFY agents/skills/{claude-code,codex,cursor,gemini-cli}/api-craft/SKILL.md
MODIFY agents/skills/{claude-code,codex,cursor,gemini-cli}/spec-craft/SKILL.md
MODIFY agents/skills/{claude-code,codex,cursor,gemini-cli}/docs-craft/SKILL.md
MODIFY agents/skills/{claude-code,codex,cursor,gemini-cli}/knowledge-craft/SKILL.md
REGEN  .claude-plugin/ .cursor-plugin/ .gemini-extension/ .codex-plugin/ … (pre-commit / Task 7)
```

Craft SKILL.md count: 10 skills × 4 copies = **40 files**, applied from ONE template by a scripted
loop (Tasks 4-5). The unit of work is "apply the template", not "hand-edit 40 files" — which is why
the >3-files-per-task rule is satisfied in substance.

---

## Skeleton (standard rigor, 8 tasks)

1. Code-review host wiring: craft laws + SKILL.md craft block (~2 tasks, ~14 min)
2. Craft SKILL.md forwarding sections: law, then 10 skills in two batches (~3 tasks, ~18 min)
3. Mutation verification of the craft-section laws (~1 task, ~8 min)
4. Artifact regeneration + close-out with the `harness validate` md5 proof (~2 tasks, ~15 min)

**Estimated total:** 8 tasks, ~55 minutes. _Skeleton approval: requested in the planning handback._

---

## Mutation register

Every behavioural law in this phase has a named mutant. Each mutant deletes or inverts the WHOLE
anchor its `it` depends on — never half of it (the Phase 3 M-DOC-CRAFT lesson: a mutant that
defeats only half a denominator proves only half).

| Mutant          | Mutation                                                                 | Must redden                                      | Must stay green (positive control)                        |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------- |
| M-CR-EVENT      | `"after:mechanical"` → `"after:WRONG"` in the craft call site            | craft-event law                                  | the 2 pre-existing code-review `it`s (blindness proof)    |
| M-CR-EVENT-DROP | delete the craft call-site line entirely                                 | craft-event law (empty ≠ `['after:mechanical']`) | the 2 pre-existing code-review `it`s                      |
| M-CR-ASYM       | delete the whole TIMING ASYMMETRY bullet                                 | asymmetry law                                    | the other 3 craft laws                                    |
| M-CR-HALT       | delete the whole hard-halt-exception bullet                              | hard-halt-exception law                          | `honors the framework hard-halt protection` (still green) |
| M-CR-EXCLUDE    | delete the whole exclusion-set bullet                                    | exclusion-set law                                | the other 3 craft laws                                    |
| M-CR-FORWARD    | delete the whole DIFF-SCOPED bullet                                      | forwarding law                                   | the other 3 craft laws                                    |
| M-CRAFT-SECTION | delete `## Invoked as a review hook` from ONE claude-code craft SKILL.md | that skill's 1 case; the other 9 stay green      | the 9 other skills' cases                                 |
| M-CRAFT-MIRROR  | append one character to ONE cursor craft SKILL.md copy                   | that skill's mirror-parity case                  | that skill's other 2 cases; all 9 other skills            |
| M-CRAFT-SCHEMA  | add `promptBudget` to `design_craft`'s `inputSchema.properties`          | `harness-design-craft`'s promptBudget case       | the other 9 promptBudget cases                            |

**Mutation protocol, non-negotiable** (carried from Phases 1-3):

- Print `git diff` for the mutated file and the test result **in the same command**. An empty diff
  means the mutant is INAPPLICABLE — report and replace it, do not score it.
- Before mutating, verify the anchor matched **exactly once** (`grep -c`), so a mutant cannot
  silently no-op or hit two sites.
- Restore with `git checkout -- <file>` and re-run to a clean green before the next mutant.
- No core/cli **source** is mutated except M-CRAFT-SCHEMA (`packages/cli/src/mcp/tools/design-craft.ts`),
  which cli tests import from **src**, not `dist` — so no rebuild is needed. Nothing in this phase
  mutates `packages/core/src`, so the Phase 3 stale-dist trap does not arise. If that ever changes,
  rebuild core after restoring.

---

## Tasks

### Task 1: Craft's own denominator for the code-review host, then the SKILL.md craft block

**Depends on:** none | **Files:** `packages/cli/tests/integration/autopilot-skill-hooks.test.ts`,
`agents/skills/claude-code/harness-code-review/SKILL.md` | **Owns:** `agents/skills/*/harness-code-review/**`

TDD: the laws go first and must be observed RED before the prose exists.

1. In `packages/cli/tests/integration/autopilot-skill-hooks.test.ts`, add the core import at the top
   of the import block (the file is fs-only today; this is deliberate — the event list must be
   DERIVED from the vocabulary, not retyped):

   ```ts
   import { CRAFT_REVIEW_EVENTS_BY_HOST } from '@harness-engineering/core';
   ```

2. Inside the existing `describe('harness-code-review is a second skillHooks consumer (not autopilot-locked)', …)`
   block, after the two existing `it`s, append:

   ```ts
   // MEASURED ON THIS TREE (cdb12047b) BEFORE THESE LAWS EXISTED, with the
   // mutation diff printed in the same command as the test result: inserting
   // a craft call site wired at a BOGUS event (`after:WRONG_EVENT`) plus a
   // sentence contradicting the hard-halt rule left this file 19/19 GREEN,
   // and so did removing craft entirely. The two `it`s above cannot fail for
   // craft in EITHER direction: `resolveSkillHooks\(config, "harness-code-review"`
   // does not match `resolveReviewHooksWithCraft(`, and `/hard halt/i` is
   // already satisfied by the user-declared-hook paragraph at :204. THEIR
   // GREEN IS NOT EVIDENCE THAT CRAFT IS WIRED HERE. The five laws below are
   // craft's own denominator for this host — the Phase 3 CRAFT_WIRED pattern.
   const PHASE2 = (): string => extractSection(md, 'Phase 2: MECHANICAL');

   it('documents the craft resolver at exactly the event this host wires', () => {
     // DERIVED from the per-host vocabulary, never retyped: changing
     // CRAFT_REVIEW_EVENTS_BY_HOST without updating the prose reddens here.
     const expected = [...CRAFT_REVIEW_EVENTS_BY_HOST['harness-code-review']];
     expect(expected).toEqual(['after:mechanical']); // denominator pinned before use
     const craftSites = new Set(
       [
         ...md.matchAll(
           /resolveReviewHooksWithCraft\(config,\s*"harness-code-review",\s*"([^"]+)"[,)]/g
         ),
       ]
         .map((m) => m[1])
         // Same placeholder filter the autopilot laws use: a documented FORM
         // like "<after:X|after:Y>" is not a call site.
         .filter((e) => /^(before|after|on):[A-Za-z0-9_-]+$/.test(e))
     );
     expect([...craftSites].sort()).toEqual([...expected].sort());
   });

   it('records the timing asymmetry at the call site (pre-review here, post-review under autopilot)', () => {
     const s = PHASE2();
     expect(s).toMatch(/TIMING ASYMMETRY/);
     expect(s).toMatch(/before\*{0,2}\s+the\s+(?:Phase 4\s+)?AI fan-out/i);
     expect(s).toMatch(/after:REVIEW/);
     expect(s).toMatch(/CRAFT_REVIEW_EVENTS_BY_HOST/);
   });

   it('exempts forward-wired craft defaults from this skill’s hard-halt rule', () => {
     const s = PHASE2();
     expect(s).toMatch(/SKIPPED, never a hard halt/i);
     expect(s).toMatch(/EXCEPTION/);
     expect(s).toMatch(/forward-wired|harness-OPTIMISTIC/i);
     expect(s).toMatch(/user-declared-but-unresolvable\s*=\s*hard\s+halt/i);
   });

   it('keeps craft findings out of the mechanical exclusion set and the severity counts', () => {
     const s = PHASE2();
     expect(s).toMatch(/MUST NOT enter the mechanical exclusion set/i);
     expect(s).toMatch(/severity counts/i);
   });

   it('states the diff-scoped forwarding contract and the denominator', () => {
     const s = PHASE2();
     expect(s).toMatch(/plan\.files\[skill\]/);
     expect(s).toMatch(/ABSOLUTE/);
     expect(s).toMatch(/promptBudget/);
     expect(s).toMatch(/no-diff-context/);
     expect(s).toMatch(/craft domains: \d+\/\d+ activated/);
   });
   ```

   > Every asserted multi-word phrase either fits on one source line of the SKILL.md or is written
   > with `\s+` between words. `prettier` runs with `proseWrap: "preserve"` (verified: no
   > `proseWrap` key in `.prettierrc`), so it will not rewrap prose — but the craft block below is
   > hand-wrapped at 100 columns to match the autopilot block, and a hard-wrapped phrase is exactly
   > the Phase 3 `USER-declared … HARD-HALTS` trap.

3. Run and **observe RED** (5 failing, 19 passing):

   ```
   npx vitest run --root packages/cli tests/integration/autopilot-skill-hooks.test.ts
   ```

4. Verify the insertion anchor is unique, then insert the craft block into
   `agents/skills/claude-code/harness-code-review/SKILL.md`:

   ```
   grep -c 'follow the same grammar when this skill opts in at those points.' \
     agents/skills/claude-code/harness-code-review/SKILL.md     # must print 1
   ```

   Insert immediately AFTER that paragraph (line 204) and BEFORE the `---` that closes Phase 2 —
   inside `### Phase 2: MECHANICAL`, which is the section `extractSection` scopes the laws to:

   ```md
   **Craft domains auto-wire at `after:mechanical` (default, zero-config, forward-wired, ADVISORY).**
   Alongside the project's configured hooks, resolve craft's advisory domains:
   `resolveReviewHooksWithCraft(config, "harness-code-review", "after:mechanical", { changedFiles, availableSkills })`
   (from `@harness-engineering/core`), with
   `planCraftReviewDomains("harness-code-review", "after:mechanical", changedFiles, availableSkills)`
   for the `{ wired, skipped, expected, files }` split. The full contract lives in harness-autopilot's
   "Craft domains auto-wire" subsection; what is specific to THIS host is below.

   - **TIMING ASYMMETRY — craft runs PRE-review here and POST-review under autopilot.**
     `after:mechanical` fires once the mechanical exclusion boundary is set and **before** the
     Phase 4 AI fan-out, whereas autopilot's `after:REVIEW` / `after:FINAL_REVIEW` fire **after**
     its reviewer has run. The two hosts are therefore NOT interchangeable. It is deliberate — the
     reviewers of Phase 4 can see craft's findings, which is an improvement — and it is recorded
     once more at `CRAFT_REVIEW_EVENTS_BY_HOST`
     (`packages/core/src/hooks/craft-review-hooks.ts`), so prose and vocabulary cannot drift apart
     unnoticed.
   - **A not-installed craft domain is SKIPPED, never a hard halt — an EXCEPTION to the paragraph
     above.** That paragraph's "An unresolvable hooked skill is a hard halt" governs USER-DECLARED
     `skillHooks` entries. Craft domains arrive as harness-OPTIMISTIC forward-wired defaults, so
     `resolveReviewHooksWithCraft` filters an uninstalled domain out and it is recorded in the
     denominator. Do NOT halt the review because a craft skill nobody asked for is absent. The
     distinction is intent, exactly as for the canary detectors:
     harness-optimistically-defaulted-but-not-installed = skip;
     user-declared-but-unresolvable = hard halt.
   - **Craft findings are ADVISORY and MUST NOT enter the mechanical exclusion set.** Report them in
     their own section. They must never be merged into the Phase 2 exclusion list that Phase 5
     (VALIDATE) subtracts from the AI findings — a craft taste judgment at `file:line` discarding a
     reviewer's real finding at the same `file:line` is a false green manufactured by this very
     wiring. They also do not contribute to the `error`/`warn` severity counts and never change the
     Assessment.
   - **DIFF-SCOPED — forward `plan.files[skill]` as the craft skill's `files`, resolved to ABSOLUTE
     paths**, together with a `promptBudget` where that domain's MCP tool accepts one (see each craft
     skill's "Invoked as a review hook" section; `mcp__harness__design_craft` does not).
     `plan.files` holds repo-relative POSIX paths and the collectors `readFileSync` them against the
     process CWD, so forwarding them unresolved yields `status: "collected"` with zero prompts: a
     clean report from a run that read nothing. Never call `rule.owns()` yourself. When the
     changed-file set is unknown, nothing activates and every domain is reported `no-diff-context`;
     do not fall back to a repository walk.
   - **One event, so no `alreadyRanFor`.** This host resolves craft once per run; the
     once-per-phase-per-diff de-duplication exists for autopilot's TWO review moments and has no
     counterpart here.
   - **Report the denominator, including skips** — "craft domains: 2/3 activated, 1 skipped:
     unsupported-language" — in the same report as the hook denominator. A surprising `0/M` renders
     as `0/M`, never as silence.
   ```

5. Run and **observe GREEN** (24/24):

   ```
   npx vitest run --root packages/cli tests/integration/autopilot-skill-hooks.test.ts
   ```

6. `npx prettier --write agents/skills/claude-code/harness-code-review/SKILL.md packages/cli/tests/integration/autopilot-skill-hooks.test.ts`
   then re-run step 5 (prettier must not break a wrapped assertion).
7. Run: `harness validate` is NOT run per-task in this phase (6 minutes each; proven once at Task 8).
   Instead run the cheap gate: `npx vitest run --root packages/core tests/hooks`.
8. Commit: `feat(code-review): wire craft's advisory domains at after:mechanical`
9. Verify with `git show --stat HEAD`: exactly the 2 edited files plus whatever plugin artifacts
   pre-commit regenerated — and nothing else.

---

### Task 2: Mutate all six code-review laws, and record the blindness as not-evidence

**Depends on:** Task 1 | **Files:** `packages/cli/tests/integration/autopilot-skill-hooks.test.ts`
| **Category:** verification

For each of M-CR-EVENT, M-CR-EVENT-DROP, M-CR-ASYM, M-CR-HALT, M-CR-EXCLUDE, M-CR-FORWARD, run the
mutation and its test in ONE command so the diff and the result cannot be reported separately:

```
# anchor uniqueness FIRST
grep -c 'resolveReviewHooksWithCraft(config, "harness-code-review", "after:mechanical"' \
  agents/skills/claude-code/harness-code-review/SKILL.md     # must print 1

# M-CR-EVENT
perl -pi -e 's/"harness-code-review", "after:mechanical"/"harness-code-review", "after:WRONG"/' \
  agents/skills/claude-code/harness-code-review/SKILL.md
echo "=== MUTATION DIFF (must be non-empty) ===" && \
  git diff --stat -- agents/skills/claude-code/harness-code-review/SKILL.md && \
  echo "=== TEST RESULT ===" && \
  npx vitest run --root packages/cli tests/integration/autopilot-skill-hooks.test.ts
git checkout -- agents/skills/claude-code/harness-code-review/SKILL.md
```

Required results:

- **M-CR-EVENT / M-CR-EVENT-DROP** → the craft-event law RED; the **two pre-existing code-review
  `it`s stay GREEN**. That green is the positive control for the blindness claim: record the exact
  pass/fail split in the comment (step below).
- **M-CR-ASYM / M-CR-HALT / M-CR-EXCLUDE / M-CR-FORWARD** → delete the whole corresponding bullet
  (`perl -0pi -e 's/- \*\*TIMING ASYMMETRY.*?\n(?=- \*\*)//s'` and analogues; verify the diff shows
  the entire bullet removed, not one line of it). Each must redden exactly its own `it` and leave
  the other craft laws green.
- **M-CR-HALT additionally must leave `honors the framework hard-halt protection` GREEN** — the
  sharpest demonstration that the pre-existing law could never have caught this.

After all six, restore, confirm `git status --short` is empty, re-run to 24/24, then append the
measured results to the comment block written in Task 1:

```ts
// MUTATION RESULTS (<date>, this tree): M-CR-EVENT and M-CR-EVENT-DROP each
// reddened the craft-event law while the two `it`s above stayed GREEN;
// M-CR-ASYM / M-CR-HALT / M-CR-EXCLUDE / M-CR-FORWARD each reddened exactly
// their own law. Under M-CR-HALT, `honors the framework hard-halt
// protection` remained GREEN — the pre-existing law cannot see this claim.
```

Commit: `test(code-review): record the mutation results for craft's doc-contract laws`

---

### Task 3: The craft SKILL.md forwarding law, derived from the domain table and the tool schemas

**Depends on:** Task 1 | **Files:** `packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts`
| **Owns:** `packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts`

TDD: this law is written and observed RED before a single craft SKILL.md is touched.

1. Create `packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts`:

   ```ts
   // packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts
   //
   // Phase 4. Every craft domain the resolver can auto-wire must document the
   // contract it is invoked under. Three things make this law able to fail,
   // rather than a fixture that reads as coverage:
   //
   //  (a) The denominator is CRAFT_REVIEW_DOMAINS, read from the PUBLISHED
   //      surface — not a hand list that silently stops covering a domain.
   //  (b) The `promptBudget` expectation is derived from the MCP tool's own
   //      inputSchema. `design_craft` declares NO `promptBudget` (measured),
   //      so the uniform "files + promptBudget" contract is false and the doc
   //      must say so; adding `promptBudget` to that schema reddens this file.
   //  (c) The craft platform mirrors are REAL COPIES, not symlinks (measured:
   //      `agents/skills/cursor/code-craft` is a directory, while
   //      `agents/skills/cursor/harness-code-review` is a symlink). Nothing
   //      else in this repository notices when the four copies drift.
   import { describe, it, expect } from 'vitest';
   import * as path from 'path';
   import * as fs from 'fs';
   import { CRAFT_REVIEW_DOMAINS } from '@harness-engineering/core';
   import { getToolDefinitions } from '../../src/mcp/server';

   const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
   const SKILLS_ROOT = path.join(REPO_ROOT, 'agents', 'skills');
   /** The four platform trees that ship a skill. A fifth would redden below. */
   const PLATFORMS = ['claude-code', 'codex', 'cursor', 'gemini-cli'] as const;
   const HEADING = '## Invoked as a review hook';

   /** `harness-design-craft` -> `design_craft`; `cli-ergonomics-craft` -> `cli_ergonomics_craft`. */
   function toolNameFor(skill: string): string {
     return skill.replace(/^harness-/, '').replace(/-/g, '_');
   }

   function skillMd(platform: string, skill: string): string {
     return fs.readFileSync(path.join(SKILLS_ROOT, platform, skill, 'SKILL.md'), 'utf-8');
   }

   /** The section body, or a loud throw — never '' (which would fail silently-ish). */
   function section(md: string, skill: string): string {
     const lines = md.split('\n');
     const start = lines.findIndex((l) => l.trim() === HEADING);
     if (start === -1) throw new Error(`${skill}: "${HEADING}" section is missing`);
     let end = lines.length;
     for (let i = start + 1; i < lines.length; i++) {
       if (lines[i].startsWith('## ')) {
         end = i;
         break;
       }
     }
     return lines.slice(start, end).join('\n');
   }

   const DOMAINS = CRAFT_REVIEW_DOMAINS.map((d) => d.skill);
   const TOOLS = new Map(getToolDefinitions().map((t) => [t.name, t]));

   describe('every auto-wired craft skill documents its review-hook forwarding contract', () => {
     it('[denominator] the table comes from CRAFT_REVIEW_DOMAINS and is non-empty', () => {
       // Without this, a table that resolved to [] would make every loop below
       // vacuously true and the file would report a clean 1 passed.
       expect(DOMAINS.length).toBeGreaterThan(0);
       expect(DOMAINS).toContain('harness-design-craft');
       expect(DOMAINS).not.toContain('copy-craft'); // not activated in v1
     });

     for (const skill of DOMAINS) {
       const toolName = toolNameFor(skill);

       it(`${skill}: declares the section, the ABSOLUTE files contract and its own MCP tool`, () => {
         expect(TOOLS.get(toolName), `MCP tool ${toolName} must exist`).toBeDefined();
         const s = section(skillMd('claude-code', skill), skill);
         expect(s).toMatch(/\*\*`files`\*\*/);
         expect(s).toMatch(/ABSOLUTE/);
         expect(s).toContain(`mcp__harness__${toolName}`);
         expect(s).toMatch(/advisory/i);
         expect(s).toContain('after:mechanical');
         expect(s).toContain('after:REVIEW');
       });

       it(`${skill}: its promptBudget line matches what its MCP tool actually accepts`, () => {
         const schema = TOOLS.get(toolName)!.inputSchema as {
           properties?: Record<string, unknown>;
         };
         const accepts = Object.prototype.hasOwnProperty.call(
           schema.properties ?? {},
           'promptBudget'
         );
         const s = section(skillMd('claude-code', skill), skill);
         // DERIVED, never a hand table: flipping the schema flips the required line.
         expect(s).toMatch(
           accepts
             ? /\*\*`promptBudget`\*\* — accepted\b/
             : /\*\*`promptBudget`\*\* — not accepted\b/
         );
       });

       it(`${skill}: all four platform mirrors carry the identical SKILL.md`, () => {
         const files = PLATFORMS.map((p) => path.join(SKILLS_ROOT, p, skill, 'SKILL.md'));
         // Positive control: the four copies EXIST. Without it, "every copy
         // present agrees" is satisfied by a one-element set after a mirror
         // is lost — an absence passing as agreement.
         expect(files.filter((f) => fs.existsSync(f))).toHaveLength(PLATFORMS.length);
         expect(PLATFORMS.length).toBe(4);
         const bodies = new Set(files.map((f) => fs.readFileSync(f, 'utf-8')));
         expect(bodies.size, `${skill}: platform mirrors have drifted`).toBe(1);
       });
     }
   });
   ```

2. Run and **observe RED**: 20 of 31 cases fail (the 10 section cases and 10 promptBudget cases;
   the 10 mirror cases and the denominator pass today, which is itself the Fact-5 measurement):

   ```
   npx vitest run --root packages/cli tests/integration/craft-skill-review-hook-sections.test.ts
   ```

   Record the exact split. If the mirror cases are NOT green at this point, the mirrors had already
   drifted before this phase — stop and report rather than absorbing a pre-existing drift fix.

3. If importing `../../src/mcp/server` proves too slow or has an unexpected side effect, do NOT fall
   back to a hand-written tool table — that discards DP-3. Report and stop.
4. Commit: `test(craft): add the review-hook forwarding law for every auto-wired craft domain`
   (committed RED is acceptable here only if Task 4 lands in the same session; otherwise fold this
   commit into Task 4. Default: fold — do not leave a red law on the branch.)

---

### Task 4: `[checkpoint:decision]` then apply the forwarding section to the first five domains

**Depends on:** Task 3 | **Files:** `agents/skills/{claude-code,codex,cursor,gemini-cli}/{harness-design-craft,code-craft,test-craft,security-craft,naming-craft}/SKILL.md` (20 files, one template)
| **Owns:** `agents/skills/*/harness-design-craft/**`, `agents/skills/*/code-craft/**`, `agents/skills/*/test-craft/**`, `agents/skills/*/security-craft/**`, `agents/skills/*/naming-craft/**`

**`[checkpoint:decision]`** — present this before writing 40 files:

> The craft platform mirrors are real COPIES, not symlinks (Fact 2). Options: **(A)** write the
> section into all four copies of each skill, leaving the copy structure as it is — the plan's
> default; **(B)** first convert the 30 craft mirror directories to symlinks like
> `harness-code-review`, then edit 10 files. **Recommendation: A.** B is the better end state but is
> a structural change to 30 directories that has nothing to do with whether craft is wired at
> review; it is recorded in `concerns` as a follow-up. Waiting for a reply.

1. Write the template once, to a scratch file, with two per-skill substitutions: `<SKILL>` and the
   `promptBudget` bullet. Template (hard-wrapped at 100 columns, `proseWrap: preserve`):

   ```md
   ## Invoked as a review hook

   `<SKILL>` auto-activates as an **advisory** review hook whenever a diff touches the surface it
   owns — `harness-autopilot` at `after:REVIEW` / `after:FINAL_REVIEW`, and `harness-code-review` at
   `after:mechanical`. The domain table is `CRAFT_REVIEW_DOMAINS` and the per-host events are
   `CRAFT_REVIEW_EVENTS_BY_HOST`, both in `packages/core/src/hooks/craft-review-hooks.ts`. The host
   forwards the subset of the diff this domain owns:

   - **`files`** — this domain's owned subset of the changed files, as **ABSOLUTE** paths. The host
     reads it from `plan.files["<SKILL>"]`, which holds repo-relative POSIX paths, and resolves each
     entry against the project root before calling `mcp__harness__<TOOL>`. Forwarded unresolved, the
     collectors read nothing and the run reports `status: "collected"` with zero prompts — a clean
     report from a run that read no code.
   - **`promptBudget`** — <BUDGET-LINE>

   Findings from a hook-triggered run are advisory: reported, never blocking, never counted toward
   review severity, and never entered into a host's mechanical exclusion set. A hook-triggered run
   that fails is a missing opinion, not a broken gate.
   ```

   `<BUDGET-LINE>` for the nine tools that declare it:

   ```
   accepted; raises the prompt ceiling for the forwarded scope when the diff subset is large.
   ```

   `<BUDGET-LINE>` for `harness-design-craft` only (measured: `design_craft` declares none):

   ```
   not accepted by `mcp__harness__design_craft`; bound the cost with `phases` / `mode` instead.
   ```

2. Insert the rendered section into each file immediately AFTER the `## Harness Integration` block —
   i.e. before the next line matching `^## ` — in all four platform copies. Verified present in all
   10 skills (`grep -c '^## Harness Integration'` = 1 each). Script it; do not hand-edit:

   ```
   node/python loop over PLATFORMS × {harness-design-craft,code-craft,test-craft,security-craft,naming-craft}
   ```

   Assert per file that `^## Harness Integration` matched exactly once before inserting, and that
   the file did not already contain `## Invoked as a review hook`.

3. Run: `npx vitest run --root packages/cli tests/integration/craft-skill-review-hook-sections.test.ts`
   — **observe 5 skills green, 5 still red** (the half-done state is the proof the law is per-skill
   and not a single global match).
4. Verify mirror parity explicitly before committing:

   ```
   for s in harness-design-craft code-craft test-craft security-craft naming-craft; do
     md5 -q agents/skills/{claude-code,cursor,codex,gemini-cli}/$s/SKILL.md | sort -u | wc -l
   done     # each must print 1
   ```

5. `npx prettier --write 'agents/skills/*/{harness-design-craft,code-craft,test-craft,security-craft,naming-craft}/SKILL.md'`
   and re-run step 3 (prettier must not alter the asserted `— accepted` / `— not accepted` lines).
6. Commit: `docs(craft): document the review-hook forwarding contract (design, code, test, security, naming)`
7. `git show --stat HEAD` — exactly 20 SKILL.md files plus pre-commit's plugin artifacts.

---

### Task 5: Apply the forwarding section to the remaining five domains

**Depends on:** Task 4 | **Files:** `agents/skills/{claude-code,codex,cursor,gemini-cli}/{cli-ergonomics-craft,api-craft,spec-craft,docs-craft,knowledge-craft}/SKILL.md` (20 files, same template)
| **Owns:** `agents/skills/*/cli-ergonomics-craft/**`, `agents/skills/*/api-craft/**`, `agents/skills/*/spec-craft/**`, `agents/skills/*/docs-craft/**`, `agents/skills/*/knowledge-craft/**`

1. Re-run the Task 4 script for the five remaining domains (all nine non-design tools take the
   `accepted` budget line).
2. Run: `npx vitest run --root packages/cli tests/integration/craft-skill-review-hook-sections.test.ts`
   — **observe GREEN, 31/31**.
3. Mirror-parity check for the five skills (same `md5 | sort -u | wc -l` = 1 loop).
4. `npx prettier --write` the 20 files; re-run step 2.
5. Commit: `docs(craft): document the review-hook forwarding contract (cli-ergonomics, api, spec, docs, knowledge)`
6. `git show --stat HEAD` — exactly 20 SKILL.md files plus plugin artifacts.

---

### Task 6: Mutate the craft-section laws

**Depends on:** Task 5 | **Files:** `packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts`
| **Category:** verification

Each mutation and its test run in ONE command, diff printed alongside the result.

1. **M-CRAFT-SECTION** — delete the whole `## Invoked as a review hook` section from
   `agents/skills/claude-code/docs-craft/SKILL.md` (claude-code copy only, so the mirror law also
   has something to say). Required: `docs-craft`'s section case and promptBudget case RED,
   `docs-craft`'s mirror case RED, **the other nine skills' 27 cases GREEN**. Restore.
2. **M-CRAFT-MIRROR** — append a single `\n<!-- drift -->` to
   `agents/skills/cursor/api-craft/SKILL.md` only. Required: `api-craft`'s mirror case RED;
   `api-craft`'s other two cases GREEN (they read the claude-code copy); all other skills GREEN.
   This is the mutant that proves the mirror law is the only thing in the repo that can see drift.
   Restore.
3. **M-CRAFT-SCHEMA** — add `promptBudget: { type: 'number' },` to `design_craft`'s
   `inputSchema.properties` in `packages/cli/src/mcp/tools/design-craft.ts`. Required:
   `harness-design-craft`'s promptBudget case RED (the doc now says "not accepted" while the schema
   accepts it); the other nine promptBudget cases GREEN. This proves the expectation is derived from
   the schema and not from a hand table. Restore. (cli tests import cli **src**, so no rebuild; note
   that other MCP schema tests may also move under this mutant — scope the run to this file plus
   `tests/mcp/tool-tiers.test.ts` as the record.)
4. Any mutant whose diff comes back EMPTY is INAPPLICABLE — report it and replace it; do not score
   it (the Phase 3 M-MTS-UNITS lesson).
5. Restore everything, `git status --short` empty, re-run to 31/31, and append the measured results
   as a comment block at the foot of the test file.
6. Commit: `test(craft): record the mutation results for the review-hook section laws`

---

### Task 7: Regenerate artifacts and run every suite this phase can have moved

**Depends on:** Task 6 | **Files:** generated plugin artifacts only (if any remain)
| **Category:** integration

1. `pnpm generate:plugin:all` then `git status --short` — expect a clean tree (pre-commit already
   regenerated at Tasks 1, 4, 5; Phase 3 recorded this same step as a verified no-op, so a no-op
   here is the expected result, not a skipped step). If files DO change, commit them:
   `chore(plugin): regenerate artifacts for the craft review-hook sections`.
2. `pnpm generate:plugin:check` — must pass.
3. `pnpm run generate-docs` then `git status --short` — the pre-push gate blocks on stale
   `docs/reference/*`. Expect no change (the catalog is generated from `skill.yaml`, untouched here);
   commit if it moves.
4. Run the suites that read these files:

   ```
   npx vitest run --root packages/cli tests/integration/autopilot-skill-hooks.test.ts \
     tests/integration/craft-skill-review-hook-sections.test.ts \
     tests/integration/craft-hooks-export.test.ts \
     tests/integration/skill-catalog-consistency.test.ts
   npx vitest run --root packages/cli tests/slash-commands tests/agent-definitions tests/mcp
   npx vitest run --root packages/core tests/hooks
   npx vitest run tests/platform-parity.test.ts
   ```

5. `npx prettier --check "**/*.{ts,tsx,md,json}"` on the touched paths — the pre-push gate runs the
   whole tree, so a drifting unrelated file is a known hazard; scope the fix to this phase's files.
6. Record every suite's pass count. A suite that reports 0 tests is a broken probe, not a pass.

---

### Task 8: Close-out — the `harness validate` byte-identity proof and the handoff

**Depends on:** Task 7 | **Files:** `.harness/sessions/changes--auto-wire-craft-at-review--proposal/handoff.json`
| **Category:** integration

1. Capture `harness validate` WITHOUT piping through `tail` (it takes ~5m45s; budget for it):

   ```
   harness validate > /tmp/phase4-validate.txt 2>&1; echo "exit=$?"
   wc -l < /tmp/phase4-validate.txt        # must be 29642
   md5 -q /tmp/phase4-validate.txt         # must be 4c0efe7709e813065698502570193753
   ```

   Exit must be 1. If the md5 differs, `diff` against a fresh pre-phase capture to get the exact
   drift before deciding anything — do NOT adjust the baseline, and never run
   `check-arch --update-baseline`.

2. `harness check-deps` — must pass (baseline: 2707 modules, 10 layers, validation passed).
3. `git log --stat cdb12047b..HEAD` — audit every commit: no file outside the File Map, no stray
   `.harness/` state, no `probe-*.mts` leftovers.
4. Overwrite `.harness/sessions/changes--auto-wire-craft-at-review--proposal/handoff.json` with
   Phase 4's record: `fromSkill`, `phase`, `summary`, `status`, `plan`, `taskCount`,
   `checkpointCount`, `mutationResults`, `testCounts`, `correctionsToThePlan`, `concerns`,
   `outOfScope`.
5. Commit: `chore(craft): phase 4 close-out`

---

## Dependency graph and parallelism

```
T1 ──┬── T2 (mutants, code-review laws)
     └── T3 ── T4 ── T5 ── T6 ── T7 ── T8
```

T2 and T3 are independent (different files, different laws) and may run in parallel. T4 and T5 are
strictly sequential only because they share the template script and the same law file's green state
— not because of file overlap. Everything from T6 on is sequential.

---

## Uncertainties

- **[ASSUMPTION]** Importing `../../src/mcp/server` into a `tests/integration` file is acceptable in
  cost and side effects. `tests/mcp/server.test.ts` already does exactly this. If wrong, Task 3
  step 3 says report and stop rather than degrade to a hand-written tool table.
- **[ASSUMPTION]** `extractSection(md, 'Phase 2: MECHANICAL')` scopes the new laws to the hook
  subsection. Verified structurally: `#### Lifecycle skill hooks` is nested inside `### Phase 2:
MECHANICAL` and `extractSection` terminates on `###`/`##`/`---`, and my probe paragraph landed
  inside that window.
- **[DEFERRABLE]** Exact wording of the six code-review bullets. The laws pin the load-bearing
  phrases; everything else can be edited freely.
- **[DEFERRABLE]** Whether `design_craft`'s `files` schema description ("relative to project root")
  should be corrected to match its absolute-capable implementation. Out of scope; in `concerns`.
- **RESOLVED by measurement, not assumption:** whether the existing code-review doc-contract tests
  can fail for craft (they cannot — Fact 1); whether the craft mirrors are symlinks (they are not —
  Fact 2); whether every craft tool accepts `promptBudget` (`design_craft` does not — Fact 3).

---

## Concerns (carried to the handoff)

1. **The craft platform mirrors are duplicated copies that nothing keeps in sync**, while
   `scripts/lib/plugin-config.mjs:38-40` states in a comment that they are symlinks. Phase 4 adds the
   first law that can see drift, but the structural fix — converting the 30 craft mirror directories
   to symlinks, as `harness-autopilot` and `harness-code-review` already are — belongs in its own
   change.
2. **The spec's "files plus a `promptBudget`" forwarding contract is false for `design_craft`**, and
   `harness-autopilot/SKILL.md:117-118` (Phase 3) repeats it unqualified. Phase 4 states the truth
   per-skill and derives the law from the schema, but the autopilot sentence still over-promises.
   One-line Phase 5 correction.
3. **`design_craft`'s `files` schema description says "relative to project root"** while its
   `readSource` takes the absolute branch (`design-craft/phases/critique.ts:158`). The doc is the
   stale half. Not fixed here.
4. **Task 3's law may be committed red for one task** if Tasks 3 and 4 are not executed in the same
   session. Default instruction is to fold Task 3's commit into Task 4 rather than leave a red law on
   the branch.
5. **`harness validate` costs ~5m45s per run**, so this plan proves it exactly once (Task 8) rather
   than per task. A drift introduced at Task 1 would therefore surface late; the mitigation is that
   no task touches anything `validate` reads except markdown under `agents/skills/`.
