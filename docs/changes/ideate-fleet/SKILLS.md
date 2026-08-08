# Skill Advisor — ideate-fleet

Signals extracted from the spec: autonomous orchestration, strategy-grounded ideation, theme fan-out, ranked candidates, impact × confidence ÷ effort, strongest-objection critique, curated ranked shortlist, anti-spam curation, novelty cross-check, human pick, worktree isolation, batch human review, skill authoring.

> The automated content scan returned only generic TypeScript/pattern skills (the spec is a skill-authoring change, not application code); the list below is the curated replacement.

## Apply

- **harness-ideate** — the real per-theme pipeline DISPATCH runs to a ranked artifact; its `docs/ideation/<slug>-<date>.md` output is the provenance VERIFY checks for. Never hand-generate candidates.
- **harness-strategy** — the read-only boundary partner: strategy WRITES `STRATEGY.md`, this fleet READS it (via `read_strategy`) to derive the theme queue. Never repaired from here.
- **harness-roadmap-pilot** — its impact-scoring approach is reused in SELECT to order themes by strategic weight.
- **harness-skill-authoring** — author the new skill in the rich format (required sections, tier, Rationalizations to Reject).
- **harness-brainstorming** — the documented downstream for a human-picked idea; the fleet routes to it by hand and never invokes it on an idea's behalf.

## Reference

- **bug-fleet** — the closest structural analogue: the anti-spam discipline (no evidence, no filing) that this member transposes to the ideation stage, plus the "a clean/thin item is a valid result" rule.
- **issue-fleet** — the immediately downstream stage; the fleet's shortlist becomes issues only after a human picks, and those enter intake like any other issue.
- **docs/reference/fleet-family.md** — the shared five-phase spine, concurrency governor, artifact-based verification discipline, worktree fan-out and push caveat, and never-file-unreviewed-work invariant.
- **harness-roadmap** — where a human may enqueue several picks; the fleet never mutates the roadmap itself.
- **harness-verify** — binary quick-gate support during the authoring change's own verification.

## Consider

- **read_strategy (MCP)** — the grounding oracle SELECT calls; returns `{ present, valid, doc?, error? }` and drives the absent/invalid degradation path.
- **spec-craft** — LLM-judgment critique of this spec's own quality before planning.
- **The Workflow primitive** — a future deterministic/resumable execution substrate for DISPATCH (named as an upgrade in the fan-out ADR, not v1).
- **fleet-command** — the deferred tier-3 conductor that would sequence this member ahead of the rest of the spine; out of scope here.
