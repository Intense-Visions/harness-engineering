---
'@harness-engineering/core': minor
'@harness-engineering/skills': minor
'@harness-engineering/cli': patch
---

Ship the `harness-strategy` skill and the `writeStrategyDoc` writer (strategic-anchor phase 2 of 8 in the compound-engineering-adoption initiative).

- `packages/core/strategy` exports `writeStrategyDoc(doc, { cwd, skipBackup? })` — atomic disk write of `STRATEGY.md` with schema-validation-rejects-disk-write, an idempotent `.bak` on first overwrite, H1 preservation across re-writes, and `tmp-<pid>` + `rename` semantics that mirror `writePulseConfig`. Composes a pure `serializeStrategyDoc(doc, opts?)` (also exported) so the serializer is unit-testable without filesystem fixtures.
- `agents/skills/{claude-code,gemini-cli,cursor,codex}/harness-strategy/` ships the rigid skill (Phase 0 file-state routing; Phase 1 first-run interview in template order; Phase 2 per-section update flow; Phase 3 downstream handoff). `references/interview.md` documents the three pushback rules (fluff detection, goal-as-strategy, feature-list-as-strategy) with detection signals, repair scripts, anti-pattern fixtures, and the hard 2-round-per-section cap.
- CLI emits `/harness:strategy` via `generate-slash-commands` (and the per-platform plugin generators); the slash command appears in `.claude-plugin/commands/strategy.md`, `.gemini-extension/commands/strategy.toml`, `.cursor-plugin/commands/strategy.md`, plus the `agents/commands/*` mirrors. Skill listed in the auto-generated skills catalog.

Scope: writer + skill prose only. Init wiring, `harness-ideate`, brainstorming/roadmap-pilot grounding, knowledge-graph integration, and ADRs ship in follow-up PRs (one per phase).
