# Discovery: mattpocock/skills vs Harness Engineering

**Date:** 2026-10-13
**Skill:** harness-architecture-advisor (Phase 1 DISCOVER)
**Subject:** https://github.com/mattpocock/skills

## 1. What problem are you solving?

> Want to make harness better at its overall mission/purpose.

Framing proposed and accepted: determine where mattpocock/skills is stronger than harness and adopt its techniques where they advance the harness mission (STRATEGY.md: constraints-as-code over prompts-and-conventions).

## 2. Hard constraints

> looks good

Accepted as stated: changes must fit the existing `skill.yaml` + `SKILL.md` format, the four mirrored platform trees (claude-code, gemini-cli, codex, cursor), and the tier system; shipped skills must never cite internal PR/issue numbers.

## 3. Soft preferences

> no preference

No preference between adopting techniques (how skills are written/structured) and adopting individual skills; trimming or consolidating harness skills is not ruled out.

## 4. What have you already considered?

> I may have considered this before, not sure but I have considered a lot of different toolsets

Prior art found in-repo during discovery:

- `docs/ideation/external-source-adoption-tria-2026-08-09.md` — source-level triage; mattpocock/skills was candidate 7 (`grilling` frontier/round primitive).
- `docs/ideation/external-source-feature-matrix-2026-08-10.md` — feature-level matrix; judged harness-better on architecture enforcement and spec/ticket generation, parity on session handoff; set aside `wait-what`, `teach`, `to-questionnaire`, `writing-for-agents` (out of scope) and `resolving-merge-conflicts`.
- `docs/roadmap.d/frontier-based-round-questioning-for-guided-interviews.md` — filed (planned, no spec).
- Analogous comparisons: `docs/architecture/agent-skills-comparative/`, `docs/architecture/patternsdev-skills-adoption/`.

Implication: this pass must go **technique-deep** (skill-authoring craft, trigger design, token economy, composition) rather than repeat the feature-level matrix, and must not re-file the frontier-interview item.

## 5. What does success look like in 6 months?

> candidate answer looks good

A short, ranked set of adopted techniques, each shipped and measurably better (trigger accuracy, token cost, adoption). Regret condition: bulk-importing skills and adding to sprawl.

## Output scope

> I want a comparison report that turns into several detailed roadmap items

Deliverable: comparison report (`analysis.md` + `proposal.md`) feeding multiple detailed roadmap items; each item is spec-first via brainstorming before build.
