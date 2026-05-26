---
number: 0033
title: Skill authors do not declare backend preferences
date: 2026-05-26
status: accepted
tier: medium
source: docs/changes/granular-task-routing/proposal.md
---

## Context

Per-skill routing (ADR 0029) opens the door to a natural-feeling but ultimately corrosive extension: letting `skill.yaml` declare a preferred backend (e.g., `preferredBackend: claude-opus` or `preferredBackend: any-reasoning-model`). This would let skill authors signal "this skill needs Opus" or "this skill prefers a reasoning model" without operator config.

The cost: skills become non-portable. A skill authored against a deployment with `claude-opus` named in `agent.backends` breaks in a deployment that names the same model `cloud-primary`. Multiple deployments cannot share a skill catalog without reconciling backend-name conventions.

## Decision

`skill.yaml` is **not** extended with a `preferredBackend` field. Routing is purely operator-controlled via `harness.config.json`'s `agent.routing` map. Skill authors describe skill requirements (e.g., "this skill benefits from a reasoning model with at least 32k context") in skill documentation prose — `SKILL.md` body — not in machine-readable fields that the router consults.

## Consequences

**Positive:**

- Skills are portable across deployments. A skill catalog can be shared between an enterprise (`agent.backends: { claude-opus, claude-sonnet }`) and a personal (`agent.backends: { primary, local-fast }`) deployment without reconciliation.
- Operator authority is absolute. Every routing decision goes through `agent.routing`; no "but the skill said it wanted X" surprise.
- Schema surface stays narrow. `skill.yaml` already carries `cognitive_mode`, which is a portable semantic attribute (cognitive-mode-to-backend mapping is operator-defined via `routing.modes`). That covers the legitimate "this kind of skill prefers this kind of backend" pattern.

**Negative:**

- Skill authors who genuinely know their skill needs a specific class of backend (e.g., long-context reasoning) must communicate that via documentation, not via schema. The operator must read the docs and configure `routing.skills.<name>` or `routing.modes.<mode>` accordingly. Mitigated by the standard `cognitive_mode` axis — most "class of backend" cases land in one of the six standard modes.

**Neutral:**

- The cognitive-mode axis (ADR 0029) absorbs the legitimate generic-preference case without requiring per-skill schema. A skill author labels the skill `cognitive_mode: adversarial-reviewer`; the operator decides which backend runs adversarial reviewers via `routing.modes.adversarial-reviewer`.
