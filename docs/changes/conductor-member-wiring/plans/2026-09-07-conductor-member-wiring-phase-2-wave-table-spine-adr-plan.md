# Plan: Conductor member wiring — Phase 2 (collapsed 2-4): wave table, spine reconciliation, ADR 0125

**Date:** 2026-09-07 | **Spec:** `docs/changes/conductor-member-wiring/proposal.md` | **Session:** `changes--conductor-member-wiring--proposal` | **Tasks:** 14 | **Time:** ~50 min | **Integration Tier:** medium | **Rigor:** standard

**Branch:** `spec/conductor-member-wiring` @ `6a89963b4` (base for this phase)
**Predecessor:** Phase 1 — Manifests, landed as `355eb0674` (+ `6a89963b4` doc regen). `depends_on` is already 13; the four claim-lease flags are already declared. **Phase 1 is not re-planned here.**

---

## Goal

Make `fleet-command`'s body agree with its own manifest: seven waves with an exclusive perf wave, a deferral stop phrased against the first non-admitting wave rather than the lander's index, both `fleet-family.md` rosters naming all 13 members, and the exclusivity recorded as ADR 0125.

---

## Scope note — why three spec phases are one plan

The spec lists Phase 2 (wave table / exclusivity / deferral rule), Phase 3 (spine reconciliation) and Phase 4 (ADR 0125) separately. **Human decision: collapse them into one cycle.** All three are documentation edits to one feature, they share one regeneration step and one commit, and splitting them would produce three commits whose middle two are individually unreviewable (a wave table that is not yet reflected in the spine roster; an ADR describing a rule the body does not yet state). All verification is retained — nothing is dropped by the collapse, only recombined.

---

## Observable Truths (Acceptance Criteria)

Each maps to a spec success criterion and to the task(s) that deliver it.

| #       | Truth (EARS where behavioural)                                                                                                                                                                                                                                                                                                            | Spec criterion          | Task(s)       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------- |
| **T1**  | The system shall enumerate seven waves in `fleet-command/SKILL.md`, with `perf-fleet` alone at wave 5 (marked exclusive), `docs-fleet` among the wave-2 sweeps, and `pr-fleet` at wave 6.                                                                                                                                                 | 1 (doc precondition), 5 | 3             |
| **T2**  | `grep -c "lander's wave" agents/skills/claude-code/fleet-command/SKILL.md` shall return **0**, and `grep -c "lander's wave" .../fleet-command/skill.yaml` shall return **0**. The same grep returns **7** and **1** respectively on the unedited tree.                                                                                    | **5**                   | 1, 5, 6, 7, 9 |
| **T3**  | `grep -c "first non-admitting wave" .../SKILL.md` shall return **>= 7**; on the unedited tree it returns 0.                                                                                                                                                                                                                               | **5**                   | 5, 7, 9       |
| **T4**  | No prose in `fleet-command/SKILL.md` shall assert wave 5 is terminal: `grep -n "5 — terminal" .../SKILL.md` returns nothing, and every surviving `wave 5` mention is in the exclusive-perf sense.                                                                                                                                         | **5**                   | 3, 8, 9       |
| **T5**  | While a reader is at the wave table, the system shall state (a) why wave 5 is exclusive in terms of silent-vs-exposable corruption, and (b) that an exclusive wave is not a valid deferral target.                                                                                                                                        | 5 (D1, D2)              | 4             |
| **T6**  | The worked example at `:351` shall reason about the deferral stop against the first non-admitting wave, and shall carry no stale terminal index.                                                                                                                                                                                          | **5** (final clause)    | 7, 8          |
| **T7**  | Both `fleet-family.md` rosters — the `:13` sentence and the `:224-235` member table — shall name all 13 members, and the set shall equal `fleet-command`'s `depends_on` exactly (verified by a sorted set-difference, not by eye).                                                                                                        | **7**                   | 10            |
| **T8**  | `docs/knowledge/decisions/0125-*.md` shall exist with `status: proposed`, a **non-empty `## Decision` section**, a **quoted `source:`**, and the required Context / Decision / Consequences sections.                                                                                                                                     | Phase 4 verifiable      | 11, 12        |
| **T9**  | If `perf-fleet` or `docs-fleet` is unscheduled or shed, then the body's existing empty-wave and shed-with-depth rules shall cover it unchanged — no new text contradicts "a wave with no scheduled members is skipped, not renumbered and not a barrier," and the exclusive wave is demonstrated empty-and-skipped in the worked example. | 4, 9 (doc precondition) | 8, 9          |
| **T10** | `pnpm generate:plugin:check` shall exit 0 and `git status --porcelain` shall be empty across **all five** artifact directories, including `.antigravity-extension/`.                                                                                                                                                                      | 8 (regression)          | 13, 14        |
| **T11** | The commit shall touch only the files in the File Map — no CLI, package, barrel, roadmap or baseline file.                                                                                                                                                                                                                                | scope                   | 14            |

**Deliberately verified as documentation preconditions, not executed here.** Criteria 1, 2, 3, 4 and 9 assert things about a **run plan printed by an agent-executed `/harness:fleet-command --report-only`**. That path cannot be exercised from the CLI: `harness skill run fleet-command --report-only` only prints SKILL.md with a context preamble and never executes SELECT (spec, criterion 1's parenthetical). The conductor derives its waves by _reading the text this plan edits_, so this phase verifies that **the text now says the right thing** (T1, T4, T9) and leaves the executed confirmation to spec **Phase 5**. Criteria **5 and 7 are verified fully and mechanically here.**

---

## Uncertainties

- **[RESOLVED — spec undercount, 1 of 2] The spec names four deferral-stop statements; there are five.** `SKILL.md:240` also states the rule against the lander's wave — _"lanes shed because a serialization deferral would have crossed the terminal lander's wave"_ — inside the REPORT phase's shed-reason list. It is not at `:197`, `:271`, `:294` or `:314`. Criterion 5 says **no remaining statement** of the deferral stop may be phrased against the lander's wave alone, so `:240` is in scope by the criterion's own words even though the spec's enumeration missed it. **Included as a fifth site in Task 5.** Evidence: `grep -n "lander's wave" agents/skills/claude-code/fleet-command/SKILL.md` → 7 hits (`197, 240, 271, 294, 314, 383, 490`), vs the spec's 4 + 2 example sites = 6.
- **[RESOLVED — spec undercount, 2 of 2] The rule is also stated in the manifest, which the spec does not mention at all.** `agents/skills/claude-code/fleet-command/skill.yaml:63` — the `dispatch` phase description — contains _"shedding rather than deferring any lane whose deferral would reach the terminal lander's wave."_ This is the **source of truth** for the phase description embedded in all five generated artifacts (`.claude-plugin/commands/fleet-command.md:26`, `.cursor-plugin/…:20`, `.gemini-extension/…:15` and `:621`, `.antigravity-extension/…:15` and `:621`). Left unedited, the shipped plugin artifacts would state the superseded rule while SKILL.md states the new one. **Included as Task 6.**
- **[ASSUMPTION — recommended default, fork A below] Worked-example scope.** The example transcript at `:351` opens `Installed members: 10 of 11`, which is stale at 13 members. The plan's default is the **zero-cascade** fix: `10 of 13 (cleanup-fleet, perf-fleet and docs-fleet not installed)`. This keeps every downstream number in the transcript exactly as-is — 9 schedulable, cap 8, 1 shed, 7 lanes, 5h20m — because two uninstalled members contribute nothing to any of them, **and** it makes wave 5 empty-and-skipped, which demonstrates criterion 4's rule live in the example at no cost. The alternative (adding `perf-fleet` and `docs-fleet` as real transcript lanes) cascades through the probe list, the cap arithmetic, the DAG, the dispatch log, the VERIFY block, the report table and the budget line.
- **[ASSUMPTION — recommended default, fork B below] `ADR 0091:102` is not edited.** ADR 0091 (`status: accepted`, 2026-08-08) states the deferral bound against the terminal lander's wave. ADRs are historical records of a decision as taken; rewriting an accepted one erases the amendment rather than recording it. **Default: leave 0091's body untouched; ADR 0125 states the amendment explicitly and names 0091.** (Note this is an _amendment_, not a supersession — 0091's other four pillars stand — so `supersedes:` is deliberately **not** set on 0125.)
- **[ASSUMPTION — recommended default, fork C below] ADR 0125 is written as a plain file, not via `manage_adr`.** `manage_adr` has two open write defects (#1849): it drops the `decision` field and it writes `source:` unquoted, so a trailing `#NNNN` ref is eaten as a YAML comment. It truncated ADR 0124's frontmatter yesterday. A direct heredoc write avoids **both** defects by construction rather than detecting them after the fact; Task 12 re-reads and verifies regardless, so the safety net is kept either way. `docs/knowledge/decisions/README.md` specifies file creation directly ("Create a file named `NNNN-<slug>.md`"); no tooling path is mandated.
- **[DEFERRABLE] The knowledge-graph `decision` node for ADR 0125.** ADRs in `docs/knowledge/decisions/` are ingested automatically by the knowledge pipeline (`packages/graph/src/ingest/DecisionIngestor.ts`); no manual enrichment task is needed. The spec's Knowledge Impact ("silently-corruptible evidence" as a concept, with its two relationships) is carried by the ADR's own prose.
- **[DEFERRABLE] Exact wording of the rationale paragraph and the five rewordings.** Full drafts are given inline below so execution needs no invention; a reviewer may tighten prose without affecting any check, provided the literal phrase `first non-admitting wave` survives (T3 greps for it) and `lander's wave` does not reappear (T2).

---

## Knowledge baseline

`harness knowledge-pipeline --domain` is **not run** for this phase. The domain knowledge at issue — the contention map's four collision classes and the family's wave semantics — is already documented as `decision` nodes (ADR 0091 and siblings) and as `docs/reference/fleet-family.md`, both read directly during scoping and cited above with line numbers. The one new concept this phase introduces is materialized _by_ Task 11 (ADR 0125), which the pipeline ingests on its next pass. Running detect-mode first would report a gap that this plan's own output closes.

---

## NFR Targets

**None elicited — all four dimensions skipped, deliberately.** This phase produces zero executable code: four Markdown/YAML files plus deterministically regenerated artifacts. There is no hot path to benchmark (performance), no module handling untrusted input or secrets (security), no target load or concurrency (scalability), and no failure mode to degrade gracefully from (resilience). Emitting an NFR task here would wire a `harness perf bench` or `check-security` gate to a change that cannot move either needle. Per the skill's own rule, a skipped dimension emits no task; the plan is identical to one produced without NFR elicitation.

_(Fork D below offers the human the chance to overturn this.)_

---

## Skills

`docs/changes/conductor-member-wiring/SKILLS.md` was generated against the spec's TypeScript-flavoured keywords and recommends `ts-performance-patterns`, `gof-*` and `ts-*` design skills at 0.42-0.54 relevance. **None is applicable** — this phase writes no TypeScript. No task carries a skill annotation. Recorded rather than silently dropped, since the advisor's output is part of the spec's artifact set.

---

## File Map

Every file this phase creates or modifies. Nothing outside this list may appear in the commit (T11).

**Source of truth (hand-edited):**

- MODIFY `agents/skills/claude-code/fleet-command/SKILL.md` — roster count `:5`, Provides roster `:29`, wave table `:96-101`, new rationale paragraph after `:109`, five deferral-stop rewordings (`:197`, `:240`, `:271`, `:294`, `:314`), worked-example rework (`:357`, `:371`, `:383-384`, `:405`, `:430`, `:434`, `:468`, `:487`, `:490`)
- MODIFY `agents/skills/claude-code/fleet-command/skill.yaml` — `dispatch` phase description `:63`
- MODIFY `docs/reference/fleet-family.md` — roster sentence `:13`, member table `:224-235` (one new row)
- CREATE `docs/knowledge/decisions/0125-silently-corruptible-evidence-scheduling-constraint.md`

**Generated (regenerated, never hand-edited) — all five targets:**

- MODIFY `.claude-plugin/commands/fleet-command.md`
- MODIFY `.cursor-plugin/commands/fleet-command.md`
- MODIFY `.gemini-extension/commands/fleet-command.toml`
- MODIFY `.codex-plugin/` fleet-command artifact
- MODIFY `.antigravity-extension/commands/fleet-command.toml` ← **not staged by `pre-commit:145`; stage by hand (#1968)**

**Not modified, deliberately:** `docs/knowledge/decisions/0091-*.md` (fork B); the `cursor`/`codex`/`gemini-cli` skill trees (symlinks to `claude-code`, so the SKILL.md edit propagates for free); any `packages/**` file; `docs/roadmap.d/**`; `.harness/**` baselines.

---

## Gates deliberately NOT run, with reasons

Recorded here so a reviewer can see they were considered rather than forgotten.

| Gate                           | Status                                                                                                                                                                                                            | Why not gated                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness validate`             | **RED on origin/main** — confirmed this session: design-token drift, `packages/cli/tests/align/codemods/t001-hex.test.ts` "Hardcoded color #ff0000 is not in the design token palette" and siblings (651 issues). | Unrelated to Markdown/YAML. Gating would block a green change on a pre-existing red.                                                                                                                                                                                                                                                                                                                                                                    |
| `harness check-deps`           | **RED on origin/main** — confirmed this session: 1 cycle, `packages/core/src/solutions/scan-candidates/read-commits.ts -> git-scan.ts`.                                                                           | Same. No import graph is touched.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm run generate-docs`       | **Not run.**                                                                                                                                                                                                      | It reads `packages/cli/dist/`, not source, and **a stale dist silently deletes documentation for real flags** — this already produced a critical review finding earlier in this feature. Nothing this phase edits feeds it: `docs/reference/fleet-family.md` is hand-maintained (no generator references it in `scripts/` or `package.json`), and no CLI command changes. If `pre-push` later runs `generate-docs --check`, run `pnpm build` **first**. |
| `pnpm changeset`               | Not required.                                                                                                                                                                                                     | `check-changesets.mjs:62` scopes to `packages/*/src` and `package.json`; neither is touched.                                                                                                                                                                                                                                                                                                                                                            |
| `harness scan` / graph refresh | Not run.                                                                                                                                                                                                          | Nothing under `packages/` changes, so a scan produces only comprehension-shard churn.                                                                                                                                                                                                                                                                                                                                                                   |
| Repo tests (`vitest`)          | Not run.                                                                                                                                                                                                          | No test asserts the fleet roster, the wave table, or `fleet-family.md` content — verified by grepping `packages/*/tests` and `packages/*/src` for `fleet-command`; the only hits are the unrelated spend-budget and handoff-record modules.                                                                                                                                                                                                             |

**Tooling note used throughout:** `harness` on PATH is the published global install (12.3.0) and predates recent fixes. Where repo behaviour matters, invoke `node packages/cli/dist/bin/harness.js`. `dist` is currently fresher than `src` (built Sep 7 17:22; last `packages/cli/src` commit 2026-09-06), so no rebuild is needed except where a task says so.

---

## Skeleton

Supplied and approved upstream by the human as the task brief (items A1-A6, B, C), which enumerates every edit site and its kind. Reproduced here for the record; not re-presented for approval.

1. Baseline — prove the criterion-5 check discriminates (~1 task, ~2 min)
2. SKILL.md roster + wave table (~2 tasks, ~7 min)
3. SKILL.md exclusivity rationale (~1 task, ~4 min)
4. Deferral-stop rewordings, body + manifest (~2 tasks, ~8 min)
5. Worked-example rework (~2 tasks, ~8 min)
6. Sweep + criterion-5 proof (~1 task, ~3 min)
7. Spine reconciliation (~1 task, ~4 min)
8. ADR 0125 write + verify (~2 tasks, ~8 min)
9. Regenerate artifacts, verify, commit (~2 tasks, ~7 min)

**Estimated total:** 14 tasks, ~51 minutes. Deviations from the brief: two extra edit sites (`SKILL.md:240`, `skill.yaml:63`) folded into groups 4, both justified under _Uncertainties_.

---

## Tasks

### Task 1: Prove the criterion-5 check discriminates on the unedited tree

**Depends on:** none | **Files:** none (read-only) | **Owns:** none | **Category:** verification

A check that has never been observed failing is not a check. Run it **before** any edit and record the failing output.

1. Run, from the repo root:

   ```bash
   cd /Users/cwarner/Projects/iv/harness-engineering
   echo "--- C5a: lander's-wave statements in SKILL.md (expect 7, MUST become 0) ---"
   grep -n "lander's wave" agents/skills/claude-code/fleet-command/SKILL.md
   echo "--- C5b: lander's-wave in the manifest (expect 1, MUST become 0) ---"
   grep -n "lander's wave" agents/skills/claude-code/fleet-command/skill.yaml
   echo "--- C5c: replacement phrase (expect 0, MUST become >= 7) ---"
   grep -c "first non-admitting wave" agents/skills/claude-code/fleet-command/SKILL.md
   echo "--- C5d: terminal-wave table row (expect 1 hit, MUST become 0) ---"
   grep -n "5 — terminal" agents/skills/claude-code/fleet-command/SKILL.md
   ```

2. **Observe the failure.** Expected output on the unedited tree:
   - C5a: **7 lines** — `197, 240, 271, 294, 314, 383, 490`
   - C5b: **1 line** — `63`
   - C5c: **`0`**
   - C5d: **1 line** — `101`

3. If C5a returns anything other than 7 lines at those exact line numbers, **stop and re-scope** — the file has drifted from the plan's evidence and the per-site edits below will not apply cleanly.
4. Record the output verbatim in the session handoff as the pre-edit baseline. **No commit.**

---

### Task 2: SKILL.md — roster count and Provides roster

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md` | **Owns:** `agents/skills/claude-code/fleet-command/**`

1. At `:5`, replace the opening words of the paragraph:
   - FIND: `Eleven \`-fleet\` skills exist, and each is a competent orchestrator`
   - REPLACE: `Thirteen \`-fleet\` skills exist, and each is a competent orchestrator`

2. At `:29` (the **Provides (Provider)** bullet), extend the member list:
   - FIND: `` `adr-fleet`, `ideate-fleet`, `craft-fleet` — each emitting the shared handoff shape ``
   - REPLACE: `` `adr-fleet`, `ideate-fleet`, `craft-fleet`, `perf-fleet`, `docs-fleet` — each emitting the shared handoff shape ``

3. Verify: `grep -c '`perf-fleet`' agents/skills/claude-code/fleet-command/SKILL.md` returns **>= 1**, and `grep -n "Eleven \`-fleet\`" …/SKILL.md` returns nothing.
4. No commit yet (this phase commits once, at Task 14).

---

### Task 3: SKILL.md — rewrite the wave table to seven waves

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md` | **Owns:** `agents/skills/claude-code/fleet-command/**`

Replace the six data rows at `:96-101` with seven. Two rows change and one is new; the other four are byte-identical and are restated only so the replacement block is unambiguous. Column widths need not be aligned by hand — Task 13 runs Prettier, which realigns the table.

1. In the table under step 3 (_Derive the wave assignment from the fixed dependency shape_), edit as follows:
   - **Wave 2 row** — append `docs-fleet` to the fleet list and extend the rationale:
     - FIND (fleets cell): `` `issue-fleet`; `test-fleet`, `cleanup-fleet`, `bug-fleet`, `security-fleet`, `craft-fleet` ``
     - REPLACE: `` `issue-fleet`; `test-fleet`, `cleanup-fleet`, `bug-fleet`, `security-fleet`, `craft-fleet`, `docs-fleet` ``
     - FIND (end of that row's rationale cell): `subject to the global governor, to deconfliction, and to the output-coupling note below.`
     - REPLACE: `subject to the global governor, to deconfliction, and to the output-coupling note below. `` `docs-fleet` `` joins as an ordinary sweep — it reads standing code, takes no input from the spine, and its evidence is load-insensitive.`

   - **Wave 5 row** — replace the existing terminal row with the new exclusive perf row, then add the terminal row beneath it:
     - FIND the whole line at `:101`:

       ```
       | 5 — terminal        | `pr-fleet`                                                                                 | Lands what every other lane produced, so it must run last or it lands a stale subset.                                                                                                                                                        |
       ```

     - REPLACE with **two** lines:

       ```
       | 5 — perf (**exclusive**) | `perf-fleet` | Its verdicts are **measurements**, and a measurement taken under co-scheduled load is silently wrong rather than visibly broken. Runs alone — see below. |
       | 6 — terminal | `pr-fleet` | Lands what every other lane produced, so it must run last or it lands a stale subset. |
       ```

2. Verify: `grep -n "5 — terminal" …/SKILL.md` returns **nothing** (C5d now passes); `grep -n "6 — terminal" …/SKILL.md` returns exactly **1** line; `grep -c '`docs-fleet`' …/SKILL.md` returns **>= 2** (Provides roster from Task 2, plus this row).
3. No commit yet.

---

### Task 4: SKILL.md — add the exclusivity and deferral-target rationale paragraph

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md` | **Owns:** `agents/skills/claude-code/fleet-command/**`

**Placement:** immediately after the paragraph at `:109` (_"The sweeps are input-independent of the spine and output-coupled to it…"_), i.e. as the last paragraph of numbered step 3. This puts the four per-wave notes in ascending wave order — barrier semantics, wave 0, wave 2 sweeps, wave 5 perf — and keeps the new normative text adjacent to the table it explains, in the voice of the wave-0 trust-gate note.

1. Insert, indented three spaces to match the surrounding numbered-list body:

   ```markdown
   **Wave 5 is exclusive, and an exclusive wave is not a valid deferral target.** `perf-fleet`'s verdicts are **measurements**, and that makes its evidence fail differently from every other member's. A contended **test** fails **loudly** — the flake is visible, a rerun exposes it, and the family already treats "prove the failure is outside your diff, then rerun once" as routine. A contended **benchmark succeeds with a plausible wrong number**: nothing in the artifact distinguishes a clean 40ms from a contended 40ms, so the lane gates a fix on corrupted evidence and reports it as verified. That corruption is **silent rather than exposable**, and no downstream verification recovers from it, because there is nothing to recover — the artifact is well-formed and wrong. This is why wave 5 admits `perf-fleet` and nothing else. Load-sensitive evidence is not new here (`.husky/pre-push` already caps parallel test load for the same reason, and a throughput cap is the right instrument when the corruption announces itself); what is new is corruption that cannot be seen. **The exclusivity has a second consequence: wave 5 is not a place a deferral may land.** The serialization deferral stop below is therefore bound to the **first non-admitting wave** — today wave 5 — and not to the lander's index. Moving the lander from wave 5 to wave 6 nominally opened a wave of headroom; it did not, because the wave it opened admits one named member by construction. A lane whose deferral would reach wave 5 is **shed with its reason**, exactly as before the renumber.
   ```

2. Verify: `grep -c "first non-admitting wave" …/SKILL.md` returns **>= 1** (C5c has begun moving); `grep -c "silent rather than exposable" …/SKILL.md` returns **1**.
3. No commit yet.

---

### Task 5: SKILL.md — reword all five deferral-stop statements

**Depends on:** Task 4 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md` | **Owns:** `agents/skills/claude-code/fleet-command/**`

**This is the task most likely to be under-done.** All five statements are phrased **index-free** — a sweep for the string "wave 5" matches none of them. The spec enumerates four; `:240` is a fifth of the same class (see _Uncertainties_). Apply all five.

1. **`:197` — the normative statement.**
   - FIND: `and that push is bounded: **a deferral that would place a lane at or past the terminal lander's wave sheds that lane instead, with its reason**. Nothing is ever scheduled after the lane that lands, because a lane that runs after the lander emits work the lander cannot see — which is the stale-subset failure that put the lander last in the first place.`
   - REPLACE: `and that push is bounded: **a deferral that would place a lane at or past the first non-admitting wave (today wave 5, the exclusive perf wave) sheds that lane instead, with its reason**. The stop is stated against the first wave that will not admit the lane rather than against the lander's index, because two different walls stand in front of a deferred lane and the nearer one binds: an **exclusive** wave admits one named member and nothing else, and nothing at all is scheduled after the lane that lands — a lane that runs after the lander emits work the lander cannot see, which is the stale-subset failure that put the lander last in the first place.`

2. **`:240` — the REPORT phase's shed-reason list** (the site the spec's enumeration missed).
   - FIND: `lanes shed because a serialization deferral would have crossed the terminal lander's wave,`
   - REPLACE: `lanes shed because a serialization deferral would have reached the first non-admitting wave,`

3. **`:271` — the degradation note.**
   - FIND: `A serialization deferral that would cross the terminal lander's wave sheds its lane with a reason rather than scheduling past the lander.`
   - REPLACE: `A serialization deferral that would reach the first non-admitting wave (today wave 5, the exclusive perf wave) sheds its lane with a reason rather than scheduling it into a wave that will not admit it.`

4. **`:294` — the Gate.**
   - FIND: `- **Never defer a lane at or past the terminal lander's wave.** Shed it with its reason instead — a lane scheduled after the lander emits work the lander cannot see.`
   - REPLACE: `- **Never defer a lane at or past the first non-admitting wave (today wave 5, the exclusive perf wave).** Shed it with its reason instead — an exclusive wave admits one named member and nothing else, and a lane scheduled after the lander emits work the lander cannot see.`

5. **`:314` — the Escalation.**
   - FIND: `- **A serialization deferral would push a lane at or past the terminal lander's wave:** shed the lane with its reason. Do not schedule it after the lander and do not drop the serialization to keep it.`
   - REPLACE: `- **A serialization deferral would push a lane at or past the first non-admitting wave (today wave 5, the exclusive perf wave):** shed the lane with its reason. Do not park it in the exclusive wave, do not schedule it after the lander, and do not drop the serialization to keep it.`

6. Verify — `grep -n "lander's wave" agents/skills/claude-code/fleet-command/SKILL.md` now returns exactly **2** lines (`383` and `490`, the worked example, handled in Task 7). Every one of the five prose statements is gone.
7. No commit yet.

---

### Task 6: skill.yaml — reword the `dispatch` phase description

**Depends on:** Task 5 | **Files:** `agents/skills/claude-code/fleet-command/skill.yaml` | **Owns:** `agents/skills/claude-code/fleet-command/**`

The manifest states the deferral rule too, and it is the **source** of the phase description embedded in all five generated artifacts. Skipping it ships plugin artifacts that contradict SKILL.md.

1. In `agents/skills/claude-code/fleet-command/skill.yaml`, inside the `dispatch` phase's `description:` (line 63):
   - FIND: `and shedding rather than deferring any lane whose deferral would reach the terminal lander's wave,`
   - REPLACE: `and shedding rather than deferring any lane whose deferral would reach the first non-admitting wave (today wave 5, the exclusive perf wave),`

2. **Guard the YAML.** The description is a long unquoted plain scalar. The replacement adds parentheses and a comma but **no colon-space, no leading `#`, and no leading `- `**, so it stays a valid plain scalar. Confirm rather than assume:

   ```bash
   node -e "const y=require('yaml'),f=require('fs');const d=y.parse(f.readFileSync('agents/skills/claude-code/fleet-command/skill.yaml','utf8'));const p=d.phases.find(x=>x.name==='dispatch');console.log(p.description.includes('first non-admitting wave')?'OK plain scalar intact':'FAIL')"
   ```

   Expect `OK plain scalar intact`. (The top-level key is `phases`, and the description parses as a plain scalar today — both confirmed against the unedited tree during planning, so a `FAIL` here means the edit broke the YAML, not that the check is wrong.)

3. Verify: `grep -c "lander's wave" agents/skills/claude-code/fleet-command/skill.yaml` returns **0** (C5b passes).
4. No commit yet.

---

### Task 7: Worked example — the two deferral-reasoning sites

**Depends on:** Task 6 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md` | **Owns:** `agents/skills/claude-code/fleet-command/**`

These are **reasoning**, not renumbers: the example must justify the deferral against the first non-admitting wave. Both sit inside fenced code blocks, so Prettier will not reflow them — keep the line widths close to their neighbours (~80 cols).

1. **`:383-384` — the contention map.**
   - FIND:

     ```
                               module -> SERIALIZED (craft-fleet deferred wave 2 -> 3;
                               wave 3 is before the lander's wave 5, so it is a
                               deferral, not a shed)
     ```

   - REPLACE:

     ```
                               module -> SERIALIZED (craft-fleet deferred wave 2 -> 3;
                               wave 3 is before the first non-admitting wave (5), so
                               it is a deferral, not a shed)
     ```

2. **`:490` — the assumptions-made note.**
   - FIND: `      security-fleet; the deferral stays clear of the lander's wave 5.`
   - REPLACE: `      security-fleet; the deferral stays clear of the first non-admitting wave (5).`

3. Verify: `grep -n "lander's wave" agents/skills/claude-code/fleet-command/SKILL.md` returns **nothing** — **C5a passes**, and criterion 5 is now met across the whole body.
4. No commit yet.

---

### Task 8: Worked example — the terminal-index renumbers

**Depends on:** Task 7 | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md` | **Owns:** `agents/skills/claude-code/fleet-command/**`

Mechanical index corrections inside the one example block at `:351`. The spec enumerates three (`:405`, `:430`, `:434`); the report table row and the DAG line are two more of the same class, and the roster count is stale. Six sites, all in the same fenced block. **The second example block at `:504` contains no wave-5 references and is not touched.**

1. **`:357` — roster count** (per the recommended default in fork A: zero cascade, and it makes wave 5 empty-and-skipped, demonstrating criterion 4 live).
   - FIND: `  Installed members: 10 of 11 (cleanup-fleet not installed — recorded, DAG degraded)`
   - REPLACE:

     ```
       Installed members: 10 of 13 (cleanup-fleet, perf-fleet and docs-fleet not
                         installed — recorded, DAG degraded)
     ```

   Every downstream number in the transcript — 9 schedulable, cap 8, 1 shed, 7 lanes, 5h20m — is unchanged, because two uninstalled members contribute to none of them.

2. **`:371` — the derived-wave summary.**
   - FIND: `    3  adr-fleet     4  (empty — roadmap-fleet unscheduled)     5  pr-fleet`
   - REPLACE:

     ```
         3  adr-fleet     4  (empty — roadmap-fleet unscheduled)
         5  (empty — perf-fleet not installed)     6  pr-fleet
     ```

3. **`:405` — the CONFIRM re-derivation.**
   - FIND: `       pr-fleet stays terminal at wave 5.`
   - REPLACE: `       pr-fleet stays terminal at wave 6.`

4. **`:430` — the dispatch log.**
   - FIND: `  wave 5  pr-fleet       batched gate round (wave 5); answered.`
   - REPLACE:

     ```
       wave 5  (empty — perf-fleet not installed; an empty wave is skipped, not a barrier)
       wave 6  pr-fleet       batched gate round (wave 6); answered.
     ```

5. **`:434` — the wall-clock boundary.**
   - FIND: `  before scheduling the next wave: 5h20m of 8h at the wave-5 boundary.`
   - REPLACE: `  before scheduling the next wave: 5h20m of 8h at the wave-6 boundary.`

6. **`:468` — the REPORT table row.** (Not caught by a `wave 5` grep — the cell is a bare `5`.)
   - FIND: `  | pr-fleet       | 5    | verified    | 3 reviewed PRs                   | 1     | —            |`
   - REPLACE: `  | pr-fleet       | 6    | verified    | 3 reviewed PRs                   | 1     | —            |`

7. **`:487` — the empty-wave assumption**, extended so it covers the now-empty wave 5.
   - FIND: `      holds only the deferred craft-fleet lane, and wave 4 is left empty and skipped`
   - REPLACE: `      holds only the deferred craft-fleet lane, and waves 4 and 5 are left empty and skipped`

8. Verify: `grep -n "wave 5\|wave-5\| 5 " …/SKILL.md` shows every surviving mention in the exclusive-perf or empty-wave sense — none asserting terminal.
9. No commit yet.

---

### Task 9: Sweep for residual wave-5-is-terminal prose and run the full criterion-5 check

**Depends on:** Task 8 | **Files:** none (read-only) | **Owns:** none | **Category:** verification

1. Re-run the **exact** check block from Task 1. Required results, each the inverse of the recorded baseline:
   - C5a `grep -n "lander's wave" …/SKILL.md` → **no output** (was 7 lines)
   - C5b `grep -n "lander's wave" …/skill.yaml` → **no output** (was 1 line)
   - C5c `grep -c "first non-admitting wave" …/SKILL.md` → **>= 7** (was 0)
   - C5d `grep -n "5 — terminal" …/SKILL.md` → **no output** (was 1 line)

2. Sweep for anything the phrase-greps cannot reach:

   ```bash
   grep -n -i "terminal at wave\|wave 5 is terminal\|last wave\|final wave" agents/skills/claude-code/fleet-command/SKILL.md
   grep -rn "lander's wave" agents/skills/claude-code/fleet-command/
   ```

   The first must show no claim that wave 5 is last; the second must return nothing at all.

3. Confirm the invariant survived the renumber: `grep -n "skipped, not renumbered and not a barrier" …/SKILL.md` still returns its line. The empty-wave rule is what makes criterion 4 hold when `perf-fleet` is shed, and it must not have been disturbed.
4. Confirm the shed rule still names depth: `grep -n "lowest probed queue depth first" …/SKILL.md` returns its lines (criterion 9's documentation precondition).
5. No commit yet.

---

### Task 10: `fleet-family.md` — reconcile both rosters

**Depends on:** Task 9 | **Files:** `docs/reference/fleet-family.md` | **Owns:** `docs/reference/fleet-family.md`

The page carries **two** rosters, and fixing only one leaves the same shape of disagreement this spec exists to close (D5).

1. **`:13` — the roster sentence.**
   - FIND: `` `cicd-fleet`, `test-fleet`, `security-fleet`, `cleanup-fleet`, `bug-fleet`, `craft-fleet`, and `perf-fleet` work quality queues alongside. ``
   - REPLACE: `` `cicd-fleet`, `test-fleet`, `security-fleet`, `cleanup-fleet`, `bug-fleet`, `craft-fleet`, `perf-fleet`, and `docs-fleet` work quality queues alongside. ``

2. **`:224-235` — the member table.** Append one row after the `perf-fleet` row (`:235`), sourced from `agents/skills/claude-code/docs-fleet/SKILL.md:3` and its `skill.yaml`. Column widths need not be aligned by hand; Prettier realigns in Task 13.

   ```
   | `docs-fleet`     | —      | doc-drift / undocumented backlog                | `harness-docs-pipeline --fix` (per-area, to convergence)                                                                                       | scoped doc-fix PRs                          |
   ```

3. **Verify the two rosters against `depends_on` by set-difference, not by eye** (criterion 7 requires exact set equality):

   ```bash
   cd /Users/cwarner/Projects/iv/harness-engineering
   # A: manifest depends_on
   node -e "const y=require('yaml'),f=require('fs');console.log(y.parse(f.readFileSync('agents/skills/claude-code/fleet-command/skill.yaml','utf8')).depends_on.slice().sort().join('\n'))" > /tmp/c5-depends.txt
   # B: member-table rows
   sed -n '/^## Members/,/^## The conductor tier/p' docs/reference/fleet-family.md \
     | grep -oE '^\| `[a-z-]+-fleet`' | tr -d '|` ' | sort > /tmp/c5-table.txt
   # C: roster sentence
   sed -n '13p' docs/reference/fleet-family.md | grep -oE '[a-z-]+-fleet' | sort -u > /tmp/c5-sentence.txt

   wc -l /tmp/c5-depends.txt /tmp/c5-table.txt /tmp/c5-sentence.txt   # expect 13 13 13
   diff /tmp/c5-depends.txt /tmp/c5-table.txt    && echo "OK table == depends_on"
   diff /tmp/c5-depends.txt /tmp/c5-sentence.txt && echo "OK sentence == depends_on"
   ```

   Both `diff`s must be silent and both `echo`s must print. If a count is not 13, the roster is wrong — fix the roster, never the check.

   **This check was proven discriminating during planning:** run against the unedited tree it yields `13 12 12` and both `diff`s report `13d12 < docs-fleet`. It fails before the work and passes after.

4. No commit yet.

---

### Task 11: Write ADR 0125

**Depends on:** Task 10 | **Files:** `docs/knowledge/decisions/0125-silently-corruptible-evidence-scheduling-constraint.md` | **Owns:** `docs/knowledge/decisions/0125-*`

**Write the file directly — do NOT use `manage_adr`** (fork C: #1849 drops the `decision` field and writes `source:` unquoted, which truncated ADR 0124's frontmatter yesterday). `docs/knowledge/decisions/README.md` specifies direct file creation and mandates no tooling path.

1. Confirm the number is still free (a sibling session may have taken it):

   ```bash
   ls docs/knowledge/decisions/ | grep -E '^012[4-9]'   # expect only 0124-fleet-provenance-record.md
   ```

   If `0125` is taken, take the next free number and adjust the filename and `number:` field together.

2. Write `docs/knowledge/decisions/0125-silently-corruptible-evidence-scheduling-constraint.md` with exactly this content:

   ```markdown
   ---
   number: 0125
   title: 'Silently-corruptible evidence is a scheduling constraint — the exclusive wave'
   date: 2026-09-07
   status: proposed
   tier: large
   source: 'docs/changes/conductor-member-wiring/proposal.md'
   ---

   ## Context

   `fleet-command` schedules its members into waves derived from a fixed dependency shape, and deconflicts them before dispatch with a **contention map** over four collision classes — generated artifacts, allocated sequences, same-region source edits, and duplicate filings (ADR 0091). Every one of those four is a **shared write surface**. Each is detectable by looking at what the lanes write, and each resolves with an ordering, a serialization, or a dedup at report time.

   `perf-fleet` fits none of them. Its verification bar is a measured before/after, and its SELECT admits a target only with a measured budget violation recorded (`agents/skills/claude-code/perf-fleet/SKILL.md:7`). Its evidence is therefore a **measurement**, and a measurement is corrupted by machine load rather than by another lane's writes. Nothing in the contention map can see that, because nothing about it appears in a diff.

   **Load-sensitive evidence is not new in this repository.** `.husky/pre-push:84-85` already caps turbo at two packages at a time, for a stated reason:

   > Without this, filesystem/sqlite/HTTP-heavy tests flake under compound parallel load (Phase 2 raises this cap after test isolation).

   So the repository already spends throughput to protect evidence from load, and this ADR claims **no novelty for the observation**. What is new is the failure mode.

   ## Decision

   **Evidence whose corruption under load is _silent_ rather than _exposable_ is a first-class scheduling constraint, and the instrument that matches it is an exclusive wave — not a load cap.** `fleet-command` therefore schedules `perf-fleet` alone in wave 5, and **an exclusive wave is not a valid target for a serialization deferral**.

   The distinction that carries the decision is failure mode, not novelty:

   - A contended **test** fails **loudly**. The flake is visible in the run, a rerun exposes it, and the family already treats "prove the failure is outside your diff, then rerun once" as routine. The corruption announces itself, so a **throughput cap** that merely reduces its frequency is a sufficient instrument — which is exactly what pre-push uses.
   - A contended **benchmark succeeds with a plausible wrong number**. Nothing in the artifact distinguishes a clean 40ms from a contended 40ms. `perf-fleet` would gate a fix on corrupted evidence and report it as verified — the precise failure its Iron Law exists to prevent, arriving through the one door the Iron Law cannot watch. No downstream verification recovers from it, because there is nothing to recover: the artifact is well-formed and wrong.

   The pre-push cap's own parenthetical strengthens rather than weakens this. That cap is explicitly **temporary** — to be relaxed once test isolation lands. A throughput cap is the right instrument for corruption that is exposable and that better isolation will eventually stop producing. Measurement fidelity does not become safe with better isolation: a co-scheduled lane saturating the machine corrupts a benchmark no matter how cleanly the two lanes are isolated from each other. A **barrier**, not a cap, is the instrument that matches.

   Wave-separation is already this family's mechanism for "these must not run together" — the contention map's _allocated sequences_ class prescribes "Serialize the writers into different waves." This decision applies an established mechanism to a class the map does not yet name.

   ### Second consequence — an exclusive wave is not a valid deferral target

   The contention map's deferral rule pushes a serialized lane into a later wave, bounded by a stop. That stop was previously phrased against **the terminal lander's wave**. Moving the lander from wave 5 to wave 6 nominally opens a wave of headroom, but the wave it opens admits one named member by construction. The stop is therefore re-phrased against the **first non-admitting wave** — today wave 5 — so deferral behaviour is unchanged by the renumber.

   This **amends the deferral bound stated in ADR 0091** ("Deferrals are bounded: a deferral that would reach the terminal lander's wave sheds its lane with a reason instead"). ADR 0091's body is deliberately left as the historical record of the decision as taken; this is an amendment to one clause, not a supersession of the authority model, so `supersedes:` is not set.

   The rule as it now stands is index-free by design: it names a property of the wave (does this wave admit the lane?) rather than an index, so it survives the next renumber without another edit.

   ### Rejected — a measurement quiet-lock

   Schedule `perf-fleet` in wave 2 and let its measurement steps acquire a lock that pauses other lanes' fan-out. Rejected on two grounds that actually distinguish it from an exclusive wave: a lock held by a crashed lane **deadlocks the run**, where a wave barrier cannot; and nothing would record whether the quiet window was in fact quiet, where a wave assignment is **recorded in the run plan and visible at CONFIRM**.

   An earlier draft also objected that a lock adds cross-lane blocking to a "coordinator, never dictator" tier. That objection is **withdrawn**: the conductor already blocks lanes via wave barriers, serialization, and slot admission. An exclusive wave _is_ cross-lane blocking — coarser, and planned rather than dynamic.

   ### Rejected — CI-side measurement

   Measure on CI runners so local concurrency is irrelevant. Rejected because per-measurement round-trip latency is minutes, which makes a measure → remediate → re-measure loop impractical inside a lane. Whether shared CI runners have better or worse benchmark variance than a quiet workstation is **not established here and is recorded as an open question**, not used as a reason. Revisit if benchmark stability proves inadequate even when `perf-fleet` runs alone.

   ## Consequences

   **Positive.**

   - `perf-fleet`'s measurements are protected structurally rather than by luck, and the protection is visible in the run plan at CONFIRM rather than assumed.
   - The precedent generalizes with a stated admission test — _does contention here produce a plausible wrong answer, or an exposable failure?_ — so a future member with silently-corruptible evidence inherits an exclusive wave on a rule rather than on taste.
   - The deferral stop is now phrased against a property rather than an index, so it survives future renumbers without editing.

   **Negative.**

   - A run that schedules `perf-fleet` is **one wave longer**, and that lane holds the full slot pool alone. This is the throughput the decision spends on fidelity, and it is accepted.
   - Shed ordering is **cost-blind**. `perf-fleet` is now the most expensive lane in a run — it holds a wave of its own — and depth-ordered shedding cannot see that: a shallow-but-cheap sweep and a shallow-but-wave-exclusive one are ordered identically today. Recorded as a follow-up, not solved here.

   **Neutral.**

   - `perf-fleet` remains **sheddable**. The trust gate and the terminal lander are never shed because dropping them costs the run its evidence base or its reviewable terminal state; neither applies here. A shed `perf-fleet` empties wave 5, and the existing rule already covers that — a wave with no scheduled members is skipped, not renumbered and not a barrier.
   - The exclusivity is **dispatch-time-enforced and recorded as an assumption**, not a verified check. No artifact records which lanes were in fan-out during a wave, exactly as none records a lane's peak concurrency. The run report states wave 5 as exclusive and names `perf-fleet` as the only lane scheduled there; that is a claim about the plan, not a measurement of occupancy.

   **Open.**

   - Whether `perf-fleet` running alone on a developer workstation is quiet enough for stable benchmarks. This decision removes conductor-induced contention; it does not make the machine idle.
   - Whether shared CI runners have better or worse benchmark variance than a quiet workstation. Unmeasured, and deliberately not used as a reason to reject CI-side measurement.
   ```

3. No commit yet.

---

### Task 12: Re-read ADR 0125 and verify both `manage_adr` defect classes are absent

**Depends on:** Task 11 | **Files:** none (read-only) | **Owns:** none | **Category:** verification
**`[checkpoint:human-verify]`**

Even though Task 11 avoided `manage_adr`, verify the written bytes rather than trusting the write — #1849 truncated ADR 0124's frontmatter and was noticed only on re-read, and a Prettier pass may yet touch the file.

1. Machine-check the frontmatter and required sections:

   ```bash
   cd /Users/cwarner/Projects/iv/harness-engineering
   F=docs/knowledge/decisions/0125-silently-corruptible-evidence-scheduling-constraint.md
   node -e "
   const f=require('fs'),y=require('yaml');
   const src=f.readFileSync(process.argv[1],'utf8');
   const m=src.match(/^---\n([\s\S]*?)\n---\n/); if(!m){console.log('FAIL no frontmatter');process.exit(1);}
   const fm=y.parse(m[1]);
   const need=['number','title','date','status','tier','source'];
   for(const k of need) if(fm[k]===undefined||fm[k]==='') {console.log('FAIL missing/empty:',k);process.exit(1);}
   if(fm.number!==125) {console.log('FAIL number is',fm.number);process.exit(1);}
   if(fm.status!=='proposed'){console.log('FAIL status is',fm.status);process.exit(1);}
   if(!/^\s*source:\s*['\"]/m.test(m[1])){console.log('FAIL source: is not quoted');process.exit(1);}
   for(const s of ['## Context','## Decision','## Consequences']){
     if(!src.includes(s)){console.log('FAIL missing section',s);process.exit(1);}
   }
   const dec=src.split('## Decision')[1].split('## Consequences')[0].trim();
   if(dec.length<400){console.log('FAIL Decision section is',dec.length,'chars — suspect #1849 drop');process.exit(1);}
   console.log('OK frontmatter complete, source quoted, Decision section',dec.length,'chars');
   " "$F"
   ```

   Expect `OK frontmatter complete, source quoted, Decision section <N> chars` with N well above 400.

2. **Explicitly re-check the two known #1849 defects by eye**, since a machine check can be satisfied by degenerate content:

   ```bash
   sed -n '1,10p' "$F"                        # frontmatter intact, source quoted, nothing truncated
   sed -n '/^## Decision/,/^### Rejected/p' "$F" | head -20   # the decision text is really there
   ```

3. Confirm the ADR is discoverable and does not collide: `ls docs/knowledge/decisions/ | grep 0125` returns exactly one file.
4. **PAUSE — present to the human:** the ADR's `## Decision` section and the new rationale paragraph from Task 4, side by side. These are the two pieces of new normative prose in this phase; everything else is a renumber or a roster edit. Ask whether the wording stands. **Wait for confirmation before Task 13.**
5. No commit yet.

---

### Task 13: Format, rebuild core, and regenerate all five plugin artifacts

**Depends on:** Task 12 | **Files:** `.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.codex-plugin/`, `.antigravity-extension/` | **Owns:** `.{claude-plugin,cursor-plugin,gemini-extension,codex-plugin,antigravity-extension}/**`

**Order is load-bearing.** Prettier must run **before** generation, not after: `pre-commit`'s own comment records that lint-staged reformats SKILL.md and thereby desynchronizes artifacts generated from the unformatted source. Formatting first and generating second produces artifacts that are already correct, so the hook's regenerate-and-restage dance never fires.

1. **Format the hand-edited sources first** (this realigns the Markdown tables edited in Tasks 3 and 10):

   ```bash
   cd /Users/cwarner/Projects/iv/harness-engineering
   npx prettier --write \
     agents/skills/claude-code/fleet-command/SKILL.md \
     agents/skills/claude-code/fleet-command/skill.yaml \
     docs/reference/fleet-family.md \
     docs/knowledge/decisions/0125-silently-corruptible-evidence-scheduling-constraint.md
   ```

2. **Re-run the criterion-5 check after formatting.** Prettier reflows Markdown and can move a phrase across a line boundary; a grep that passed pre-format is not evidence it passes post-format.

   ```bash
   grep -rn "lander's wave" agents/skills/claude-code/fleet-command/   # expect NO output
   grep -c "first non-admitting wave" agents/skills/claude-code/fleet-command/SKILL.md   # expect >= 7
   ```

3. **Build core before generating.** Recorded Phase 1 learning: without it, `generate:plugin:*` dies with the misleading `does not provide an export named diagnoseTrackerSyncConfig`.

   ```bash
   pnpm turbo build --filter=@harness-engineering/core
   ```

4. **Regenerate all five targets and stage the fifth by hand** (`pre-commit:145` stages only four while `:144` regenerates five — #1968):

   ```bash
   pnpm generate:plugin:all
   git add .claude-plugin .cursor-plugin .gemini-extension .codex-plugin .antigravity-extension
   ```

5. Verify no drift remains: `pnpm generate:plugin:check` exits **0**.
6. Verify the manifest reword propagated into the generated artifacts:

   ```bash
   grep -rc "first non-admitting wave" .claude-plugin/commands/fleet-command.md .gemini-extension/commands/fleet-command.toml .antigravity-extension/commands/fleet-command.toml
   grep -rn "lander's wave" .claude-plugin .cursor-plugin .gemini-extension .codex-plugin .antigravity-extension   # expect NO output
   ```

7. No commit yet.

---

### Task 14: Full verification pass and one commit

**Depends on:** Task 13 | **Files:** all of the File Map | **Owns:** none | **Category:** verification
**`[checkpoint:human-verify]`**

1. **Scope check — nothing outside the File Map.**

   ```bash
   cd /Users/cwarner/Projects/iv/harness-engineering
   git status --porcelain
   ```

   Every changed path must be one of: `agents/skills/claude-code/fleet-command/{SKILL.md,skill.yaml}`, `docs/reference/fleet-family.md`, `docs/knowledge/decisions/0125-*.md`, or a file under the five artifact directories. The seven untracked `docs/ideation/*.md` files pre-existed this session and are **left alone, not staged**. `docs/changes/conductor-member-wiring/plans/` is committed separately by the planning phase and is not part of this commit.

2. **Run the whole acceptance battery in one block:**

   ```bash
   echo "== T2/T3/T4 criterion 5 =="
   grep -rn "lander's wave" agents/skills/claude-code/fleet-command/ || echo "PASS: no lander's-wave statements"
   grep -c "first non-admitting wave" agents/skills/claude-code/fleet-command/SKILL.md
   grep -n "5 — terminal" agents/skills/claude-code/fleet-command/SKILL.md || echo "PASS: no wave-5-terminal row"
   grep -n "6 — terminal" agents/skills/claude-code/fleet-command/SKILL.md

   echo "== T1 wave table shape =="
   grep -n "perf (\*\*exclusive\*\*)" agents/skills/claude-code/fleet-command/SKILL.md
   grep -n "docs-fleet" agents/skills/claude-code/fleet-command/SKILL.md

   echo "== T9 invariants survived =="
   grep -c "skipped, not renumbered and not a barrier" agents/skills/claude-code/fleet-command/SKILL.md
   grep -c "lowest probed queue depth first" agents/skills/claude-code/fleet-command/SKILL.md

   echo "== T7 criterion 7 (set equality, re-run post-format) =="
   # re-run the three-way diff from Task 10 step 3

   echo "== T8 ADR =="
   # re-run the node frontmatter check from Task 12 step 1

   echo "== T10 criterion 8 regression =="
   pnpm generate:plugin:check && echo "PASS: no artifact drift"
   ```

   Every line must pass. **A failing check is fixed in the source, never by relaxing the check.**

3. **PAUSE — present to the human:** the acceptance battery output, the `git status --porcelain` file list, and a one-line summary of each of the four hand-edited files. **Wait for approval.**

4. **Commit once.** All three collapsed spec phases land as a single coherent commit; splitting produces individually-unreviewable intermediate states (see _Scope note_).

   ```bash
   git add agents/skills/claude-code/fleet-command/SKILL.md \
           agents/skills/claude-code/fleet-command/skill.yaml \
           docs/reference/fleet-family.md \
           docs/knowledge/decisions/0125-silently-corruptible-evidence-scheduling-constraint.md \
           .claude-plugin .cursor-plugin .gemini-extension .codex-plugin .antigravity-extension
   git commit -m "feat(fleet-command): seven waves with an exclusive perf wave, first-non-admitting-wave deferral stop, spine roster reconciliation, ADR 0125"
   ```

5. **Re-verify after the commit.** The pre-commit hook runs `prettier --write` on staged Markdown and applies modifications; a truth verified pre-commit is not necessarily true post-commit (recorded Phase 1 learning).

   ```bash
   git status --porcelain                  # expect empty
   pnpm generate:plugin:check              # expect exit 0
   grep -rn "lander's wave" agents/skills/claude-code/fleet-command/   # expect NO output
   ```

   If the hook reformatted a file, `git add` and `git commit --amend --no-edit`, then re-run all three.

---

## Follow-ups recorded, not taken here

- **Spec undercount.** The proposal's Edit 2 enumerates four deferral-stop statements and five worked-example sites; the tree has five and eight respectively, plus one in `skill.yaml`. Worth a one-line correction to the spec so the next reader is not misled.
- **`#1968`** — `.husky/pre-commit:145` stages four of the five directories `:144` regenerates. Worked around by hand for the second phase running; the spec already flags it for separate filing.
- **`#1969`** — the generated `argument-hint` renders `[----lease-seconds <--lease-seconds>]`. Pre-existing generator defect; criterion 6 passes on malformed output and must not be read as evidence the hint is correct.
- **`#1849`** — `manage_adr` drops `decision` and writes `source:` unquoted. Sidestepped here by writing the ADR directly; the defect is unfixed.
- **ADR 0091's deferral clause** now carries an amendment recorded only in ADR 0125. If the project later adopts an amendment-back-reference convention, 0091 should gain a pointer.
- **Spec Phase 5** — the executed `/harness:fleet-command --report-only` confirmation of criteria 1, 2, 3, 4 and 9 remains outstanding, and needs one run with `perf-fleet` scheduled and one without.
