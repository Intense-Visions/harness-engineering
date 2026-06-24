---
number: 0039
title: Self-audit skills must be mechanically enforced, not prose
date: 2026-06-23
status: accepted
tier: medium
source: docs/changes/audit-harness-strength/proposal.md
---

## Context

The `audit-harness-strength` feature adds a recursion item to the harness: a skill that audits whether a project's _own harness_ is load-bearing, against seven STRENGTH failure patterns. The defining risk is that this audit fails its own first pattern.

STRENGTH-001 ("blocking-gate") flags a gate that runs but never blocks — a check documented as "always exits 0," reporting findings while letting everything through. A self-audit authored as a prose SKILL.md is exactly that: it describes the seven patterns and asks an agent to look for them, but nothing mechanically detects a violation or fails a build. It is self-audit-as-marketing — it warns but does not stop.

This is the canonical decision **D1** in the spec (`docs/changes/audit-harness-strength/proposal.md`, decision D1): _core engine + CLI, not SKILL.md-prose_. The reasoning is recorded there and is not restated at length here. The short form: the recursion item must survive being pointed at itself, the patterns are overwhelmingly mechanical (JSON key checks, greps, YAML parses, arithmetic), and the choice matches `STRATEGY.md#our-approach` — constraints-as-code over prompts-and-conventions. The v5.0 roadmap distinction between a documented pattern and an enforced one is the same line this ADR draws.

## Decision

Self-audit skills are implemented as a deterministic core engine plus a CLI command. The skill (`SKILL.md`) orchestrates and interprets; it never reimplements detection.

For this feature specifically:

- `HarnessStrengthAuditor` and a registry of seven `StrengthRule` modules live in `packages/core/src/harness-strength/` and own all detection and scoring.
- `harness check-harness-strength` exposes the engine as a deterministic, gating command.
- `agents/skills/claude-code/harness-audit-harness-strength/SKILL.md` runs that command, interprets its `--json` output against the seven-pattern table, and reports — with no detection logic of its own.

This sets the precedent for every future audit skill: the discipline lives in code that can fail a build, and the skill is a thin, testable orchestration layer over it.

## Consequences

**Positive:**

- The recursion item survives being pointed at itself — the strength audit can fail on its own weaknesses because detection is mechanical, not advisory.
- Each STRENGTH-NNN pattern is unit-testable in isolation via fixtures; correctness is provable, not asserted in prose.
- The gate can block CI, satisfying STRENGTH-001 for the audit itself.

**Negative:**

- More upfront engineering than a prose-only skill (an engine, a rule registry, scoring, tests).
- The engine and the skill must stay in sync. Mitigated: the SKILL.md carries no detection logic, so there is nothing to drift — the skill describes how to invoke and interpret, and the seven-pattern table is documentation, not a second implementation.

## Alternatives considered

- **Prose-only SKILL.md.** Rejected: it fails its own STRENGTH-001 — a self-audit that warns but cannot stop is self-audit-as-marketing.
- **Engine without a skill.** Rejected: the command exists but is not discoverable or invocable by agents through the skill catalog / slash commands. The skill is the agent-facing surface.

## Implementation

- `packages/core/src/harness-strength/` — `HarnessStrengthAuditor`, the seven `StrengthRule` modules, and scoring (Phases 1-2, done).
- `packages/cli/src/commands/check-harness-strength.ts` — the gating CLI command (Phase 3, registered in `_registry.ts`).
- `agents/skills/claude-code/harness-audit-harness-strength/` — the orchestrating skill (`SKILL.md` + `skill.yaml`), replicated to the cursor/codex/gemini-cli platform dirs (Phase 4).
