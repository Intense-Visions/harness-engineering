# Plan: Strategic Anchor — Phase 2: harness-strategy Skill

**Date:** 2026-06-02 | **Spec:** `docs/changes/compound-engineering-adoption/strategic-anchor/proposal.md` | **Tasks:** 6 | **Integration Tier:** medium

> Phase 2 of the strategic-anchor spec. Builds on Phase 1 (`StrategyDocSchema`, parser, `validateStrategy`). Adds the `harness-strategy` skill prose for the first-run interview and update flow, plus the runtime writer (`writeStrategyDoc` + `serializeStrategyDoc`) that persists interview output to `STRATEGY.md`. Init wiring (Phase 3), ideate skill (Phase 4), and brainstorming/roadmap-pilot grounding (Phases 5-6) ship in follow-up PRs.

## Goal

A user runs `/harness:strategy` on a project with no `STRATEGY.md`; the skill conducts an interview with pushback (fluff / goal-as-strategy / feature-list-as-strategy rejection), capped at 2 rounds per section, and on completion writes a valid `STRATEGY.md` at repo root. Re-running on a project with an existing `STRATEGY.md` routes to the update flow, surfaces a summary, and re-interviews only the section the user selects.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/{claude-code,gemini-cli,cursor,codex}/harness-strategy/SKILL.md` and `skill.yaml` exist and are byte-identical across the 4 platforms (passes `agents/skills/tests/platform-parity.test.ts`).
2. SKILL.md documents Phase 0 (route by file state), Phase 1 (first-run interview), Phase 2 (update), Phase 3 (downstream handoff) and references `references/interview.md`.
3. `references/interview.md` documents the three pushback rules (fluff, goal-as-strategy, feature-list-as-strategy) and the 2-round cap.
4. `writeStrategyDoc(doc, { cwd })` writes `<cwd>/STRATEGY.md`; the resulting file parses and validates via `validateStrategy(cwd)`.
5. `writeStrategyDoc` writes `STRATEGY.md.bak` on first overwrite (when one doesn't already exist) and is idempotent on subsequent runs.
6. `writeStrategyDoc` rejects schema-invalid docs without touching disk.
7. `serializeStrategyDoc(doc)` emits sections in REQUIRED-then-OPTIONAL template order regardless of input order; round-trip via `parseStrategyDoc` recovers the input doc.
8. `writeStrategyDoc` and `serializeStrategyDoc` are exported from `@harness-engineering/core` via `packages/core/src/strategy/index.ts`.
9. `pnpm --filter @harness-engineering/core test` passes (existing + new writer/serialize tests).
10. `harness validate` passes at plan end.

## Scope

### In scope

- Commit the runtime helpers `packages/core/src/strategy/serialize.ts` and `packages/core/src/strategy/writer.ts` (already drafted as untracked files) plus their tests
- Update `packages/core/src/strategy/index.ts` to re-export the new helpers
- Create the `harness-strategy` skill across all 4 platforms with SKILL.md, skill.yaml, and references/interview.md
- Confirm `platform-parity.test.ts` and `harness validate` pass

### Out of scope

- `initialize-harness-project` wiring (Phase 3)
- `harness-ideate` skill (Phase 4)
- `harness-brainstorming` STRATEGY.md grounding (Phase 5)
- `harness-roadmap-pilot` strategy-alignment tiebreaker (Phase 6)
- `BusinessKnowledgeIngestor` strategy domain (Phase 7)
- ADRs and AGENTS.md update (Phase 8)
- A standalone CLI subcommand for strategy — the skill is the interface; the writer is exposed as a Node import for the agent to shell into when persisting

## File Map

```
ADD packages/core/src/strategy/serialize.ts                                (already drafted; commit)
ADD packages/core/src/strategy/serialize.test.ts                           (already drafted; commit)
ADD packages/core/src/strategy/writer.ts                                   (already drafted; commit)
ADD packages/core/src/strategy/writer.test.ts                              (already drafted; commit)
MODIFY packages/core/src/strategy/index.ts                                 (already updated; commit)

CREATE agents/skills/claude-code/harness-strategy/SKILL.md
CREATE agents/skills/claude-code/harness-strategy/skill.yaml
CREATE agents/skills/claude-code/harness-strategy/references/interview.md
CREATE agents/skills/gemini-cli/harness-strategy/...                       (byte-identical mirror)
CREATE agents/skills/cursor/harness-strategy/...                           (byte-identical mirror)
CREATE agents/skills/codex/harness-strategy/...                            (byte-identical mirror)
```

## Tasks

### Task 1: Commit the runtime helpers (serialize + writer) and tests

Untracked files `serialize.ts`, `serialize.test.ts`, `writer.ts`, `writer.test.ts` already implement the schema-validated writer with `.bak` backup, atomic temp-file rename, and preserved-H1 round-trip. `index.ts` already re-exports them. Confirm tests pass, then include in the Phase 2 commit.

**Verify:**

```
pnpm --filter @harness-engineering/core test strategy
```

### Task 2: Write `agents/skills/claude-code/harness-strategy/skill.yaml`

Schema-conformant `skill.yaml`. Type `rigid`, tier `2`, persistent state on `STRATEGY.md` + `.bak`. Cognitive mode `configuration-interviewer` (matches harness-pulse, the sibling first-run-interview skill).

### Task 3: Write `agents/skills/claude-code/harness-strategy/SKILL.md`

Four phases as per the spec (Phase 0 route, Phase 1 first-run, Phase 2 update, Phase 3 downstream handoff). Quote the 2-round pushback cap from `references/interview.md`. Document the persistence step as a Node one-liner that pipes JSON through stdin to `writeStrategyDoc` so user-supplied prose never crosses the shell tokenizer (same hardening pattern as harness-pulse).

### Task 4: Write `agents/skills/claude-code/harness-strategy/references/interview.md`

Document the three pushback rules from spec Decision 4 (fluff, goal-as-strategy, feature-list-as-strategy) with concrete examples per rule. State the 2-round cap explicitly and what happens on cap reached ("captured what you gave; flagged for revisit"). Document the section schema and the placeholder-rejection rule users must clear.

### Task 5: Mirror skill files across all 4 platforms (byte-identical)

Copy SKILL.md, skill.yaml, and references/interview.md from `claude-code/` to `cursor/`, `codex/`, `gemini-cli/`. Verify with `pnpm test -- platform-parity`.

### Task 6: Run the verification gate

Sequence:

1. `pnpm --filter @harness-engineering/core test`
2. `pnpm test -- platform-parity` (or the workspace-wide test command)
3. `pnpm typecheck`
4. `node packages/cli/dist/index.js validate` (after build) — or `harness validate` if the local binary is wired

Expect all green. Fix and re-run on any failure.

## Risks

- **Risk:** Writer files were authored in a prior aborted session and may not reflect the current schema — **Mitigation:** Task 1 runs the strategy test suite as the first gate. We discovered 49/49 passing during scoping, so we know the foundation is sound, but Task 1 keeps that gate explicit.
- **Risk:** Platform-parity drift if any file edit is made in only one platform — **Mitigation:** Task 5 is an explicit cp step and the parity test runs in Task 6.
- **Risk:** SKILL.md prescribes a Node one-liner that crashes with user input containing single quotes — **Mitigation:** The harness-pulse precedent uses stdin redirection (`echo '<json>' | node -e "..."`) and we replicate it directly.

## Success criteria recap

- All 10 Observable Truths above pass.
- The PR diff contains: the four runtime helper files (serialize/writer + tests), the strategy skill across 4 platforms, and this plan. Nothing else.
