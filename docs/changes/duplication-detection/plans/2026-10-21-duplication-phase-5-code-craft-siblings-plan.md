# Plan: Duplication Phase 5 — repair CODE-R004 in `code-craft`

**Date:** 2026-10-21 | **Spec:** `docs/changes/duplication-detection/proposal.md` (§ Phase 5, `<!-- complexity: medium -->`) |
**Tasks:** 10 | **Checkpoints:** 2 | **Time:** ~45 min of task work plus gate runtime |
**Integration Tier:** medium | **Worktree:** `/Users/cwarner/Projects/iv/hd-dry-concept`, branch `brainstorm/dry-refactoring-concept`, base HEAD `c31f2d77a`

---

## Goal

Give CODE-R004 the cross-file evidence its own text demands — the Rule-of-Three clause asks whether
"the same five lines [are] copied in three places" while `CritiqueInput` shows the model exactly one
place — by resolving each critiqued unit against `CloneIndex.byMember` and appending the sibling
locations (and Phase 4's `partial-extraction` signal) to the rendered prompt, with byte-identical
behaviour for every unit that belongs to no clone class.

---

## Measured baseline (every figure with its scope and denominator)

Taken in this worktree at `c31f2d77a` with the shipped build. **Scope D** is introduced here and is
a FOURTH scope for this feature: the corpus `code-craft`'s own `discoverSourceFiles(projectRoot)`
walks — `packages/*/src`, minus `tests`/`test`/`__tests__`/`fixtures`/`dist`/`coverage`/`__mocks__`/
`__snapshots__` and `*.{test,spec}.*` — which is **2,066 files**. It is not Scope A (`packages/`,
2,065 files via `findFiles` + `isEligibleFile`), not Scope B (repo non-test sources, 2,153), and not
Scope C (product scope, 96 classes). Figures below do not transfer between scopes.

| Figure                                                        | Value                             | Denominator / scope                         |
| ------------------------------------------------------------- | --------------------------------- | ------------------------------------------- |
| `buildCloneIndex` wall clock at Scope D                       | 2,894 / 2,386 / 2,142 ms (3 runs) | 2,066 files, idle machine, Node 24.15.0     |
| Classes reported at Scope D                                   | 58                                | 2,066 files                                 |
| `byMember.size` at Scope D                                    | 230                               | = the 230 members of those 58 classes       |
| Units fingerprinted at Scope D                                | 8,221                             | 2,066 files                                 |
| `partial-extraction` classes at Scope D                       | 7                                 | 58 classes                                  |
| `code-craft` substantive units at Scope D                     | **7,880**                         | 2,066 files — the denominator for all below |
| Units whose `${file}:${line}` key hits `byMember` **exactly** | **153** (1.94%)                   | 7,880 units                                 |
| Units that hit **only** via the spec's ±2 start tolerance     | **2** — and **both are FALSE**    | 7,880 units                                 |
| Units whose owning class is `partial-extraction`              | **16**                            | 7,880 units                                 |
| Extractor `startLine` agreement (`typescript` vs estree)      | **7,880 / 7,880 exact**           | 7,880 units; 0 needed any tolerance         |
| Extractor `endLine` agreement                                 | **7,880 / 7,880 exact**           | 7,880 units                                 |
| Extractor **`kind`** agreement                                | **7,741 / 7,880 (98.24%)**        | 139 disagree — see below                    |
| Keys where ≥2 estree units share one `${file}:${line}`        | 2                                 | 7,880 units; both `function\|function`      |
| `check-deps`                                                  | 2,665 modules / 10 layers, exit 0 | whole repo                                  |
| `check-arch` under `HARNESS_ARCH_BASE_REF=c83ec3620`          | exit 1, **13 issues**             | 12 complexity + 1 `module-size` aggregate   |
| `module-size` aggregate finding                               | `272433 -> 275454 (+3021)`        | accepted as-is; no baseline edit this phase |
| Pre-commit gate `ci check --skip "<SKIP>"`                    | **exit 0**, arch `warn`, 3 warns  | whole repo                                  |

**The three pre-existing arch warns at the pre-commit bar** (threshold 10, so they are the
functions nearest the hook's complexity bar, none of them in `code-craft`):
`resolveDriftConfig` (11) and `walk` (11) in `packages/cli/src/drift/index.ts`, `walk` (11) in
`packages/cli/src/brand/index.ts`.

### Two figures from the dispatch brief, re-verified

- "~2.4-3.0 s index build" — **confirmed** at Scope D (2.1-2.9 s over 3 runs).
- "`check-arch` currently shows 13 findings: 12 complexity plus a `module-size` aggregate regression
  272433 -> 275454" — **confirmed verbatim**, exit 1.
- "`check-deps` 2,665 modules / 10 layers" — **confirmed**, exit 0.

### One figure from the spec that measurement REFUTES

The spec's "Named risk: extractor line-number agreement" predicts the divergence is in LINE numbers
and names "decorators and leading comments" as the likely points. Measured over 7,880 units at
Scope D: **zero line divergences**, and decorators specifically agree — both extractors report a
decorated class at its `@Dec()` line and a decorated method at its own `@Dec()` line, because
`typescript`'s `getStart(sf)` skips only trivia (not decorators) and `@typescript-eslint/
typescript-estree` 8.59.x includes decorators in `ClassDeclaration` / `MethodDefinition` ranges.
Leading JSDoc and `//` comments agree for the same reason.

The real divergence is in **`kind`**, which the spec's criterion 5 also names but did not predict as
the failing half: **139 of 7,880 (1.76%)** `code-craft` units carry a `kind` estree disagrees with,
all one shape and all one direction — `code-craft` reports `method`, estree reports `function` — for
an object-literal property whose value is a function or arrow (`{ propArrow: (a) => {…} }`,
`{ propFn: function (a) {…} }`). `code-craft`'s `asFunctionLike` promotes a `ts.isPropertyAssignment`
parent to `'method'`; core's `UNIT_KINDS` maps `ArrowFunctionExpression` and `FunctionExpression` to
`'function'` unconditionally. **Matching on `(file, kind, startLine)` as the spec mandates would
therefore silently drop 1.76% of lookups.** The matcher this plan builds ignores `kind`; criterion 5
is restated in Task 1 to assert line agreement and to PIN the kind divergence by name, so a future
change to either extractor's kind mapping goes red instead of silently widening the gap.

### And one measurement that saves the spec's ±2 tolerance from being a false-positive generator

The spec mandates "±2-line tolerance". Measured: **0 of 7,880** units need it, and the 2 candidates
it does produce at Scope D are **both wrong** — a one-line arrow at `packages/cli/src/brand/index.ts:167`
(`endLine` 167) matches `collectFiles` at line 165 (`endLine` 172), and the same shape at
`packages/cli/src/naming-craft/index.ts:392` against line 390. Both are different units entirely.

The tolerance is still implemented, because it is the graceful-degradation path for exactly the
library drift the named risk is about — but it is implemented **behind a span co-check**: a candidate
is accepted only when the owning class holds a member at that key whose `endLine` is within ±2 of the
unit's `endLine`. The co-check costs **0 of the 153 true hits** (endLine agrees exactly 7,880/7,880)
and rejects **2 of 2** false ones. The two real cases above are the fixture basis for Task 3's
rejection test — reproduced, not invented.

---

## Observable Truths (acceptance criteria)

Every behavioural truth is phrased in EARS. Criteria 4 and 5 are Phase 5's.

1. **(Event-driven, criterion 4 — restated as rubric-scoped; see Task 1.)** When `code-craft`
   critiques a unit that belongs to a clone class, the CODE-R004 prompt shall list the sibling
   members' `file:line` locations.
2. **(Unwanted, criterion 4's second half.)** If the unit belongs to no clone class, then the
   rendered prompt shall be **byte-identical** to the pre-change prompt — for every rubric.
3. **(Unwanted.)** If the rubric is not in `SIBLING_AWARE_RUBRIC_IDS`, then the rendered prompt shall
   be byte-identical to the pre-change prompt **even when `siblings` is populated**.
4. **(Event-driven.)** When the owning class carries `signal: 'partial-extraction'`, the prompt shall
   name its `sharedImport` key and shall instruct the reader that the copies share a CALLED module
   rather than that the wrapper already lives there — the Phase-4 gate-fix wording (I1), verbatim in
   spirit.
5. **(State-driven, criterion 5 — restated; the `kind` half is refuted by measurement.)** While both
   extractors run over one shared fixture, they shall agree on every unit's `startLine` and `endLine`
   within ±2 lines; and the only `kind` disagreement shall be the object-literal-property
   function/arrow case, asserted by name.
6. **(Ubiquitous.)** The sibling matcher shall resolve a unit by `${relPosixPath}:${startLine}` with
   the exact key probed first, then ±1 then ±2, and shall accept a candidate only when the owning
   class holds a member at that key whose `endLine` is within ±2 of the unit's `endLine`.
7. **(Unwanted.)** If the owning class's member at the matched key is a different unit (its `endLine`
   disagrees by more than 2), then no siblings shall be attached — verified against the two real
   Scope-D false candidates named above.
8. **(Ubiquitous.)** The unit under review shall never appear in its own sibling list; every member
   sharing the matched `${file}:${startLine}` key is excluded, which is also the honest answer to the
   `byMember` key's known lossiness (two units on one line are one location).
9. **(Unwanted, D4 failure behaviour.)** If `buildCloneIndex` returns `Err`, or discovery finds no
   files, then `code-craft` shall complete the run with no siblings attached and shall not fail.
10. **(State-driven, cost.)** While `siblings` is not disabled, `code-craft` shall build the clone
    index **once per run** over the full project discovery — independent of `input.files`,
    `input.packages` and `input.maxFiles` — and shall attach siblings only to units that actually hit
    the index.
11. **(Ubiquitous.)** `harness code-craft`'s CLI surface and `code_craft`'s MCP input schema shall be
    unchanged, so `pnpm run generate-docs` leaves no diff (criterion 8).
12. **(Ubiquitous, criterion 9 / regression.)** `packages/core` shall stay at 507 files + 1 skipped /
    5,990 passed + 1 skipped, `packages/cli` shall rise only by this plan's new files and tests from
    750 files / 8,886 passed + 2 skipped, `check-deps` shall stay at 2,665 modules / 10 layers exit 0,
    and the pre-commit gate shall stay exit 0 with no new arch warn naming a `code-craft` function.
13. **(Ubiquitous.)** The spec's record shall carry Phase 5's measured figures with scope and
    denominator, the two criterion restatements, and the design decisions with their rejected
    alternatives.

### NFR targets

**Performance — elicited and wired.** This phase adds a 2.1-2.9 s synchronous-ish index build to
every `code-craft` run. Target, EARS: _While `siblings` is enabled, `code-craft` shall build the clone
index at most once per run._ Verified structurally (Task 7 asserts a single `buildCloneIndex`
invocation via an injected spy), not by a wall-clock assertion — the spec's own Phase-2 note explains
why a timing assertion on this machine is a flake generator, and that reasoning is unchanged here.
**Security, scalability, resilience — skipped.** No untrusted input (the index is built from the
project's own sources, already parsed by the detector), no new load dimension, and truth 9 already
covers the one failure mode.

---

## Design decisions

### D-P5-1 — `code-craft` builds its own index, once per run, over the full project

**Chosen.** `buildCodeCraftCloneIndex(projectRoot)` calls `discoverSourceFiles(projectRoot)` —
uncapped, ignoring `input.files` / `input.packages` / `input.maxFiles` — and hands the result to
`buildCloneIndex(files, { rootDir: projectRoot })` with `DEFAULT_DUPLICATION_CONFIG`
(`minInstances: 3`, `minTokens: 40`).

**Why the full project and not the critiqued set.** Siblings live in OTHER files by definition, and
`DEFAULT_MAX_FILES` is 100. An index over the critiqued set alone could never produce a 3-member class
for a targeted `--files one.ts` run, which is the most common invocation — the feature would ship
dead. Scope D is deliberately `code-craft`'s own discovery corpus rather than core's
`findFiles` + `isEligibleFile`: using one discovery function means every unit `code-craft` critiques
is provably inside the indexed corpus, so a miss is always "no clone class" and never "different
scope".

**Why default-ON.** 2.1-2.9 s against a run that makes up to 100 LLM calls. The escape hatch is
`CodeCraftInput.siblings: false`, programmatic only — **no new CLI flag and no MCP schema field**,
which is what keeps truth 11 (no `generate-docs` diff) free.

**Rejected: inject-only** (`CodeCraftInput.cloneIndex`, nobody wires it). That is the
"zero callers = not wired" shape this repo has shipped before; the field would exist and the rubric
would still be blind. **Rejected: read a persisted artifact** from a prior `harness cleanup -t
duplication` run — no such artifact exists and inventing one is a new surface, new staleness
question, and no criterion.

**Honest cost of the failure path.** On `Err`, `buildCodeCraftCloneIndex` returns `undefined` and the
reason is dropped: `code-craft`'s `CodeCraftSummary` has no channel for it and truth 9 forbids failing
the run. Surfacing sibling incidence in the summary is **deferred** (follow-up below) rather than
smuggled in — it changes `CodeCraftOutput`'s shape, the MCP response and the printed page, and traces
to no criterion. What makes the feature's wiring falsifiable instead is Task 7's end-to-end
assertion: `collectCodeCraftPrompts` returns `pendingPrompts[].userPrompt`, so the planted-clone test
reads the sibling block out of the real rendered prompt with no schema change at all.

### D-P5-2 — match on `(file, startLine)` with a span co-check; never on `kind`

Exact key first, then ±1, ±2 (the spec's mandate), each candidate gated by `|member.endLine -
unit.endLine| <= 2`. `kind` is not consulted: it disagrees for 139/7,880 units (§ Measured baseline).
A `relative(root, file).replaceAll('\\', '/')` normalisation mirrors core's `relativePosix`, which is
not barrel-exported.

### D-P5-3 — the prompt carries locations, the token count, and Phase 4's signal

Minimum per criterion 4 is the locations. The `tokenCount`, `signal` and `sharedImport` come from the
same `CloneClass` object at zero extra cost and change the ADVICE the rubric can give: "a first-party
module every copy calls into already exists, here is its key" is a delete-and-import-shaped repair,
not a design task. That is the only thing Phase 4's signal can be consumed BY, and it serves the same
criterion-4 clause. Capped at `MAX_RENDERED_SIBLINGS = 10` with a `(+N more)` line so a 16-member
class cannot dominate the prompt.

### D-P5-4 — only CODE-R004 renders the block `[checkpoint:decision]`

`SIBLING_AWARE_RUBRIC_IDS = new Set(['CODE-R004'])`. `code-craft` sends one prompt per (unit, rubric)
pair and 7 rubrics apply to a function, so rendering for all 7 costs 7x the tokens for 6 rubrics with
no clause that can use the evidence. Criterion 4's wording ("the rendered prompt") is in the spec's
"Repairing CODE-R004" section and reads naturally as CODE-R004's prompt; this plan restates it as
rubric-scoped rather than leaving the literal reading to a reviewer. `simplest-it-could-be` and the
naming rubrics are **not** widened to: YAGNI, and widening later is one line plus a test.

### D-P5-5 — criterion 5's `kind` half is restated `[checkpoint:decision]`

See § Measured baseline. The restatement asserts line agreement (measured 7,880/7,880) and pins the
object-literal-property kind divergence by name.

---

## File Map

```
CREATE packages/cli/src/code-craft/extract/siblings.ts
CREATE packages/cli/src/code-craft/phases/sibling-evidence.ts
MODIFY packages/cli/src/code-craft/phases/critique.ts
MODIFY packages/cli/src/code-craft/index.ts
CREATE packages/cli/tests/code-craft/critique-prompt.test.ts
CREATE packages/cli/tests/code-craft/siblings.test.ts
CREATE packages/cli/tests/code-craft/sibling-evidence.test.ts
CREATE packages/cli/tests/code-craft/extractor-agreement.test.ts
CREATE packages/cli/tests/code-craft/siblings-integration.test.ts
MODIFY docs/changes/duplication-detection/proposal.md
CREATE .changeset/duplication-code-craft-siblings.md
```

No `packages/core` source changes. No CLI flag, no MCP schema field, no barrel edit (every type this
phase consumes — `CloneIndex`, `CloneClass`, `CloneMember`, `buildCloneIndex`, `extractUnits` — is
already exported from `@harness-engineering/core`, verified in `packages/core/dist/index.d.ts`).

---

## Skeleton (recorded; standard rigor, 10 tasks)

1. Spec record + the two criterion restatements (1 task, ~5 min) `[checkpoint:decision]`
2. Pre-change prompt characterization anchor (1 task, ~4 min)
3. Sibling matcher + index builder (2 tasks, ~10 min)
4. Prompt-evidence renderer (1 task, ~5 min)
5. `critique.ts` wiring behind the rubric gate (1 task, ~5 min)
6. Orchestrator wiring, default-ON, single build per run (1 task, ~6 min)
7. Extractor-agreement test, criterion 5 (1 task, ~5 min)
8. Changeset + full gate pass (2 tasks, ~5 min + gate runtime) `[checkpoint:human-verify]`

**Estimated total:** 10 tasks, ~45 min of task work plus gate runtime.

---

## Verification rules that apply to EVERY task

- **Build:** `pnpm --filter @harness-engineering/cli run build` (and
  `pnpm --filter @harness-engineering/core run build` if core is ever touched — it is not here).
  **Never `npx turbo build --filter=...`:** `@harness-engineering/dashboard` is a cli build dependency
  whose build fails, so turbo prints `Tasks: N successful`, **exits 1, and leaves `dist` STALE**. The
  pre-commit arch hook reads `dist`.
- **Tests:** run from `packages/cli` (`cd packages/cli && npx vitest run <path>`). Never
  `npx vitest run --root packages/cli` from the repo root — 7 spurious failures from an unmocked
  `roadmapHealth` reading the live `docs/roadmap.md`.
- **Never read `$?` through a pipe.** `cmd >log 2>&1; echo $?` then inspect the log. `cmd | tail; echo
$?` reports `tail`'s 0 and has produced a green report over a red command three times this session.
- **`harness validate` cannot pass** (462 issues, exit 1). Baseline comparison only. Never write a
  step that reports "validate passed".
- **`harness check-arch` exits 1 in the steady state.** Gate on the SORTED issue-list diff under
  `HARNESS_ARCH_BASE_REF=c83ec3620` against the 13-issue baseline above. The `module-size` aggregate
  line's NUMBER will grow as this phase adds files — that is the same accepted finding, not a new one.
  **No `--update-baseline`, no allowance extension, no baseline edit.**
- **Format:** `npm run format:check`, never `prettier --check .` (1,506 pre-existing failures outside
  the real globs).
- **Never bypass hooks** — not `--no-verify`, not `core.hooksPath`, not `HUSKY=0`, not a
  hook-disabled subshell. If a hook blocks, stop and report it.
- **Telemetry churn:** the test suite, `harness validate` and `generate-docs` append to
  `.harness/security/timeline.json` and `packages/cli/.harness/security/timeline.json`. Revert both
  before each commit (`git checkout -- .harness/security/timeline.json
packages/cli/.harness/security/timeline.json`) and never stage them.
- **Function sizing against the HOOK's bars, not `check-arch`'s.** Every function this plan writes is
  sized for <= 40 lines and <= 8 cyclomatic complexity, under the hook's 50 / 10 warn bars with
  headroom. Phase 3 and Phase 4 each had a planned function breach mid-commit. The verification is
  running the hook's own command, not quoting the threshold:
  `node packages/cli/dist/bin/harness.js ci check --skip "entropy,docs,perf,security,deps,phase-gate"`
  must stay **exit 0** with no new warn line naming a `code-craft` function.
- **Every test states the mutation it must fail against, and the plan states why the fixture can
  reach the branch.** Seven vacuous tests have shipped in this feature; the pattern is always the
  same — the fixture could not reach the branch the test was named for. Plant the named mutation,
  observe red, revert. "The test passes" is not evidence.
- `eslint` on `packages/{core,cli}/tests/**` fails pre-existingly and no tsc project includes test
  files, so judge test strength on RUNTIME assertions only.

---

## Tasks

### Task 1: record Phase 5's measurements and restate criteria 4 and 5 `[checkpoint:decision]`

**Depends on:** none | **Files:** `docs/changes/duplication-detection/proposal.md` (MODIFY) |
**Owns:** `docs/changes/duplication-detection/proposal.md`

This task comes first because it is the decision gate: D-P5-4 (rubric scoping) and D-P5-5 (the `kind`
half of criterion 5) change what the implementation must do, and both contradict a literal reading of
the spec. The established convention for this feature is to restate a criterion against what
measurement shows and to record the refutation — criteria 1, 3 and 13 were each restated that way.

1. Append to `## Verification notes`, after the `### Phase 4 gate fixes` block, a
   `### Phase 5 — the measured extractor agreement, and two criteria restated` section containing:
   - The Scope D definition (2,066 files from `discoverSourceFiles`) named as a FOURTH scope, with
     the sentence that figures do not transfer between scopes.
   - The measured table from this plan's § Measured baseline, denominator 7,880 `code-craft` units:
     153 exact hits (1.94%), 2 tolerance-only candidates both false, 16 units under a labelled class,
     7,880/7,880 `startLine` and `endLine` agreement, 7,741/7,880 `kind` agreement.
   - The REFUTATION, stated plainly: the spec predicted decorators and leading comments would diverge
     in LINE numbers; measured 0/7,880, and decorators specifically agree (both extractors report the
     `@Dec()` line) at `typescript` 5.9.3 / `@typescript-eslint/typescript-estree` 8.59.x. The real
     divergence is `kind`, 139/7,880 (1.76%), all `code-craft` `method` vs estree `function` for an
     object-literal property function or arrow.
   - **Criterion 5 restated:** agreement is asserted on `startLine` and `endLine` within ±2, and the
     `kind` disagreement is pinned by name to the object-literal-property case. Matching on
     `(file, kind, startLine)` as originally written would drop 1.76% of lookups.
   - **Criterion 4 restated:** rubric-scoped to `SIBLING_AWARE_RUBRIC_IDS` (seeded `CODE-R004`), with
     the 7x token argument and the note that widening is one line plus a test.
   - The ±2 tolerance's honest account: 0/7,880 true positives, 2/7,880 false candidates, both
     rejected by the span co-check, retained as the drift-degradation path with the agreement test as
     the alarm. Name the two real cases (`packages/cli/src/brand/index.ts:167` vs `collectFiles` at
     165; `packages/cli/src/naming-craft/index.ts:392` vs 390).
   - D-P5-1's rejected alternatives (inject-only, persisted artifact) and the dropped-`Err`-reason
     tradeoff with its deferred follow-up.
2. Edit criteria 4 and 5 in `## Success Criteria` in place, each marked
   `**(Restated in Phase 5 against measurement; see "Phase 5 — the measured extractor agreement".)**`
   — matching how criteria 1, 3 and 13 carry their restatements.
3. Add to `### Deferred follow-ups (filed, not phases)`: **`code-craft sibling-evidence incidence in
the run summary`** — why it is deferred (changes `CodeCraftOutput`, the MCP response and the
   printed page; traces to no criterion) and what stands in for it (Task 7's end-to-end assertion
   over `pendingPrompts[].userPrompt`).
4. **CHECKPOINT — present to the human before Task 3 starts:** the two restatements, the rubric
   scoping, and the decision to keep the ±2 tolerance behind a span co-check rather than drop it.
   Tasks 2 and 8 do not depend on this and may proceed.
5. Verify: `npm run format:check >/tmp/p5-fmt.log 2>&1; echo $?` — expect 0.
6. Commit: `docs(duplication): record Phase 5's extractor measurements and restate criteria 4 and 5`

---

### Task 2: freeze the pre-change prompt as a byte-identity anchor

**Depends on:** none | **Files:** `packages/cli/tests/code-craft/critique-prompt.test.ts` (CREATE) |
**Owns:** `packages/cli/tests/code-craft/critique-prompt.test.ts`

Criterion 4's second half ("byte-identical to the pre-change prompt") currently has **no guard at
all**: no test in `packages/cli/tests/code-craft/` calls `buildPrompt`. "Byte-identical" is not
falsifiable without an anchor captured BEFORE the change, so this task runs against unmodified
`src/` and must pass before Task 6 touches `critique.ts`.

1. Create `packages/cli/tests/code-craft/critique-prompt.test.ts` importing `buildPrompt` from
   `../../src/code-craft/phases/critique` and `abstractionEarnsKeepRubric` from
   `../../src/code-craft/catalog/rubrics/abstraction-earns-keep`.
2. Define one fixture reused by every later case:

```ts
const SOURCE = `export function classify(x: number): string {
  if (x > 10) {
    return 'big';
  }
  const doubled = x * 2;
  return doubled > 5 ? 'medium' : 'small';
}
`;
const UNIT: CodeUnit = { kind: 'function', name: 'classify', line: 1, endLine: 7 };
const BASE = { file: 'packages/cli/src/demo.ts', source: SOURCE, unit: UNIT } as const;
```

3. Capture the anchor by running the file once, printing
   `JSON.stringify(buildPrompt({ ...BASE, rubric: abstractionEarnsKeepRubric }))`, and pasting the
   value into the test as a single frozen template literal `PROMPT_CODE_R004_NO_SIBLINGS`. Assert
   `buildPrompt({ ...BASE, rubric: abstractionEarnsKeepRubric }) === PROMPT_CODE_R004_NO_SIBLINGS`.
   Add a comment stating that the literal was captured at `c31f2d77a` before any Phase 5 src change
   and that editing it to make a test pass defeats the criterion it exists for.
4. Add a second anchor for a NON-sibling-aware rubric (`revealsIntentRubric`, CODE-R001) the same
   way — Task 6's truth 3 needs a pre-change baseline for that path too.
5. **Mutation it must fail against:** change any line of `buildPrompt`'s returned array — delete the
   blank line before `'Respond with a fenced JSON block. Either:'`, or reorder `File:` and `Unit:`.
   **Reachable because** the assertion is on the exact return value of the only function under test,
   with no provider, no filesystem and no index involved.
6. Verify: `cd packages/cli && npx vitest run tests/code-craft/critique-prompt.test.ts >/tmp/p5-t2.log 2>&1; echo $?`
   — expect 0, 2 passing. Plant the mutation, re-run, observe red (capture the diff line it reports),
   revert, re-run green.
7. Revert telemetry churn. Commit: `test(code-craft): freeze the pre-change critique prompt as a byte-identity anchor`

---

### Task 3: the sibling matcher

**Depends on:** Task 1 | **Files:** `packages/cli/src/code-craft/extract/siblings.ts` (CREATE),
`packages/cli/tests/code-craft/siblings.test.ts` (CREATE) |
**Owns:** `packages/cli/src/code-craft/extract/siblings.ts`

Pure lookup over a caller-supplied `CloneIndex`. No I/O — the index build is Task 4, deliberately
separated so every case here is a hand-built index and no test depends on a repo scan (criterion 10).

1. Create `packages/cli/src/code-craft/extract/siblings.ts`:

```ts
/**
 * Sibling resolution — the seam that answers CODE-R004's own question.
 *
 * `abstraction-earns-keep` (CODE-R004) names the Rule of Three verbatim ("the
 * same five lines copied in three places crying out for one named home") while
 * `CritiqueInput` carries ONE unit's source span and no cross-file channel.
 * Asking a model whether five lines appear in three places while showing it one
 * place is not a hard judgment call, it is an impossible one. This module turns
 * `CloneIndex.byMember` — core's `${file}:${startLine}` -> owning class map —
 * into the evidence that clause needs.
 *
 * Source: docs/changes/duplication-detection/proposal.md (Phase 5).
 */

import * as path from 'node:path';
import type { CloneClass, CloneIndex, CloneMember } from '@harness-engineering/core';
import type { CodeUnit } from '../findings/schema.js';

/**
 * Start-line probe offsets, exact-first.
 *
 * The spec mandates a ±2 tolerance for the named risk that `typescript`'s
 * `node.getStart(sf)` and estree's `loc.start.line` disagree. Measured at Scope
 * D (2,066 files / 7,880 code-craft units) they agree 7,880/7,880, so this
 * tolerance contributes ZERO true positives today — and the two candidates it
 * does produce are both wrong (a one-line arrow at brand/index.ts:167 matching
 * `collectFiles` at 165). It is retained as the degradation path for a future
 * parser release, and it is safe only because every candidate is gated by
 * {@link spanAgrees}. Exact first so the common case costs one Map lookup.
 */
const START_LINE_PROBE_ORDER: readonly number[] = [0, -1, 1, -2, 2];

/** Max `endLine` drift tolerated when confirming a candidate is the SAME unit. */
const SPAN_TOLERANCE = 2;

/** What the critique prompt needs about a unit's clone class. */
export interface SiblingEvidence {
  /**
   * The OTHER locations sharing this unit's normalized token shape.
   *
   * Every member at the matched `${file}:${startLine}` key is excluded, not just
   * the unit itself. The key is lossy by construction — a function and a nested
   * arrow, or a one-line `const K = class { m() {} }`, collapse onto one key —
   * and two units at one location are ONE location to a reader following a
   * `file:line` pointer. Showing the queried line back as a "sibling" would be
   * noise at best and a false third copy at worst.
   */
  siblings: CloneMember[];
  /** The owning class, for `tokenCount` / `signal` / `sharedImport`. */
  siblingClass: CloneClass;
}

/**
 * Resolve one `code-craft` unit against the clone index, or `undefined`.
 *
 * Matches on `(file, startLine)` and NEVER on `kind`. The two extractors
 * disagree on `kind` for 139 of 7,880 units at Scope D — all one shape, all one
 * direction: `code-craft`'s `asFunctionLike` promotes an object-literal property
 * (`{ run: (x) => {…} }`) to `'method'`, while core's `UNIT_KINDS` maps
 * `ArrowFunctionExpression` and `FunctionExpression` to `'function'`
 * unconditionally. Matching on `(file, kind, startLine)` as the spec originally
 * mandated would silently drop 1.76% of lookups; criterion 5 is restated
 * accordingly and `tests/code-craft/extractor-agreement.test.ts` pins the
 * divergence so a change to either mapping goes red.
 */
export function resolveSiblingEvidence(
  index: CloneIndex,
  projectRoot: string,
  file: string,
  unit: CodeUnit
): SiblingEvidence | undefined {
  const rel = toRelativePosix(projectRoot, file);
  for (const offset of START_LINE_PROBE_ORDER) {
    const startLine = unit.line + offset;
    const siblingClass = index.byMember.get(`${rel}:${startLine}`);
    if (siblingClass === undefined) continue;
    if (!spanAgrees(siblingClass, rel, startLine, unit.endLine)) continue;
    // No empty-list guard: `CloneClass.members.length >= minInstances` (>= 3 by
    // contract) and two distinct units cannot share one (file, startLine), so
    // self-exclusion always leaves at least one sibling. A guard here would be
    // an unreachable branch and an untestable one.
    return {
      siblings: siblingClass.members.filter((m) => !(m.file === rel && m.startLine === startLine)),
      siblingClass,
    };
  }
  return undefined;
}

/**
 * Does the owning class hold a member at this key whose span matches the unit?
 *
 * This is what makes the ±2 start tolerance safe rather than a false-positive
 * generator, and it is also the answer to the `byMember` key's lossiness: when a
 * one-line arrow and its enclosing function share a key, their `endLine`s
 * differ, so the index's first-writer-wins owner is accepted only for the unit
 * it actually describes. Measured at Scope D: costs 0 of 153 true hits
 * (`endLine` agrees 7,880/7,880) and rejects 2 of 2 false candidates.
 */
function spanAgrees(cls: CloneClass, rel: string, startLine: number, endLine: number): boolean {
  return cls.members.some(
    (m) =>
      m.file === rel && m.startLine === startLine && Math.abs(m.endLine - endLine) <= SPAN_TOLERANCE
  );
}

/**
 * Repo-relative POSIX path, mirroring core's `relativePosix`.
 *
 * `CloneMember.file` is built with core's `relativePosix(rootDir, abs)` and the
 * `byMember` key is built from it, so any divergence here is a 100% miss rate on
 * Windows rather than a subtle one. Core does not barrel-export `relativePosix`,
 * so the two-line implementation is mirrored verbatim rather than approximated
 * with `path.posix.relative` (which does not convert separators).
 */
function toRelativePosix(projectRoot: string, file: string): string {
  return path.relative(projectRoot, file).replaceAll('\\', '/');
}
```

2. Create `packages/cli/tests/code-craft/siblings.test.ts` with a hand-built index factory:

```ts
function member(file: string, startLine: number, endLine: number, unit = 'u'): CloneMember {
  return { file, unit, kind: 'function', startLine, endLine };
}
function cloneClass(members: CloneMember[], over: Partial<CloneClass> = {}): CloneClass {
  const tokenCount = over.tokenCount ?? 90;
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    tokenCount,
    members,
    rank: tokenCount * members.length,
    priority: tokenCount * members.length,
    signal: 'duplicate',
    ...over,
  };
}
function index(classes: CloneClass[]): CloneIndex {
  const byMember = new Map<string, CloneClass>();
  for (const cls of classes) {
    for (const m of cls.members) {
      if (!byMember.has(`${m.file}:${m.startLine}`)) byMember.set(`${m.file}:${m.startLine}`, cls);
    }
  }
  return { classes, byMember, skipped: [], collisions: [], stats: STATS_ZERO } as CloneIndex;
}
```

Cases, each with its mutation named in a comment:

- **exact-key hit, self excluded** — class of 3 members (`a.ts:10-20`, `b.ts:30-40`,
  `c.ts:50-60`), query `a.ts` unit `{line:10,endLine:20}`; expect 2 siblings, neither in `a.ts:10`,
  and `siblingClass.tokenCount === 90`. _Mutation: drop the `.filter` — 3 siblings including self._
- **tolerance hit accepted** — member at `a.ts:12-22`, query `{line:10,endLine:20}` (offset +2,
  `endLine` within 2); expect a hit. _Mutation: shorten `START_LINE_PROBE_ORDER` to `[0]` —
  undefined. **Reachable because** the only member in `a.ts` is 2 lines off and its `endLine` is
  within tolerance; nothing else in the fixture can satisfy the probe._
- **span co-check rejects the real Scope-D false candidate** — reproduce it verbatim: member
  `packages/cli/src/brand/index.ts:165-172` (`unit: 'collectFiles'`, `tokenCount: 88`, 4 members),
  query `{kind:'function', name:'<anonymous>', line:167, endLine:167}`; expect `undefined`.
  _Mutation: delete the `spanAgrees` call — returns `collectFiles`'s class, which is the exact
  false positive measured at Scope D. **Reachable because** the fixture's member IS 2 lines off and
  its `endLine` IS 5 off, so the probe reaches the candidate and only the co-check rejects it._
- **exact key beats a tolerance candidate** — members at `a.ts:10-20` and `a.ts:12-22` in
  DIFFERENT classes (distinct fingerprints and token counts), query `{line:10,endLine:20}`; expect
  the `a.ts:10` class, asserted by `fingerprint`. _Mutation: reorder `START_LINE_PROBE_ORDER` to
  `[-2, -1, 0, 1, 2]` — returns the wrong class. **Reachable because** both candidates satisfy
  their own span check, so only probe ORDER can decide._
- **kind is not consulted** — index member `kind: 'function'`, query unit `kind: 'method'` at the
  same `(file, line, endLine)`; expect a hit. _Mutation: add `&& m.kind === unit.kind` to
  `spanAgrees` — undefined. This is the 139/7,880 case._
- **lossy key: both units at one line excluded** — class members `a.ts:58-58` (the class) and
  `b.ts:58-58`, `c.ts:70-70`; query `a.ts` `{line:58,endLine:58}`; expect exactly the `b.ts` and
  `c.ts` members. _Mutation: filter on `m.startLine === startLine && m.unit === unit.name` —
  leaks a same-line twin._
- **miss** — query a file not in the index; expect `undefined`. _Mutation: return a default class._
- **relative-path normalisation** — `projectRoot = '/repo'`, `file = '/repo/packages/a/src/x.ts'`,
  index member `'packages/a/src/x.ts'`; expect a hit. _Mutation: drop the `replaceAll` — passes on
  POSIX and fails only on win32, so ALSO assert `toRelativePosix`-equivalence indirectly by
  asserting the hit with a `path.join`-built absolute path (the one form that differs per
  platform), and add `it.skipIf(process.platform === 'win32')` nowhere — this case must run
  everywhere._

3. Verify: `cd packages/cli && npx vitest run tests/code-craft/siblings.test.ts >/tmp/p5-t3.log 2>&1; echo $?`
   — expect 0, 8 passing. Plant each named mutation in turn, observe red, revert.
4. `pnpm --filter @harness-engineering/cli run build >/tmp/p5-t3-build.log 2>&1; echo $?` — expect 0.
5. Revert telemetry churn. Commit: `feat(code-craft): resolve a unit's clone siblings from CloneIndex.byMember`

---

### Task 4: the per-run clone-index builder

**Depends on:** Task 3 | **Files:** `packages/cli/src/code-craft/extract/siblings.ts` (MODIFY),
`packages/cli/tests/code-craft/siblings.test.ts` (MODIFY) |
**Owns:** `packages/cli/src/code-craft/extract/siblings.ts`

1. Append to `siblings.ts`:

```ts
import { buildCloneIndex } from '@harness-engineering/core';
import { discoverSourceFiles } from './discover.js';

/**
 * Build the clone index for one `code-craft` run, or `undefined`.
 *
 * Scope is the FULL project discovery — deliberately NOT `input.files`,
 * `input.packages` or `input.maxFiles`. Siblings live in other files by
 * definition and `DEFAULT_MAX_FILES` is 100, so an index over the critiqued set
 * could never form a 3-member class for a `--files one.ts` run, which is the
 * most common invocation. Reusing `discoverSourceFiles` (rather than core's
 * `findFiles` + `isEligibleFile`) means every unit code-craft critiques is
 * provably inside the indexed corpus, so a miss always means "no clone class"
 * and never "different scope". Measured at that scope: 2,066 files, 2.1-2.9 s,
 * 58 classes, 230 `byMember` keys.
 *
 * Returns `undefined` on `Err` and on an empty discovery, and the reason is
 * dropped: `CodeCraftSummary` has no channel for it and the spec requires the
 * critique to degrade to current behaviour rather than fail. Surfacing sibling
 * incidence in the run summary is a filed follow-up — it changes
 * `CodeCraftOutput`, the MCP response and the printed page. What keeps the
 * wiring falsifiable meanwhile is the end-to-end assertion over
 * `collectCodeCraftPrompts(...).pendingPrompts[].userPrompt`.
 */
export async function buildCodeCraftCloneIndex(
  projectRoot: string
): Promise<CloneIndex | undefined> {
  const files = discoverSourceFiles(projectRoot);
  if (files.length === 0) return undefined;
  const result = await buildCloneIndex(files, { rootDir: projectRoot });
  return result.ok ? result.value : undefined;
}
```

2. Tests appended to `siblings.test.ts`, using a real `mkdtempSync` project with three planted
   copies of one >= 40-token function under `packages/p/src/`:
   - **builds an index that resolves the planted clone** — write the same 12-line function to
     `a.ts`, `b.ts`, `c.ts` under `<tmp>/packages/p/src/`; call `buildCodeCraftCloneIndex(tmp)`, then
     `resolveSiblingEvidence(index, tmp, <tmp>/packages/p/src/a.ts, unit)` with the unit's real
     `(line, endLine)`; expect 2 siblings naming `packages/p/src/b.ts` and `packages/p/src/c.ts`.
     _Mutation: pass `input.files`-style single-file list to `buildCloneIndex` — 0 siblings. **This is
     the case that proves the whole feature end-to-end at the module level**, and it is reachable only
     if the planted function clears `minTokens: 40`; assert `siblingClass.tokenCount >= 40` so a
     fixture that silently fell under the bar fails loudly instead of reporting "no siblings"._
   - **empty discovery returns `undefined`** — an empty tmp dir. _Mutation: drop the `length === 0`
     guard; `buildCloneIndex([])` returns `Err` (its all-files-skipped path), so the test still
     passes — therefore assert the guard separately by spying that `buildCloneIndex` is NOT called.
     Without the spy this case is vacuous: both paths return `undefined`._
   - **two copies do not form a class** — only `a.ts` and `b.ts`; expect `undefined` from
     `resolveSiblingEvidence` (`minInstances: 3`). _Mutation: pass `minInstances: 2` — a hit._
3. Verify: `cd packages/cli && npx vitest run tests/code-craft/siblings.test.ts >/tmp/p5-t4.log 2>&1; echo $?`
   — expect 0, 11 passing. Plant each mutation, observe red, revert.
4. `pnpm --filter @harness-engineering/cli run build >/tmp/p5-t4-build.log 2>&1; echo $?` — expect 0.
   Then `node packages/cli/dist/bin/harness.js check-deps >/tmp/p5-t4-deps.log 2>&1; echo $?` —
   expect 0 and **2,665 modules / 10 layers unchanged** (this task introduces the first
   `code-craft` -> `@harness-engineering/core` edge).
5. Revert telemetry churn. Commit: `feat(code-craft): build a per-run clone index over the project's own discovery scope`

---

### Task 5: the prompt-evidence renderer

**Depends on:** Task 1 | **Files:** `packages/cli/src/code-craft/phases/sibling-evidence.ts` (CREATE),
`packages/cli/tests/code-craft/sibling-evidence.test.ts` (CREATE) |
**Owns:** `packages/cli/src/code-craft/phases/sibling-evidence.ts`

Prompt text, kept out of `critique.ts` so the wording is unit-testable without building a whole
prompt, and out of `extract/siblings.ts` so a discovery module does not own LLM-facing copy.

1. Create `packages/cli/src/code-craft/phases/sibling-evidence.ts`:

```ts
/**
 * Renders the mechanical duplication evidence block appended to a
 * sibling-aware critique prompt.
 *
 * Source: docs/changes/duplication-detection/proposal.md (Phase 5).
 */

import type { CloneClass, CloneMember } from '@harness-engineering/core';

/** Locations rendered before the list is summarised with a `(+N more)` line. */
const MAX_RENDERED_SIBLINGS = 10;

/**
 * Prompt lines for one unit's clone siblings, including the trailing blank.
 *
 * `siblingClass` is optional on purpose: the spec's literal wording adds
 * `siblings?: CloneMember[]` alone, so a caller following it verbatim passes the
 * locations with no class. That degenerate path renders the locations and omits
 * the token count and the signal, rather than failing or inventing a number.
 */
export function renderSiblingEvidence(
  siblings: readonly CloneMember[],
  siblingClass?: CloneClass
): string[] {
  const shown = siblings.slice(0, MAX_RENDERED_SIBLINGS);
  const lines = [
    'MECHANICAL DUPLICATION EVIDENCE (not a judgment — a whole-unit token-shape match, with identifier and literal spellings normalized away):',
    shapeLine(siblings.length, siblingClass),
    ...shown.map((m) => `- ${m.file}:${m.startLine} (${m.kind} ${m.unit})`),
  ];
  if (siblings.length > shown.length) {
    lines.push(`- (+${siblings.length - shown.length} more not listed)`);
  }
  const shared = sharedModuleLine(siblingClass);
  if (shared !== undefined) lines.push(shared);
  lines.push(
    "This is the evidence CODE-R004's Rule-of-Three clause asks for. Judge whether these copies are crying out for one named home, and if so name the home concretely. Copies that share a shape but would each need a distinct parameter per call site are NOT a missing abstraction.",
    ''
  );
  return lines;
}

function shapeLine(count: number, cls?: CloneClass): string {
  const where = `${count} other location${count === 1 ? '' : 's'}`;
  return cls === undefined
    ? `This unit's token shape also appears at ${where}:`
    : `This unit's normalized token shape (${cls.tokenCount} tokens) also appears at ${where}:`;
}

/**
 * The `partial-extraction` line, or `undefined` for a plain duplicate.
 *
 * The wording is the Phase-4 gate fix (I1) held to: a labelled class means the
 * members CALL INTO the named module, NOT that the exact wrapper already lives
 * there. Three classes carried a `sharedImport` naming a module that exported no
 * such helper at all before the predicate was tightened, and the operator-facing
 * promise was false for 3 of 10 classes. Telling a model "the helper exists,
 * just import it" where it does not is the same false promise with a larger
 * blast radius.
 */
function sharedModuleLine(cls?: CloneClass): string | undefined {
  if (cls === undefined || cls.signal !== 'partial-extraction') return undefined;
  if (cls.sharedImport === undefined) return undefined;
  return (
    `PARTIAL EXTRACTION: every copy CALLS INTO one first-party module — \`${cls.sharedImport}\` ` +
    '(a repo-relative extensionless module key, not a file path). The shared layer is already ' +
    'extracted and only the wrapper layer stayed duplicated, so the repair is cheaper than ' +
    'greenfield. It is NOT necessarily a delete-and-import: open that module and confirm what it ' +
    'exports before advising one — the tag means the copies share a CALLED module, not that this ' +
    'exact wrapper already lives there.'
  );
}
```

2. Create `packages/cli/tests/code-craft/sibling-evidence.test.ts`:
   - **plain duplicate, 2 siblings** — assert the shape line names `90 tokens` and `2 other
locations`, both `file:line (kind unit)` lines present, and **no** line containing
     `PARTIAL EXTRACTION`. _Mutation: drop the `signal !== 'partial-extraction'` guard — the label
     appears on a plain class._
   - **`partial-extraction` with `sharedImport`** — assert the key
     `packages/cli/src/shared/craft/fenced-json` appears AND that the text contains both `CALLS INTO`
     and `confirm what it exports`. _Mutation: reword to "the helper already exists, import it" — the
     `confirm what it exports` assertion fails. This pins I1's corrected promise, which is the one
     claim this feature got provably wrong once already._
   - **labelled but `sharedImport` absent** — `signal: 'partial-extraction'` with no
     `sharedImport`; expect no `PARTIAL EXTRACTION` line and no `undefined` in the output.
     _Mutation: drop the `sharedImport === undefined` guard — renders `` `undefined` ``. **Reachable
     because** the type makes `sharedImport` optional and a hand-built class omits it; the class
     invariant ties it to the signal but the renderer is a published-shape consumer, not the producer._
   - **cap** — 14 siblings; expect exactly 10 location lines plus `(+4 more not listed)`.
     _Mutation: `slice(0, 10)` -> `slice()` — 14 lines, no `(+4` line. **Reachable because** the
     fixture has 14 members, above the cap._
   - **singular wording** — 1 sibling; expect `1 other location:` not `locations`. _Mutation: drop
     the ternary._
   - **degenerate: no class** — `renderSiblingEvidence(siblings)`; expect the locations, no token
     count, no signal line, and no `NaN`/`undefined`. _Mutation: make `siblingClass` required and
     read `cls.tokenCount` unguarded — throws._
   - **trailing blank** — assert `lines.at(-1) === ''` (Task 6's splice relies on it for spacing).
3. Verify: `cd packages/cli && npx vitest run tests/code-craft/sibling-evidence.test.ts >/tmp/p5-t5.log 2>&1; echo $?`
   — expect 0, 7 passing. Plant each mutation, observe red, revert.
4. Revert telemetry churn. Commit: `feat(code-craft): render mechanical duplication evidence for a sibling-aware prompt`

---

### Task 6: wire the evidence into `buildPrompt` behind the rubric gate

**Depends on:** Task 2, Task 5 | **Files:** `packages/cli/src/code-craft/phases/critique.ts` (MODIFY),
`packages/cli/tests/code-craft/critique-prompt.test.ts` (MODIFY) |
**Owns:** `packages/cli/src/code-craft/phases/critique.ts`

1. In `critique.ts`, add the imports and the rubric gate:

```ts
import type { CloneClass, CloneMember } from '@harness-engineering/core';
import { renderSiblingEvidence } from './sibling-evidence.js';

/**
 * Rubrics whose text carries a clause only cross-file evidence can answer.
 *
 * CODE-R004 names the Rule of Three verbatim — "the same five lines copied in
 * three places crying out for one named home" — and was structurally unable to
 * answer it. The other six seed rubrics judge the unit in front of them, so
 * rendering siblings for all seven would cost 7x the tokens (one prompt per
 * (unit, rubric) pair) for six rubrics with no clause that can use it. Widening
 * this set is one line plus a test, and is a decision someone should make
 * deliberately rather than inherit. Spec criterion 4 is restated as
 * rubric-scoped on exactly this argument.
 */
export const SIBLING_AWARE_RUBRIC_IDS: ReadonlySet<string> = new Set(['CODE-R004']);
```

2. Extend both input interfaces with the same two optional fields, `CritiqueInput` first (it is the
   LLM-calling superset) and `BuildPromptInput` second:

```ts
  /**
   * Other locations sharing this unit's normalized token shape. Spec-literal
   * (`siblings?: CloneMember[]`) and self-excluded. Absent — not empty — when
   * the unit belongs to no clone class, so the no-siblings prompt stays
   * byte-identical to the pre-change one.
   */
  siblings?: readonly CloneMember[];
  /**
   * The owning clone class, for `tokenCount` / `signal` / `sharedImport`.
   * Separate from `siblings` because `siblings` is the self-EXCLUDED list and
   * this is the class it came from; `resolveSiblingEvidence` is the only
   * construction site, so the pair cannot desync. Optional independently: a
   * caller following the spec's literal wording passes `siblings` alone and gets
   * the locations without the token count or the signal.
   */
  siblingClass?: CloneClass;
```

3. Thread them through `critiqueOne` (destructure and pass to `buildPrompt(input)` — `input` is
   already passed whole, so this needs no change beyond the interface) and splice in `buildPrompt`:

```ts
export function buildPrompt(input: BuildPromptInput): string {
  const { file, source, unit, rubric, siblings, siblingClass } = input;
  const snippet = unitSource(source, unit, MAX_UNIT_CHARS);
  const evidence =
    siblings !== undefined && siblings.length > 0 && SIBLING_AWARE_RUBRIC_IDS.has(rubric.id)
      ? renderSiblingEvidence(siblings, siblingClass)
      : [];
  return [
    // … unchanged head through the closing fence and its trailing '' …
    ...evidence,
    'Respond with a fenced JSON block. Either:',
    // … unchanged tail …
  ].join('\n');
}
```

Spreading `[]` splices nothing, so the no-siblings array is **the same array it was** — which is
what makes truth 2 structural rather than a promise. 4. Tests appended to `critique-prompt.test.ts`:

- **byte-identity, no siblings** — the Task 2 anchor still holds for both rubrics.
  _Mutation: render unconditionally (drop the `siblings !== undefined` term) — the CODE-R004 anchor
  fails._
- **byte-identity, `siblings: []`** — `buildPrompt({ ...BASE, rubric: CODE_R004, siblings: [] })
=== PROMPT_CODE_R004_NO_SIBLINGS`. _Mutation: drop the `length > 0` term — a header with zero
  locations is rendered. **Reachable because** the fixture passes a present-but-empty array, which
  only that term rejects._
- **byte-identity, non-sibling-aware rubric with siblings present** — CODE-R001 with 2 siblings
  `=== PROMPT_CODE_R001_NO_SIBLINGS`. _Mutation: drop the `SIBLING_AWARE_RUBRIC_IDS.has` term — the
  block appears in CODE-R001's prompt. **Reachable because** the fixture populates `siblings` and
  the only thing stopping the render is the rubric gate. This is truth 3, and it is the case that
  the "render for every rubric" reading of criterion 4 would fail._
- **CODE-R004 with siblings** — assert the rendered prompt CONTAINS both sibling `file:line`
  strings, that the evidence block sits between the closing code fence and
  `'Respond with a fenced JSON block. Either:'` (assert on index ordering, not just containment),
  and that the prompt still ends with the confidence-policy reminder. _Mutation: append `evidence`
  after the tail instead — the ordering assertion fails._
- **`critiqueOne` forwards them** — `MockLlmProvider` capturing the prompt it is called with;
  assert the sibling block reached the provider. _Mutation: have `critiqueOne` call
  `buildPrompt({ file, source, unit, rubric })` field-by-field instead of passing `input` — the
  fields are dropped and the block is absent. **Reachable because** the assertion is on the string
  the provider actually received, not on `buildPrompt`'s return._

5. Verify: `cd packages/cli && npx vitest run tests/code-craft >/tmp/p5-t6.log 2>&1; echo $?` —
   expect 0, and the pre-existing `code-craft` files all still green. Plant each mutation, observe
   red, revert.
6. `pnpm --filter @harness-engineering/cli run build >/tmp/p5-t6-build.log 2>&1; echo $?` — expect 0.
7. Revert telemetry churn. Commit: `feat(code-craft): give CODE-R004's Rule-of-Three clause its cross-file evidence`

---

### Task 7: wire the orchestrator — default-ON, one index per run

**Depends on:** Task 4, Task 6 | **Files:** `packages/cli/src/code-craft/index.ts` (MODIFY),
`packages/cli/tests/code-craft/siblings-integration.test.ts` (CREATE) |
**Owns:** `packages/cli/src/code-craft/index.ts`

**Parameter-count discipline first.** `critiqueUnit` already takes 5 parameters and
`harness.config.json` warns at 5. Adding a 6th would breach the hook's bar mid-commit, which is
exactly how Phases 3 and 4 each lost a commit. Bundle before adding.

1. Add to `CodeCraftInput`:

```ts
  /**
   * Attach clone-sibling evidence to sibling-aware rubric prompts. Default
   * `true`: the index costs 2.1-2.9 s at this repository's scope against a run
   * that makes up to 100 LLM calls, and an opt-in default would ship a field
   * nobody sets and a rubric still unable to answer its own question. Set
   * `false` for a run where the index build is not worth it (one `--files` unit
   * on a very large project). Programmatic only — no CLI flag and no MCP schema
   * field, so the generated reference docs are untouched.
   */
  siblings?: boolean;
  /** Test-only clone-index override, mirroring `__testProvider`. */
  __testCloneIndex?: CloneIndex;
```

2. Add the context type and resolver (both <= 12 lines, complexity <= 3):

```ts
/** Everything a critique needs to resolve a unit's siblings. */
interface SiblingContext {
  index: CloneIndex;
  projectRoot: string;
}

async function resolveSiblingContext(
  projectRoot: string,
  input: CodeCraftInput
): Promise<SiblingContext | undefined> {
  if (input.siblings === false) return undefined;
  const index = input.__testCloneIndex ?? (await buildCodeCraftCloneIndex(projectRoot));
  return index === undefined ? undefined : { index, projectRoot };
}
```

3. **Refactor `critiqueUnit` to take one context object** rather than growing to 6 parameters:

```ts
interface CritiqueFileContext {
  file: string;
  source: string;
  provider: LlmProvider;
  acc: RunAccumulator;
  siblings: SiblingContext | undefined;
}

async function critiqueUnit(ctx: CritiqueFileContext, unit: CodeUnit): Promise<void> {
  const evidence =
    ctx.siblings === undefined
      ? undefined
      : resolveSiblingEvidence(ctx.siblings.index, ctx.siblings.projectRoot, ctx.file, unit);
  for (const rubric of SEED_RUBRICS) {
    if (!rubricApplies(rubric, unit.kind)) continue;
    ctx.acc.rubricsApplied.add(rubric.id);
    try {
      const finding = await critiqueOne({
        file: ctx.file,
        source: ctx.source,
        unit,
        rubric,
        provider: ctx.provider,
        ...(evidence === undefined
          ? {}
          : { siblings: evidence.siblings, siblingClass: evidence.siblingClass }),
      });
      if (finding !== null) ctx.acc.findings.push(finding);
    } catch {
      /* swallow per-(unit, rubric) errors */
    }
  }
}
```

The lookup is **once per unit, not per rubric** — 7 rubrics apply to a function and the resolver
is pure, so hoisting it out of the loop is the difference between 7,880 and ~55,000 lookups per
full-corpus run. The conditional spread keeps the two fields ABSENT rather than
present-and-`undefined`, matching how `CloneClass.sharedImport` is published and keeping
`buildPrompt`'s `siblings !== undefined` check meaningful. 4. `critiqueFile` takes `(file, maxUnitsPerFile, provider, acc, siblings)` (5 params, at the bar not
over it) and builds the `CritiqueFileContext` once per file. 5. In `runCodeCraft`, after `provider` is resolved and before the file loop:
`const siblingCtx = await resolveSiblingContext(projectRoot, input);` — one call per run, outside
every loop. 6. In `collectCodeCraftPrompts`, resolve the same context once and **extract the inner
prompt-queueing loop into a helper** so the function gets shorter rather than longer (it is
already ~82 lines):

```ts
interface QueueContext {
  file: string;
  source: string;
  siblings: SiblingContext | undefined;
  records: CodeRunMeta['prompts'];
  pending: CollectPromptsOutput['pendingPrompts'];
  rubricsApplied: Set<string>;
}

/** Queue every applicable rubric's prompt for one unit. Returns the new pending count. */
function queuePromptsForUnit(ctx: QueueContext, unit: CodeUnit): number {
  const evidence =
    ctx.siblings === undefined
      ? undefined
      : resolveSiblingEvidence(ctx.siblings.index, ctx.siblings.projectRoot, ctx.file, unit);
  for (const rubric of SEED_RUBRICS) {
    if (!rubricApplies(rubric, unit.kind)) continue;
    ctx.rubricsApplied.add(rubric.id);
    const promptId = `p${ctx.records.length + 1}`;
    const userPrompt = buildPrompt({
      file: ctx.file,
      source: ctx.source,
      unit,
      rubric,
      ...(evidence === undefined
        ? {}
        : { siblings: evidence.siblings, siblingClass: evidence.siblingClass }),
    });
    ctx.records.push({ promptId, file: ctx.file, unit, rubricId: rubric.id });
    ctx.pending.push({ promptId, systemPrompt: CRITIQUE_SYSTEM_PROMPT, userPrompt });
  }
  return ctx.pending.length;
}
```

The labelled `break outer` becomes a `if (queuePromptsForUnit(...) > budget) break outer;` at the
unit loop. **Budget semantics must not move:** today the budget is checked after EACH prompt and
breaks mid-unit, so a run can stop partway through a unit's rubrics. Checking per unit instead
lets `pending` exceed `budget` by at most (rubrics-for-kind - 1) = 6 before the break. That is a
behaviour change in a `budget-exceeded` projection count. **Keep it identical instead:** have
`queuePromptsForUnit` take `budget` and `return` early once `ctx.pending.length > budget`, and
assert the existing budget test still reports the same `projection.promptCount`. 7. `critiqueCodeInFile` gains `opts.cloneIndex?: CloneIndex` and `opts.projectRoot?: string` and does
**not** auto-build: a single-file cross-cutting entry should not pay 2.1-2.9 s uninvited, and its
callers already hold a project root. Documented as such. 8. Create `packages/cli/tests/code-craft/siblings-integration.test.ts`, each case over a
`mkdtempSync` project with three planted >= 40-token copies under `packages/p/src/`:

- **end-to-end: the CODE-R004 prompt carries the siblings** — `collectCodeCraftPrompts({ path:
tmp, __testProvider: new InSessionLlmProvider(…) })`, find the `pendingPrompts` entry whose
  record has `rubricId === 'CODE-R004'` and `file` ending `a.ts`, assert its `userPrompt` contains
  `packages/p/src/b.ts:` and `packages/p/src/c.ts:`. _Mutation: `input.siblings === false` default
  — absent. **This is the feature's load-bearing end-to-end assertion** and it needs no schema
  change because `pendingPrompts[].userPrompt` is already the real rendered prompt._
- **the other six rubrics' prompts for the SAME unit are byte-identical** to the same unit's
  prompts from a `siblings: false` run. _Mutation: drop the rubric gate — 6 prompts differ.
  **Reachable because** the planted unit genuinely has siblings, so the gate is the only thing
  keeping those 6 prompts unchanged._
- **a unit with no siblings** — a 4th file holding a different >= 40-token function; its prompts
  are byte-identical to the `siblings: false` run. _Mutation: attach the nearest class instead of
  `undefined` — differs._
- **`siblings: false` builds no index** — spy on `discoverSourceFiles` (or inject
  `__testCloneIndex` and assert it is preferred) and assert zero calls. _Mutation: drop the
  `=== false` guard — one call._
- **one index per run (the NFR target)** — inject `__testCloneIndex` and spy that
  `buildCodeCraftCloneIndex` is never called; separately, assert via a counting `byMember` proxy
  `Map` that `get` is called at most once per unit, not once per (unit, rubric). _Mutation: move
  the `resolveSiblingEvidence` call inside the rubric loop — the per-unit `get` count rises from 1
  to 7. **Reachable because** the fixture unit has >= 2 applicable rubrics; assert the applicable
  rubric count is > 1 in the test so a kind filter change cannot make this vacuous._
- **`Err` from the index degrades, not fails** — `buildCloneIndex` is driven to `Err` via an
  invalid `ignorePatterns`-shaped injection, or `__testCloneIndex` is omitted on a project whose
  discovery is empty; assert `runCodeCraft` resolves with findings and `summary.counts` intact.
  _Mutation: `throw` instead of returning `undefined` — the run rejects._
- **budget semantics unchanged** — the existing `promptBudget` case's `projection.promptCount` is
  identical before and after the Task-7 refactor. Capture the number from the pre-change suite and
  assert it as a literal.

9. Verify: `cd packages/cli && npx vitest run tests/code-craft >/tmp/p5-t7.log 2>&1; echo $?` —
   expect 0. Then the whole cli suite: `cd packages/cli && npx vitest run >/tmp/p5-t7-all.log 2>&1;
echo $?` — expect 0 and **no regression** from 750 files / 8,886 passed + 2 skipped (new files and
   tests from this plan are the only deltas; record the new totals).
10. `pnpm --filter @harness-engineering/cli run build >/tmp/p5-t7-build.log 2>&1; echo $?` — expect 0.
11. Revert telemetry churn. Commit: `feat(code-craft): build the clone index once per run and attach siblings per unit`

---

### Task 8: the extractor-agreement test (criterion 5)

**Depends on:** Task 1 | **Files:** `packages/cli/tests/code-craft/extractor-agreement.test.ts` (CREATE) |
**Owns:** `packages/cli/tests/code-craft/extractor-agreement.test.ts`

The integration's load-bearing assumption, as a test. `@typescript-eslint/typescript-estree` is a
direct runtime dependency of `packages/cli` (`package.json`), so the test can parse and call core's
own `extractUnits` rather than re-implementing either side.

1. Create the file with a shared fixture whose every construct is one of the measured or hypothesised
   divergence points — decorated class, decorated method, JSDoc'd function, `//`-commented function,
   object-literal arrow AND object-literal function expression (the 139-case), class-field arrow,
   static method, `export default function`, a one-line `const K = class Inner { m() {…} }`, and an
   `async` arrow const. This is the probe fixture that produced the Scope-D figures; it is known to
   yield 13 units from each extractor at identical lines.
2. Import both extractors under aliases and build both unit lists:

```ts
import { parse } from '@typescript-eslint/typescript-estree';
import { extractUnits as extractEstreeUnits } from '@harness-engineering/core';
import { extractUnits as extractTsUnits } from '../../src/code-craft/extract/units';
```

Note the fixture must NOT be filtered by `code-craft`'s substantive-unit bar for the agreement
claim to cover every construct, so size each fixture unit to >= 3 body statements. Assert
`tsUnits.length === 13` and `estreeUnits.length === 13` up front — **if either extractor drops a
construct the fixture meant to cover, this assertion fails rather than the agreement silently
holding over a smaller set.** That is the anti-vacuity guard for this whole test. 3. Assertions:

- **`startLine` agreement** — for every `code-craft` unit there is an estree unit with
  `|es.startLine - ts.line| <= 2`, and additionally assert the stronger measured fact: the count of
  EXACT matches is 13 of 13. The ±2 claim is criterion 5's; the exact count is what makes a 1-line
  drift from a parser upgrade go red instead of being absorbed.
- **`endLine` agreement** — same, exact 13 of 13.
- **decorators specifically** — assert the decorated class and the decorated method are each
  reported by BOTH extractors at their `@Dec()` line, by literal line number. _This is the point
  the spec named as the likely divergence; pinning it by number is what turns "measured fine" into
  "guarded"._
- **the kind divergence, pinned by name** — compute the set of `(line, tsKind, esKind)` triples
  where kinds differ; assert it is **exactly** the two object-literal-property units (`propArrow`,
  `propFn`), each `ts='method'` / `es='function'`. _Mutation: change `asFunctionLike`'s
  `ts.isPropertyAssignment(node.parent) ? 'method' : 'function'` to always `'function'` — the set
  empties and the assertion fails, which is correct: a change to either mapping must be a
  deliberate, visible one._
- **the matcher does not consult `kind`** — assert that building a `byMember`-shaped key from each
  estree unit and resolving the corresponding `code-craft` unit through `resolveSiblingEvidence`
  would match on all 13, i.e. no unit is lost to the kind divergence. (Construct a 3-member class
  per line so a hit is possible.)

4. **Mutations the test must fail against**, each planted, observed red, reverted:
   - `code-craft/extract/units.ts`: `node.getStart(sf)` -> `node.pos` (reintroduces leading-trivia
     inclusion) — JSDoc and comment cases shift and the exact-match count drops.
   - `code-craft/extract/units.ts`: `asFunctionLike`'s property-assignment arm -> always `'function'`
     — the pinned divergence set empties.
   - the fixture itself: delete the decorated method — the `length === 13` guard fails, proving the
     test is not vacuous over a shrinking fixture.
5. Verify: `cd packages/cli && npx vitest run tests/code-craft/extractor-agreement.test.ts >/tmp/p5-t8.log 2>&1; echo $?`
   — expect 0.
6. Revert telemetry churn. Commit: `test(code-craft): pin estree/typescript unit-extractor agreement and its one divergence`

---

### Task 9: changeset

**Depends on:** Task 7 | **Files:** `.changeset/duplication-code-craft-siblings.md` (CREATE) |
**Owns:** `.changeset/duplication-code-craft-siblings.md`

1. Create `.changeset/duplication-code-craft-siblings.md` with `'@harness-engineering/cli': minor`
   (core is untouched this phase). Content, in this repo's established changeset voice — what changed,
   what it costs, what it does NOT promise:
   - CODE-R004 could not answer its own Rule-of-Three clause; it now receives the sibling locations,
     the shared token count, and the `partial-extraction` signal with its `sharedImport` key.
   - Default ON. Cost: one clone index per `code-craft` run — **2.1-2.9 s measured over this
     repository's 2,066 discovered source files**. `siblings: false` on the programmatic input opts
     out. No CLI flag, no MCP schema change.
   - Incidence, with its denominator: **153 of 7,880** substantive units at that scope (1.94%) belong
     to a clone class, **16** of them to a `partial-extraction` class. The feature is quiet by design
     — that is the measured rate of whole-unit Type-2 clones among substantive units, not a wiring
     defect.
   - Scoped to CODE-R004. The other six seed rubrics' prompts are byte-identical, and so is every
     prompt for a unit with no siblings.
   - The `partial-extraction` wording holds Phase 4's corrected promise: the copies share a CALLED
     module, which is not the same as the wrapper already living there.
   - **What it does not do:** nothing surfaces sibling incidence in the run summary, so a failed index
     build is invisible to an operator (filed follow-up); `critiqueCodeInFile` does not auto-build an
     index.
2. Verify: `npm run format:check >/tmp/p5-t9-fmt.log 2>&1; echo $?` — expect 0.
3. Commit: `chore(changeset): code-craft sibling evidence for CODE-R004`

---

### Task 10: full gate pass `[checkpoint:human-verify]`

**Depends on:** Task 7, Task 8, Task 9 | **Files:** none (verification only) | **Owns:** none

Run every gate, capture every exit code without a pipe, and compare against the baselines in this
plan's § Measured baseline. Report figures with scope and denominator.

1. `pnpm --filter @harness-engineering/core run build >/tmp/p5-g-core.log 2>&1; echo $?` and
   `pnpm --filter @harness-engineering/cli run build >/tmp/p5-g-cli.log 2>&1; echo $?` — both 0.
   **Never turbo.**
2. `cd packages/core && npx vitest run >/tmp/p5-g-core-test.log 2>&1; echo $?` — expect 0 and exactly
   **507 files + 1 skipped / 5,990 passed + 1 skipped** (core is untouched; any delta is a real
   regression).
3. `cd packages/cli && npx vitest run >/tmp/p5-g-cli-test.log 2>&1; echo $?` — expect 0. Baseline
   750 files / 8,886 passed + 2 skipped; record the new totals and attribute every added file and
   test to a task in this plan. An unattributed delta is a finding, not a rounding error.
4. `cd packages/cli && npx tsc --noEmit >/tmp/p5-g-tsc.log 2>&1; echo $?` — expect 0.
5. `npm run format:check >/tmp/p5-g-fmt.log 2>&1; echo $?` — expect 0.
6. `node packages/cli/dist/bin/harness.js check-deps >/tmp/p5-g-deps.log 2>&1; echo $?` — expect 0,
   **2,665 modules / 10 layers** unchanged despite the new `code-craft` -> core edge.
7. `HARNESS_ARCH_BASE_REF=c83ec3620 node packages/cli/dist/bin/harness.js check-arch >/tmp/p5-g-arch.log
2>&1; echo $?` — expect **1**. Diff the SORTED issue list against the 13-issue baseline: the 12
   complexity findings byte-identical, and the `module-size` aggregate line present with a LARGER
   number (this phase adds ~2 source files). That is the same accepted finding. **No new finding, no
   `--update-baseline`, no allowance edit.**
8. `node packages/cli/dist/bin/harness.js ci check --skip "entropy,docs,perf,security,deps,phase-gate"
   > /tmp/p5-g-cicheck.log 2>&1; echo $?`— expect **0**, arch`warn`, and the SAME 3 warns
(`resolveDriftConfig`11,`walk`11 x2). **No new warn naming a`code-craft` function\*\* — this is
   > the real pre-commit bar and the only honest check that this plan's function sizing held.
9. `pnpm run generate-docs >/tmp/p5-g-docs.log 2>&1; echo $?` then `git status --short docs/reference`
   — expect **no diff** (criterion 8; no CLI or MCP schema change was made).
10. `node packages/cli/dist/bin/harness.js validate >/tmp/p5-g-validate.log 2>&1; echo $?` — expect
    **1** with **462 issues**. BASELINE COMPARISON ONLY. If the count moved, say by how much and why.
    Never report "validate passed".
11. `node scripts/generate-core-barrel.mjs --check >/tmp/p5-g-barrel.log 2>&1; echo $?` — expect 0
    (no new core export, so this is a no-change confirmation).
12. `git status --short` — expect only intended files. Revert
    `.harness/security/timeline.json` and `packages/cli/.harness/security/timeline.json`.
13. **CHECKPOINT — report to the human:** every exit code with its log path, every figure with scope
    and denominator, each baseline comparison, every planted mutation and the red it produced, and
    any figure in this plan that the executor's own measurement contradicts. State plainly whether
    CODE-R004 now receives sibling evidence end-to-end, citing the Task-7 prompt assertion.

---

## Dependency graph (dispatch order is derived topologically from this, exactly)

```
T1 (spec, checkpoint) ──┬─> T3 ──> T4 ──┬─> T7 ──> T9 ──┐
                        ├─> T5 ──> T6 ──┘               ├─> T10 (checkpoint)
                        └─> T8 ─────────────────────────┘
T2 ─────────────────────────> T6
```

- **T1, T2 have no dependencies** and may start together.
- **T3 -> T4** and **T2 -> T6** are file-overlap serialisations as well as logical ones.
- **T6 depends on BOTH T2 and T5**: it needs the frozen anchor and the renderer.
- **T7 depends on BOTH T4 and T6**: it needs the index builder and the wired `buildPrompt`.
- **T8 depends only on T1** (the restatement decides what it asserts) and is otherwise independent of
  the whole implementation chain — it can run in parallel with T3-T7.
- **T10 depends on T7, T8 and T9.** Nothing else may run concurrently with T10.

---

## Open questions and uncertainties

- **[RESOLVED by measurement]** Whether the extractors diverge on line numbers. They do not: 0 of
  7,880 at Scope D, decorators included. The spec's named risk is refuted in the dimension it named
  and confirmed in one it did not (`kind`, 139/7,880).
- **[RESOLVED by measurement]** Whether the spec's ±2 tolerance is useful. It produces 0 true and 2
  false candidates at Scope D. Retained only because the span co-check makes it inert-but-ready;
  without the co-check it would be a pure false-positive generator.
- **[DECISION, checkpointed in Task 1]** Rubric scoping (criterion 4) and the `kind` half of
  criterion 5. Both contradict a literal reading of the spec and both are recorded rather than
  silently implemented.
- **[DECISION, recorded]** Default-ON with a programmatic-only opt-out. The alternative (inject-only)
  ships a field nobody sets.
- **[ASSUMPTION]** `DEFAULT_DUPLICATION_CONFIG` (`minInstances: 3`, `minTokens: 40`) is the right
  config for `code-craft`'s index; `harness.config.json`'s `analyze.duplication` block is NOT read.
  If an adopter tunes the detector, `code-craft` will not follow. Traces to no criterion, so it is an
  assumption rather than a task. If wrong, the fix is one option object in
  `buildCodeCraftCloneIndex`.
- **[ASSUMPTION]** The 2.1-2.9 s index build is acceptable in every `code-craft` entry point that
  gets it. `critiqueCodeInFile` is explicitly excluded (no auto-build) for exactly this reason; the
  MCP `code_craft` tool and the CLI command both inherit it.
- **[DEFERRABLE]** Exact prompt wording of the evidence block. Pinned by Task 5's assertions; the
  `CALLS INTO` / `confirm what it exports` phrases are the two that are load-bearing (Phase 4's I1)
  and should not be softened without re-reading that record.
- **[DEFERRABLE, filed in Task 1]** Surfacing sibling incidence in `CodeCraftSummary`. Today a failed
  index build is invisible to an operator.
- **[DEFERRABLE]** Whether `simplest-it-could-be` or the naming rubrics want the evidence. One line
  plus a test when someone can trace it to a clause.

---

## Success criteria for this plan's execution

- CODE-R004's prompt provably carries sibling locations end-to-end, asserted on the real
  `pendingPrompts[].userPrompt` string, for a planted 3-copy fixture.
- Every prompt for a unit with no siblings, and every non-CODE-R004 prompt for a unit WITH siblings,
  is byte-identical to a literal anchor captured before any src change.
- Criterion 5's agreement test asserts 13/13 exact line agreement AND pins the one kind divergence by
  name, with the fixture-size guard that makes it non-vacuous.
- Every task's named mutation was planted, observed red, and reverted — recorded per task. Seven
  vacuous tests have shipped in this feature; "the test passes" is not evidence.
- Every published figure carries its scope and denominator, and Scope D is named as a fourth scope.
- `check-deps` 2,665 / 10 unchanged; `check-arch` sorted issue list unchanged but for the accepted
  `module-size` aggregate number; the pre-commit gate exits 0 with no new `code-craft` warn;
  `generate-docs` leaves no diff; `harness validate` compared to 462 / exit 1 and never reported as
  passing.
- No hook bypassed, no baseline updated, no allowance extended, no telemetry churn committed.
