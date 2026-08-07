# Plan: Enforcing Deploy Gate — Phase 3 (Skill Upgrade + ADR)

**Date:** 2026-08-07 | **Spec:** `docs/changes/enforcing-deploy-gate/proposal.md` (Implementation Order → Phase 3) | **Tasks:** 6 | **Time:** ~27 min | **Integration Tier:** large

## Goal

Upgrade the `harness-deployment` skill from a Tier-3 `advisory-guide` to a Tier-2 `meticulous-verifier` enforcing gate: flip `cognitive_mode`/`tier`, add an `enforce` phase and the `harness check-deployment` CLI entry and an `on_pre_merge` trigger in `skill.yaml`; add a leading ENFORCE phase, the block-vs-advise contract, and the rollback seam (D5) to `SKILL.md`; refresh the domain-specific `## Rationalizations to Reject` for the enforcing posture; and write an ADR capturing D2 (exit-code contract incl. loud abstention) and D5 (rollback wiring as path-verification). Retain the advisory DETECT/ANALYZE/DESIGN/VALIDATE prose (D7). `harness skill validate harness-deployment` exits `0`.

## Scope Guards (do NOT do in this plan)

- **Depends on Phases 1 and 2.** The `harness check-deployment` command must exist before the skill cites it as the mechanical gate. Do not describe a command that is not shipped.
- **No engine or command changes.** This plan edits only skill files and docs (`skill.yaml`, `SKILL.md`, the ADR, and regenerated plugin/agent artifacts).
- **Retain the advisory prose (D7).** Do NOT delete the DETECT/ANALYZE/DESIGN/VALIDATE phases; the enforcement content is added around them.
- **Shipped-body rule.** `SKILL.md`, `skill.yaml`, and any generated skill/plugin body must contain NO internal roadmap/PR/issue numbers (no `#712`, etc.). The ADR under `docs/knowledge/decisions/` MAY reference `#712`.
- **No Half (B) content.** No incident/monitoring/ops-signal language in the skill; the skill covers the pre/post-ship deploy gate only.

## Observable Truths (Acceptance Criteria)

Traces to spec Success Criteria (SC) 9 (and reinforces the D2/D5 contracts).

1. **SC9 (metadata).** `skill.yaml` reports `cognitive_mode: meticulous-verifier` and `tier: 2`, declares an `enforce` phase, lists the `harness check-deployment` CLI entry, and adds an `on_pre_merge` trigger.
2. **SC9 (structure).** `SKILL.md` contains a leading **ENFORCE** phase describing the gate, its four-value exit-code contract, and the block-vs-advise table; `## Gates` states the mechanical contract; the rollback seam (D5) is wired; a domain-specific `## Rationalizations to Reject` reflects the enforcing posture.
3. **SC9 (validator).** `harness skill validate harness-deployment` exits `0` (all required sections present: `## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Rationalizations to Reject`, plus rigid `## Gates` and `## Escalation`).
4. **ADR.** A new ADR at `docs/knowledge/decisions/0086-<slug>.md` records D2 and D5 with the repo's frontmatter/format; it is referenced from the spec's Integration Points.
5. **No internal identifiers** appear in the shipped skill body or generated plugin/agent files; generated artifacts (`generate:plugin:check`, `generate:barrels:check`) are in sync.

## Grounding (evidence: file:line)

- **Skill files** — `agents/skills/claude-code/harness-deployment/skill.yaml` (current: `cognitive_mode: advisory-guide` `:5`, `tier: 3` `:6`, `triggers: [manual, on_new_feature]` `:30-32`, `phases: detect/analyze/design/validate` `:64-76`, `cli.command: harness skill run harness-deployment` `:46-57`, `type: rigid` `:63`). `SKILL.md` currently has DETECT/ANALYZE/DESIGN/VALIDATE (`:16-165`), a `## Gates` section naming the rules in prose (`:243-248`), `## Rationalizations to Reject` with a Universal + Domain-Specific table (`:284-303`), `## Escalation` (`:304-310`).
- **Enforcing-skill model** — `agents/skills/claude-code/enforce-architecture/SKILL.md`: opening lede frames a hard gate ("this is a hard gate, not a suggestion", `:3`); `## Gates` "These are hard stops… not warnings — they are errors" (`:230-237`); domain-specific Rationalizations table (`:287-291`). `skill.yaml`: `cognitive_mode: meticulous-verifier` (`:5`), `tier: 2` (`:34`), `triggers: [manual, on_pr, on_commit]` (`:6-9`), `cli.command: harness skill run enforce-architecture` (`:19-27`).
- **Required-sections validator (parity)** — `packages/core/src/skills/required-sections.ts:11-24`: rigid skills must contain `BEHAVIORAL_REQUIRED_SECTIONS` (incl. `## Rationalizations to Reject`) plus `RIGID_SECTIONS` (`## Gates`, `## Escalation`). This is the single source both the `harness skill validate` CLI and the `agents/skills` vitest structure test import — the "parity validator" referenced by the spec.
- **Validator command** — `packages/cli/src/commands/skill/validate.ts:180-186`: `new Command('validate').argument('[skill-name]')`; invoked as `harness skill validate harness-deployment`; exits `ExitCode.SUCCESS` when clean, `ExitCode.ERROR` on not-found/invalid.
- **Rollback seam (D5)** — `agents/skills/claude-code/harness-rollback/SKILL.md:1-20`: post-ship circuit breaker, propose-only, "NOT for deployment/infrastructure rollback — this operates at the git/PR layer" (`:11`). The complementarity to document: check-deployment = pre-ship readiness (can we roll back?); harness-rollback = post-ship execution (open the revert PR when a signal/eval fires). Config seam both read: `rollback` block (`packages/cli/src/config/schema.ts:631`, `:1018`).
- **ADR convention** — `docs/knowledge/decisions/`; latest is `0085-responsive-gate-vetoes-award-bar.md`, so **next number is 0086**. Frontmatter format from `docs/knowledge/decisions/0010-roadmap-tracker-kind-schema-decoupling.md:1-8`: `number`, `title`, `date`, `status`, `tier`, `source`; body sections `## Context`, `## Decision`, `## Consequences` (Positive/Negative/Neutral), `## Related`.
- **Exit-code contract to record (D2)** — `packages/cli/src/utils/errors.ts:4-20` (`SUCCESS=0`/`VALIDATION_FAILED=1`/`ERROR=2`/`ZERO_DENOMINATOR=3`; the "abstained, not passed, must never read as green" doctrine at `:11-18`).
- **Generated artifacts** — skill metadata is embedded in generated plugin/agent bundles; regenerate + check via `pnpm generate:plugin:check` (`package.json:43`) and `pnpm generate:barrels:check` (`:35`). Agent definitions: `pnpm generate-docs` / the `generate-agent-definitions` command if skill tier/mode surfaces there.

## File Map

- MODIFY `agents/skills/claude-code/harness-deployment/skill.yaml` — cognitive_mode, tier, enforce phase, CLI entry, on_pre_merge trigger.
- MODIFY `agents/skills/claude-code/harness-deployment/SKILL.md` — ENFORCE phase, block-vs-advise contract, `## Gates` rewrite, rollback seam, Rationalizations refresh.
- CREATE `docs/knowledge/decisions/0086-enforcing-deploy-gate-exit-contract-and-rollback-seam.md` — ADR for D2 + D5.
- MODIFY (regenerated) plugin/agent bundles via `pnpm generate:plugin` if skill metadata is embedded there.
- MODIFY `docs/changes/enforcing-deploy-gate/proposal.md` — add the ADR path to Integration Points → Architectural Decisions (single-line reference).

## Skeleton

1. `skill.yaml` metadata flip + enforce phase + CLI entry + trigger (~1 task, ~5 min)
2. `SKILL.md` ENFORCE phase + block/advise contract + `## Gates` rewrite + rollback seam (~1 task, ~7 min)
3. `SKILL.md` Rationalizations refresh (enforcing posture) (~1 task, ~4 min)
4. ADR 0086 (D2 + D5) + spec Integration-Points reference (~1 task, ~5 min)
5. Regenerate plugin/agent artifacts + parity/skill-validate (~1 task, ~4 min)
6. Human-verify checkpoint (~1 task, ~2 min)

**Estimated total:** 6 tasks, ~27 minutes. _Skeleton approved: pending._

## Uncertainties

- [ASSUMPTION] `skill.yaml` `phases:` entries are free-form `{ name, description, required }` (verified `harness-deployment/skill.yaml:64-76`); adding an `enforce` phase with `required: true` before `detect` is accepted by the loader. If the loader enforces a fixed phase enum, Task 1 keeps the four existing phases and adds `enforce` as the first entry, verifying via `harness skill validate`.
- [ASSUMPTION] `on_pre_merge` is a recognized trigger token. enforce-architecture uses `on_pr`/`on_commit`; the spec explicitly names `on_pre_merge`. Task 1 verifies with `git grep -n "on_pre_merge\|on_pr" agents/skills` and uses the canonical token if `on_pre_merge` is not recognized (falling back to `on_pr`, noting the deviation).
- [ASSUMPTION] The next ADR number is 0086 (latest committed is 0085). If a concurrent branch also claims 0086, renumber to the next free integer at write time.
- [DEFERRABLE] Whether skill tier/mode changes require regenerating agent-definition docs in addition to the plugin bundle. Task 5 runs the `:check` variants first and only regenerates what reports drift.

---

## Tasks

### Task 1: Flip `skill.yaml` to the enforcing posture

**Depends on:** Phase 2 (command exists) | **Files:** `agents/skills/claude-code/harness-deployment/skill.yaml`

1. First: `git grep -n "on_pre_merge\|on_pr\b" agents/skills` to confirm the canonical pre-merge trigger token (per Uncertainties).
2. Edit `agents/skills/claude-code/harness-deployment/skill.yaml`:
   - `cognitive_mode: advisory-guide` → `cognitive_mode: meticulous-verifier` (`:5`).
   - `tier: 3` → `tier: 2` (`:6`).
   - `triggers:` add `on_pre_merge` (or the confirmed token) alongside `manual`, `on_new_feature` (`:30-32`).
   - Under `cli:`, add the enforcing command entry. Keep the existing advisory `harness skill run harness-deployment`, and add the gate command so the skill invokes it rather than reimplementing detection (D1):
     ```yaml
     cli:
       command: harness skill run harness-deployment
       enforce_command: harness check-deployment
       args:
         - name: path
           description: Project root path
           required: false
     ```
     > If the schema does not allow `enforce_command`, instead document the command in `SKILL.md`'s Harness Integration (Task 2) and leave `cli.command` as-is — verify which the loader accepts via `harness skill validate`.
   - `phases:` add a leading `enforce` phase before `detect` (`:64`):
     ```yaml
       - name: enforce
         description: Run harness check-deployment; block on hard violations, advise on gaps, abstain loudly with no config
         required: true
     ```
   - Bump `version: "1.0.0"` → `version: "2.0.0"` (major: cognitive-mode/tier change is a behavioral break).
   - Do NOT add any internal issue/PR number.
3. Run: `harness skill validate harness-deployment` — expect exit `0`.
4. Run: `harness validate`
5. Commit: `feat(skill): harness-deployment → meticulous-verifier tier 2 with enforce phase`

### Task 2: Add the ENFORCE phase, block-vs-advise contract, and rollback seam to `SKILL.md`

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/harness-deployment/SKILL.md`

1. Update the lede (`SKILL.md:3`) to frame the mechanical gate while keeping the advisory framing (model on enforce-architecture `:3`), e.g. add a sentence: "Deployment readiness is a hard gate: `harness check-deployment` blocks a deploy on unambiguous, incident-causing violations, advises on maturity gaps, and abstains loudly when a repo does not deploy."
2. Insert a new **`### Phase 0: ENFORCE — Run the deployment gate`** (or "Phase 1: ENFORCE" renumbering the prose phases below to keep DETECT/ANALYZE/DESIGN/VALIDATE as advisory context per D7) immediately after `## Process` (`:14`), containing:
   - Invoke `harness check-deployment` (`--json` for machine output). The skill invokes the command; it never reimplements the mechanical check (D1 — this is a Red-Flag pattern).
   - The **four-value exit-code contract** (D2): `0` config detected, no hard violations (or explicitly disabled); `1` ≥1 hard violation → blocked; `2` internal/misconfig; `3` no deployment config detected → abstained loudly ("examined nothing — abstained, not passed, never green").
   - The **block-vs-advise table** (copy from the spec Technical Design): HARD = `DEPLOY-SEC001` (non-waivable), `DEPLOY-RB001`, `DEPLOY-ENV001`; SOFT/advisory = `DEPLOY-STAGE001`, `DEPLOY-ENV002`, `DEPLOY-HC001`, `DEPLOY-PERF001`. Note the `deployment.rules` override downgrades a waivable hard rule to advisory but never `DEPLOY-SEC001` (D4).
   - A one-line pointer: when the gate blocks, use the DETECT/ANALYZE/DESIGN prose below to fix the finding.
3. Rewrite `## Gates` (`:243-248`) to state the **mechanical** contract instead of prose "flag as blocking": each hard rule maps to a non-zero exit; the gate is the authority, and the skill does not hand-wave past a `1`. Keep it a rigid `## Gates` section (required by the validator).
4. Wire the **rollback seam (D5)** in `## Harness Integration` (`:169-174`): add a bullet describing the pre/post-ship pair — `harness check-deployment` verifies a rollback *path exists* (pre-ship readiness), satisfied by a `rollback` config block, a revert/rollback workflow or `deploy/rollback` script, or a documented runbook; `harness-rollback` executes post-ship (opens the revert PR when a signal/eval fires, propose-only). On a `DEPLOY-RB001` block, point the human at `harness-rollback`.
5. Ensure NO internal roadmap/PR/issue numbers appear anywhere added.
6. Run: `harness skill validate harness-deployment` — expect exit `0` (all required sections still present).
7. Run: `harness validate`
8. Commit: `docs(skill): add ENFORCE phase, exit-code contract, and rollback seam to harness-deployment`

### Task 3: Refresh the domain-specific `## Rationalizations to Reject`

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/harness-deployment/SKILL.md`

1. In `## Rationalizations to Reject` → Domain-Specific (`SKILL.md:296-303`), keep the Universal block and rewrite/extend the Domain-Specific table for the enforcing posture (model on enforce-architecture `:287-291`). Add rows such as:
   | Rationalization | Reality |
   | --- | --- |
   | "The secret is only in a workflow file, not application code" | A leaked credential in a pipeline is a live secret. `DEPLOY-SEC001` is non-waivable — rotate it and remove the literal; `deployment.rules` cannot downgrade it. |
   | "We'll add a rollback path before we actually deploy" | The gate verifies the rollback path exists now. "Later" means an incident finds you with no revert route. Wire `rollback` config, a rollback workflow/script, or a runbook before this merges. |
   | "This repo only has one environment, the promotion gate does not apply" | Then downgrade `DEPLOY-ENV001` explicitly via `deployment.rules` with a comment — do not disable the whole gate. An unconfigured direct-to-prod path is exactly what `DEPLOY-ENV001` exists to catch. |
   | "The gate abstained, so we're clear to ship" | Abstention (exit 3) means the gate examined nothing — it is not a pass. Either the repo genuinely does not deploy, or detection missed the config; confirm which before treating it as green. |
   | "Just set `enabled: false` to get the pipeline green" | Disabling the gate is an explicit opt-out that shows in config review, not a fix. If a hard rule is wrong for this repo, downgrade that one rule; do not blind the gate. |
2. Keep wording free of internal identifiers.
3. Run: `harness skill validate harness-deployment` — expect exit `0`.
4. Run: `harness validate`
5. Commit: `docs(skill): enforcing-posture rationalizations for harness-deployment`

### Task 4: Write ADR 0086 (D2 exit-code contract + D5 rollback seam)

**Depends on:** none (may run in parallel with Tasks 1-3) | **Files:** `docs/knowledge/decisions/0086-enforcing-deploy-gate-exit-contract-and-rollback-seam.md`, `docs/changes/enforcing-deploy-gate/proposal.md`

1. First: `ls docs/knowledge/decisions | sort | tail -3` to confirm 0086 is free (renumber if a concurrent branch claimed it).
2. Create `docs/knowledge/decisions/0086-enforcing-deploy-gate-exit-contract-and-rollback-seam.md` using the repo frontmatter (model on `0010-...md:1-8`):
   ```md
   ---
   number: 0086
   title: Enforcing deploy gate — four-value exit-code contract and rollback path-verification seam
   date: 2026-08-07
   status: accepted
   tier: large
   source: docs/changes/enforcing-deploy-gate/proposal.md
   ---
   ```
   - `## Context` — the harness stops enforcing at ship; `harness-deployment` named hard rules in prose with no exit-code authority. Two durable cross-skill contracts must be pinned before the gate ships: how it reports outcomes, and how it connects to `harness-rollback`. (This section MAY reference issue `#712`.)
   - `## Decision` — **D2:** reuse the existing `ExitCode` enum with four values: `0 SUCCESS` (config detected, no hard violations, or explicitly disabled), `1 VALIDATION_FAILED` (≥1 hard violation), `2 ERROR` (internal/misconfig), `3 ZERO_DENOMINATOR` (no deployment config → abstained loudly — examined nothing, not a pass, never green). Quote the `ZERO_DENOMINATOR` doctrine from `packages/cli/src/utils/errors.ts`. The core `deriveExitCode` returns the numeric literal; the CLI owns `process.exit` and the `2` path. **D5:** the gate's `DEPLOY-RB001` is a rollback-*path-existence verification*, not an invocation — satisfied by a `rollback` config block, a revert/rollback workflow or `deploy/rollback` script, or a documented runbook. It never deploys and never merges a revert. On failure it points at `harness-rollback`, establishing the pre-ship (readiness) ↔ post-ship (execution) pair connected by the shared `rollback` config seam.
   - `## Consequences` — Positive/Negative/Neutral (e.g. abstention semantics are now reusable by future gates; the deploy↔rollback seam is a config edge, not new coupling; negative: adopters must learn that exit 3 ≠ green).
   - `## Related` — the spec, the `harness-rollback` ADR if one exists, `packages/core/src/deployment/`, `harness check-deployment`.
3. Add a one-line reference to this ADR in `docs/changes/enforcing-deploy-gate/proposal.md` Integration Points → Architectural Decisions (`proposal.md:242-245`): "ADR: `docs/knowledge/decisions/0086-...md`".
4. Run: `harness validate`
5. Commit: `docs(adr): 0086 deploy-gate exit-code contract and rollback seam`

### Task 5: Regenerate plugin/agent artifacts + parity checks

**Depends on:** Tasks 1, 2, 3 | **Files:** generated plugin/agent bundles | **Category:** integration

1. Run the drift checks first: `pnpm generate:plugin:check` and `pnpm generate:barrels:check`.
2. If either reports drift from the skill metadata/body change, regenerate: `pnpm generate:plugin:all` (and `pnpm generate-docs` / the agent-definition generator if skill tier/mode surfaces in agent docs), then re-run the `:check` variants — expect no diff.
3. Run the `agents/skills` structure test (the vitest parity test that imports `required-sections.ts`): `npx vitest run agents/skills` (or the repo's skill-structure test path) — expect the harness-deployment skill passes with all required sections.
4. Grep the shipped + generated bodies for leaked identifiers: `git grep -nE "#[0-9]{2,}" agents/skills/claude-code/harness-deployment` and the generated plugin dir — expect **no matches**.
5. Run: `harness skill validate harness-deployment` and `harness validate`.
6. Commit: `chore(skill): regenerate plugin/agent bundles for harness-deployment upgrade`

### Task 6: `[checkpoint:human-verify]` — enforcing skill + ADR sign-off

**Depends on:** Tasks 4, 5 | **Files:** none (verification only) | **Category:** integration

1. Confirm `skill.yaml`: `cognitive_mode: meticulous-verifier`, `tier: 2`, an `enforce` phase, the `check-deployment` CLI entry, an `on_pre_merge` (or confirmed) trigger.
2. Confirm `SKILL.md`: ENFORCE phase with the exit-code contract + block-vs-advise table, mechanical `## Gates`, the rollback seam (D5), and the refreshed domain-specific `## Rationalizations to Reject`; DETECT/ANALYZE/DESIGN/VALIDATE prose retained (D7).
3. Confirm ADR 0086 exists with D2 + D5 and is referenced from the spec.
4. Run: `harness skill validate harness-deployment` → exit `0`; `harness validate`; `pnpm generate:plugin:check` → no diff.
5. Confirm no internal identifiers in the shipped/generated skill body (Task 5 grep).
6. `[checkpoint:human-verify]` — Present the diff of `skill.yaml` + `SKILL.md`, the ADR, and the green validator/parity output. Confirm Half (B) content is absent. Wait for confirmation before considering Phase 3 (and the feature) complete.

---

## Sequencing

- Task 1 → Task 2 → Task 3 are strict sequential (Tasks 2, 3 share `SKILL.md`).
- Task 4 (ADR) is independent and may run in parallel with Tasks 1-3.
- Task 5 (regenerate) depends on Tasks 1-3 (skill body finalized).
- Task 6 (checkpoint) depends on Tasks 4 and 5.

## Traceability

| Observable truth (SC / contract)     | Delivered by   |
| ------------------------------------ | -------------- |
| SC9 metadata (mode/tier/phase/trigger) | Task 1         |
| SC9 structure (ENFORCE/gates/seam)   | Task 2         |
| SC9 rationalizations                 | Task 3         |
| SC9 validator exits 0                | Tasks 1-3, 5, 6 |
| ADR (D2 + D5)                        | Task 4         |
| No internal identifiers / artifacts in sync | Task 5, 6 |

## Concerns

- If `skill.yaml`'s loader rejects `enforce_command` or `on_pre_merge`, fall back (document the command in `SKILL.md` Harness Integration; use the canonical trigger token) and note the deviation for the spec author — do not invent schema keys that fail validation.
- A `cognitive_mode`/`tier` change is a behavioral break for adopters who pinned the skill at Tier 3 advisory; the `version` major bump (Task 1) signals it. Flag in the checkpoint so the human is aware the skill now blocks at `on_pre_merge`.
- Skill metadata may be embedded in more than one generated artifact (plugin bundle, agent definitions, dispatcher tables). Task 5 runs all `:check` variants to catch every place the tier/mode surfaces; do not assume only the plugin bundle changed.
