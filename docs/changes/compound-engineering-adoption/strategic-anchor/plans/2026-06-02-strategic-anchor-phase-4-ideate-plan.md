# Strategic Anchor Phase 4: harness-ideate Skill

**Date:** 2026-06-02 | **Spec:** [../proposal.md](../proposal.md) | **Phase:** 4 of 8 | **Tasks:** 7 | **Integration Tier:** medium

> Pre-brainstorm ideation skill. Generates and ranks candidate ideas grounded in `STRATEGY.md` (when present); produces a Markdown artifact at `docs/ideation/<slug>-YYYY-MM-DD.md`. Sits upstream of `harness-brainstorming` in the workflow: ideation produces candidates → brainstorming converts one into a spec. Phases 1, 2, 3, 5, 6 of the strategic-anchor spec are already merged on `main`; Phase 7 (`BusinessKnowledgeIngestor` strategy domain) and Phase 8 (ADRs + AGENTS.md update) ship in follow-up PRs.

## Goal

A user invokes `/harness:ideate <topic>` and the skill produces a ranked list of candidate ideas at `docs/ideation/<slug>-YYYY-MM-DD.md`. When `STRATEGY.md` is present and valid, the candidates are grounded in it (target problem, persona, tracks) and strategy-alignment is the tiebreaker bonus during ranking; when absent or invalid, the skill degrades cleanly to focus-only ideation with no ranking penalty.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/{claude-code,gemini-cli,cursor,codex}/harness-ideate/SKILL.md` and `skill.yaml` exist and are byte-identical across the 4 platforms (passes `agents/skills/tests/platform-parity.test.ts`).
2. `agents/skills/{4 platforms}/harness-ideate/references/scoring.md` exists and is byte-identical across all 4.
3. `skill.yaml` validates against `SkillMetadataSchema` (passes `agents/skills/tests/references.test.ts`).
4. `SKILL.md` contains the required rigid sections (`## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Gates`, `## Escalation`) per `agents/skills/tests/structure.test.ts`.
5. SKILL.md documents 5 phases: GROUND (read STRATEGY.md + focus arg), GENERATE (N candidates, default 10, with the 7 per-idea fields), CRITIQUE (strongest objection per idea, user-selected resolution), RANK (`(impact × confidence) ÷ effort` with bounded strategy-alignment tiebreaker bonus), PERSIST (write artifact).
6. SKILL.md documents the seven per-idea fields: `premise`, `persona`, `complexity`, `key risk`, `impact`, `confidence`, `effort`.
7. SKILL.md documents the slug-collision rule: kebab-case of focus argument, truncated to 30 chars, with a 6-char hash suffix appended on same-day collision against an existing `docs/ideation/` artifact.
8. `references/scoring.md` documents the `(impact × confidence) ÷ effort` formula with low/medium/high → 1/2/3 numeric mapping AND the bounded strategy-alignment tiebreaker (max bonus `+0.75`, applied only when two candidates score within `0.05` on the base formula — mirrors `harness-roadmap-pilot`'s tiebreaker contract).
9. SKILL.md never writes specs, plans, or code — only the ranked Markdown artifact (gate enforced via `## Gates`).
10. The skill is discoverable by the slash-command generator (after pre-commit hook regeneration, `/harness:ideate` appears in `.claude-plugin/commands/ideate.md`, `.gemini-extension/commands/ideate.toml`, `.cursor-plugin/commands/ideate.md`, plus `agents/commands/ideate.*` mirrors — verified by inspecting one mirror at minimum during a Task 7 spot-check).
11. `pnpm test -- platform-parity` and `pnpm test -- references` pass.
12. `harness validate` passes at plan end.
13. A `.changeset/strategic-anchor-phase-4-ideate.md` entry is committed with `@harness-engineering/skills: minor` and `@harness-engineering/cli: patch`.

## Scope

### In scope

- `agents/skills/{4 platforms}/harness-ideate/` directories — SKILL.md, skill.yaml, references/scoring.md (byte-identical mirrors)
- A changeset summarizing the skill addition
- This plan committed under `docs/changes/compound-engineering-adoption/strategic-anchor/plans/`

### Out of scope

- `BusinessKnowledgeIngestor` strategy domain (Phase 7, follow-up PR)
- ADRs and AGENTS.md "Strategic Anchor" section (Phase 8, follow-up PR)
- New TypeScript runtime helpers — the skill is prose-only; ranking math is inline LLM instruction; persistence is via the `Write` tool, not a core helper
- Slash-command generator changes — the existing generator picks up new skills automatically; the husky pre-commit hook regenerates the per-platform plugin artifacts (confirmed by recent commit `9762b45d chore(husky): auto-regenerate plugin artifacts on pre-commit`)
- Roadmap status flip to `done` — the spec still has Phases 7 and 8 outstanding, so the roadmap entry remains `in-progress`

## File Map

```
CREATE agents/skills/claude-code/harness-ideate/SKILL.md
CREATE agents/skills/claude-code/harness-ideate/skill.yaml
CREATE agents/skills/claude-code/harness-ideate/references/scoring.md
CREATE agents/skills/gemini-cli/harness-ideate/SKILL.md                   (byte-identical mirror)
CREATE agents/skills/gemini-cli/harness-ideate/skill.yaml                 (byte-identical mirror)
CREATE agents/skills/gemini-cli/harness-ideate/references/scoring.md      (byte-identical mirror)
CREATE agents/skills/cursor/harness-ideate/SKILL.md                       (byte-identical mirror)
CREATE agents/skills/cursor/harness-ideate/skill.yaml                     (byte-identical mirror)
CREATE agents/skills/cursor/harness-ideate/references/scoring.md          (byte-identical mirror)
CREATE agents/skills/codex/harness-ideate/SKILL.md                        (byte-identical mirror)
CREATE agents/skills/codex/harness-ideate/skill.yaml                      (byte-identical mirror)
CREATE agents/skills/codex/harness-ideate/references/scoring.md           (byte-identical mirror)
CREATE .changeset/strategic-anchor-phase-4-ideate.md
CREATE docs/changes/compound-engineering-adoption/strategic-anchor/plans/2026-06-02-strategic-anchor-phase-4-ideate-plan.md
```

## Tasks

### Task 1: Author `agents/skills/claude-code/harness-ideate/skill.yaml`

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-ideate/skill.yaml`

Mirror the shape of `harness-strategy/skill.yaml` (the sibling pre-brainstorm-tier skill). Type `rigid`, tier `2`, cognitive_mode `divergent-thinker`. Triggers: `manual` only. State `persistent: false` (the artifact is the persistence; the skill itself holds no cross-invocation state). `depends_on: ['harness-strategy']` so the dependency graph reflects that ideate reads what strategy writes (soft dependency — ideate degrades cleanly when strategy is absent, but the directional edge is real). Phases match the 5 phases from Observable Truth 5. Keywords cover ideation, pre-brainstorm, candidate-ranking, strategy-grounded.

**Verify:**

```
pnpm --filter '@harness-engineering/skills' test -- references
```

Schema validation must pass.

**Commit:** `feat(skills): scaffold harness-ideate skill.yaml (strategic-anchor phase 4)`

### Task 2: Author `agents/skills/claude-code/harness-ideate/SKILL.md`

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/harness-ideate/SKILL.md`

Sections required by `structure.test.ts` for a rigid skill: `## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Gates`, `## Escalation`. Document the five phases exactly as specified in Observable Truth 5. Document the seven per-idea fields (Observable Truth 6). Document the slug-collision rule (Observable Truth 7). Cite `references/scoring.md` for the formula and tiebreaker contract. State explicitly under `## Gates` that the skill writes only the ranked Markdown artifact under `docs/ideation/` and never produces specs, plans, or code (the boundary with `harness-brainstorming`).

**Phase 1 GROUND** instructs:

- Read the focus argument from `args.focus` (kebab-case slug seed).
- Read `STRATEGY.md` via a Node one-liner that calls `validateStrategy` from `@harness-engineering/core`, then on `valid: true` parses with `parseStrategyDoc` + `asStrategyDoc`. Capture `Target problem`, `Our approach`, `Who it's for`, `Tracks`. Soft-fail silently when absent or invalid (no warning, no block — exactly like `harness-brainstorming` step 0a and `harness-roadmap-pilot` step 1a).
- Read user's `n` argument (default 10, min 5, max 25 — caps documented).

**Phase 2 GENERATE** instructs: emit `n` candidate ideas. Each idea has exactly the seven fields. For each field document the value space (`impact|confidence|effort: low|medium|high`; `complexity: low|medium|high`; `premise: one sentence`; `persona: specific persona segment`; `key risk: one sentence`).

**Phase 3 CRITIQUE** instructs: for each idea identify the single strongest objection. Present a numbered list and `emit_interaction` (`type: question`) asking which objections the user wants to answer before ranking — multiSelect or "none". The user's resolutions are captured inline; the un-answered ideas keep their critique as a flag in the persisted artifact.

**Phase 4 RANK** instructs: apply `(impact × confidence) ÷ effort` with the `low|medium|high → 1|2|3` mapping documented in `references/scoring.md`. When `STRATEGY.md` was grounded in Phase 1, compute a bounded strategy-alignment bonus per idea (matches a `Tracks` bullet OR aligns with `Target problem` / `Our approach`) — apply only as a tiebreaker when two candidates score within `0.05` on the base formula. Maximum bonus `+0.75`. Cite alignment in the rationale alongside any matched track name.

**Phase 5 PERSIST** instructs: build the slug — kebab-case of the focus argument, truncated to 30 chars; if `docs/ideation/<slug>-YYYY-MM-DD.md` already exists for today, append a 6-char hash suffix (`<slug>-YYYY-MM-DD-<hash>.md`). Write the artifact via the `Write` tool — never via shell echo/heredoc (user-provided topic strings could carry shell metacharacters). The artifact shape is documented inline with required headings: `# Ideation: <focus>` H1, frontmatter (`focus`, `date`, `strategy_grounded: true|false`, `n`), `## Ranking`, `## Ideas` (one subsection per idea with all 7 fields, the strongest objection, and any user resolution).

**Verify:**

```
pnpm --filter '@harness-engineering/skills' test -- structure
```

Section gates must pass.

**Commit:** `feat(skills): author harness-ideate SKILL.md (strategic-anchor phase 4)`

### Task 3: Author `agents/skills/claude-code/harness-ideate/references/scoring.md`

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/harness-ideate/references/scoring.md`

Single reference doc consumed by Phase 4 RANK. Contents:

- The `(impact × confidence) ÷ effort` formula stated explicitly.
- The `low|medium|high → 1|2|3` numeric mapping.
- A worked example: `impact: high (3), confidence: medium (2), effort: medium (2)` → `3 × 2 / 2 = 3.0`.
- The strategy-alignment tiebreaker contract: bonus is bounded at `+0.75`, applied ONLY when two candidates' base scores are within `0.05`, computed as `(matched-tracks × 0.5) + (target-problem-or-approach-match × 0.25)`. State the boundary with `harness-roadmap-pilot`'s tiebreaker explicitly — same bonded-tiebreaker shape, different domain (ranking ideas vs roadmap candidates).
- One anti-pattern fixture per scoring failure mode (e.g., "letting alignment override a clearly higher base score" is rejected; the cap is the mechanism).

**Verify:** No automated test fires on `references/scoring.md` directly — file is consumed by the SKILL.md prose. The platform-parity test (Task 5) catches drift.

**Commit:** `feat(skills): document harness-ideate scoring reference (strategic-anchor phase 4)`

### Task 4: Mirror `harness-ideate/` to gemini-cli, cursor, codex (byte-identical)

**Depends on:** Tasks 1, 2, 3 | **Files:** all `agents/skills/{gemini-cli,cursor,codex}/harness-ideate/*` files

Copy SKILL.md, skill.yaml, and references/scoring.md from `claude-code/` to each of the other three platforms verbatim. No platform-specific edits — `platform-parity.test.ts` enforces byte-equality.

```bash
for p in gemini-cli cursor codex; do
  mkdir -p "agents/skills/$p/harness-ideate/references"
  cp agents/skills/claude-code/harness-ideate/SKILL.md "agents/skills/$p/harness-ideate/SKILL.md"
  cp agents/skills/claude-code/harness-ideate/skill.yaml "agents/skills/$p/harness-ideate/skill.yaml"
  cp agents/skills/claude-code/harness-ideate/references/scoring.md "agents/skills/$p/harness-ideate/references/scoring.md"
done
```

**Verify:**

```
pnpm --filter '@harness-engineering/skills' test -- platform-parity
```

Must report all 4 platforms in sync.

**Commit:** `feat(skills): mirror harness-ideate to gemini-cli/cursor/codex (strategic-anchor phase 4)`

### Task 5: Add changeset

**Depends on:** Task 4 | **Files:** `.changeset/strategic-anchor-phase-4-ideate.md`

Create a changeset following the format established by `.changeset/strategic-anchor-phase-2-harness-strategy.md` (and the existing pattern in `.changeset/`). Frontmatter:

```yaml
---
'@harness-engineering/skills': minor
'@harness-engineering/cli': patch
---
```

Body: one-paragraph summary stating that Phase 4 ships the `harness-ideate` pre-brainstorm skill across all 4 platforms; the skill is read-only with respect to existing repo state (its only write target is the new `docs/ideation/` artifact); explicitly reiterate the boundary with `harness-brainstorming` (ideation produces ranked candidates only, never specs / plans / code); note that Phases 7 (knowledge-graph) and 8 (ADRs + AGENTS.md) remain outstanding follow-ups.

**Verify:**

```bash
node -e "const fs = require('fs'); const c = fs.readFileSync('.changeset/strategic-anchor-phase-4-ideate.md', 'utf-8'); if (!c.match(/^---/)) throw new Error('no frontmatter');"
```

**Commit:** _bundled with Task 6 verification commit (the changeset is content, not an artifact that needs an isolated commit)._

### Task 6: Run the full verification gate

**Depends on:** Task 5 | **Files:** _read-only_ — `Bash` invocations only

Sequence — fix and re-run on any failure:

1. `pnpm --filter '@harness-engineering/skills' test` — runs platform-parity, structure, references, and the harness-strategy/harness-compound contract tests as a side effect. All must pass.
2. `pnpm typecheck` — no TypeScript was added, but the lint / type configs may pick up YAML or markdown lints that affect the skill directories.
3. `pnpm lint` — same rationale.
4. `npx @harness-engineering/cli validate` (or `harness validate` if the binary is wired). Must report no errors.

The pre-commit husky hook will regenerate the per-platform plugin artifacts (`.claude-plugin/commands/ideate.md`, `.gemini-extension/commands/ideate.toml`, `.cursor-plugin/commands/ideate.md`, `agents/commands/ideate.*`) automatically on the first commit that touches the skill directory — DO NOT pre-emptively edit those files; let the hook own them.

**Spot-check Observable Truth 10 once the hook runs:**

```bash
ls -1 .claude-plugin/commands/ideate.md .gemini-extension/commands/ideate.toml .cursor-plugin/commands/ideate.md 2>/dev/null
```

All three files should exist after the husky hook runs at commit time. If any are missing, the slash-command generator is wired wrong — escalate before proceeding.

**Verify:** every command above exits 0 and reports no errors.

**Commit:** `chore: changeset + verification for harness-ideate (strategic-anchor phase 4)` — bundles the changeset and any hook-generated plugin artifacts that landed during the verification run.

### Task 7: Update the roadmap status line on `strategic-anchor`

**Depends on:** Task 6 | **Files:** `docs/roadmap.md` | **Category:** integration

The roadmap entry for `strategic-anchor` currently shows `Status: in-progress`. After this PR, Phases 1, 2, 3, 4, 5, 6 are complete; Phases 7 and 8 remain. Leave `Status: in-progress` (the spec is not yet fully delivered) but update the entry's `Summary` field to reflect what shipped vs. what's outstanding. Specifically:

- Read `docs/roadmap.md`.
- Locate the `strategic-anchor` entry.
- If the summary field still reads the original "Add STRATEGY.md upstream anchor and harness-ideate pre-brainstorm phase. Wires into..." line, update it to: `Phases 1-6 shipped (schema, harness-strategy skill, init wiring, harness-ideate skill, brainstorming + roadmap-pilot grounding). Phases 7 (BusinessKnowledgeIngestor strategy domain) and 8 (ADRs + AGENTS.md "Strategic Anchor" section) outstanding.`
- Status stays `in-progress`.

Use the `manage_roadmap` MCP tool when available; otherwise edit `docs/roadmap.md` directly with `Edit` and preserve surrounding entries verbatim.

**Verify:**

```bash
grep -A 8 "strategic-anchor" docs/roadmap.md
```

The summary must mention Phases 1-6 shipped and Phases 7+8 outstanding.

**Commit:** `chore(roadmap): mark strategic-anchor phases 1-6 shipped; 7-8 outstanding`

## Sequence + Parallelism

- Tasks 1 → 2 → 3 must be sequential (each builds on the previous file).
- Task 4 (mirror) blocks on Tasks 1, 2, 3 — it copies their outputs.
- Tasks 5 (changeset) and 7 (roadmap) are independent of each other AND independent of Tasks 1-4 _structurally_ (different files), but conceptually they describe the work done in 1-4. Run them after Task 4 to keep their wording accurate.
- Task 6 (verification gate) MUST run last — any post-verification edit re-triggers the gate.

No two tasks parallelizable in practice — the dependency chain is linear and the gate at Task 6 needs the full diff visible.

**Estimated total:** 7 tasks, ~28 minutes (SKILL.md is the largest, ~10 min; the rest are 2-4 min apiece).

## Integration Tier: medium

Justification: new skill, new public API surface (slash command `/harness:ideate`), 4-platform mirror, plugin artifact regeneration via husky hook. Larger than a small (config tweak), smaller than a large (no new package, no ADR, no architectural shift). The medium tier triggers wiring checks AND project updates (roadmap, changelog) — both are covered (Task 5 changelog, Task 7 roadmap).

## Risks

- **Risk:** SKILL.md prose drifts across the 4 platform mirrors during multi-task edits — **Mitigation:** Task 4 is an explicit `cp` step and platform-parity is the first test in Task 6.
- **Risk:** Slug generation in Phase 5 PERSIST collides with an existing same-day artifact and the agent fails to detect the collision — **Mitigation:** Phase 5 instruction explicitly tells the agent to read `docs/ideation/` before writing, and the 6-char hash suffix rule is deterministic given the candidate body.
- **Risk:** The user invokes `/harness:ideate` against a project with a present-but-invalid `STRATEGY.md` and the soft-fail logic accidentally surfaces a noisy error — **Mitigation:** GROUND-phase Node one-liner mirrors `harness-brainstorming` step 0a verbatim (already merged on main), so the soft-fail path is already proven.
- **Risk:** Husky hook regeneration produces a plugin artifact diff Task 6 was not expecting (e.g., `.gemini-extension/commands/ideate.toml` formatting) — **Mitigation:** The hook is canonical; we accept whatever it produces. Commit those generated files alongside the verification commit; do NOT hand-edit.

## Success Criteria recap

- All 13 Observable Truths pass.
- The PR diff contains exactly: 12 skill files (3 files × 4 platforms), the changeset, this plan, the roadmap-line edit, and whatever plugin artifacts the husky hook regenerates. Nothing else.
- `harness validate`, `pnpm test`, `pnpm typecheck`, `pnpm lint` all green.
- Roadmap entry for `strategic-anchor` accurately reflects post-PR state (Phases 1-6 shipped; 7-8 outstanding).
