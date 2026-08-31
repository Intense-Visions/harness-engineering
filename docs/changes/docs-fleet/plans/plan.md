# docs-fleet — Implementation Plan (autopilot stage)

- **Issue:** #1230
- **Route:** feature → brainstorming (proposal.md) → autopilot (this plan)
- **Proposal:** `docs/changes/docs-fleet/proposal.md`

Skill-authoring feature: the deliverable is a new `-fleet` family member authored as `SKILL.md` + `skill.yaml`, modeled exactly on the shared spine and on `cleanup-fleet` as the template. No executable orchestrator source — docs-fleet is skill-driven fan-out like every other member.

## Implementation Order

### Task 1 — Author `agents/skills/claude-code/docs-fleet/SKILL.md`

- Follow `cleanup-fleet/SKILL.md` structure exactly: title + one-line blockquote; a "builds on the spine" paragraph; a `Boundary` section (vs cleanup-fleet / craft-fleet — floor vs ceiling); When to Use; Flags; Process (Iron Law + five-phase table + per-phase SELECT/CONFIRM/DISPATCH/VERIFY/REPORT); Harness Integration; Success Criteria; Gates; Escalation; Rationalizations to Reject; Red Flags; Examples; Test Scenarios.
- Queue = doc-drift/coverage backlog composed from `detect-doc-drift` + `harness check-docs` + `harness-docs-pipeline` (report-only) + a doc-churn pass. `DocArea` record with `fixClass` (safe/probably-safe/unsafe) and composite `churn-gap × drift-density × coverage-gap` score.
- Per-area pipeline = `harness-docs-pipeline --fix` (convergence), worktree-isolated. VERIFY = independent re-scan (`detect-doc-drift` + `harness check-docs` clean) + all-OS CI green against a fresh base. Terminal = REPORT, never merge.
- Reference the spine sections (do not restate): concurrency governor, per-leaf context budget, base freshness, worktree push caveat, canonical `FleetHandoffRecord`.
- **Checkpoint:** `node packages/cli/dist/bin/harness.js skill validate docs-fleet` passes.

### Task 2 — Author `agents/skills/claude-code/docs-fleet/skill.yaml`

- Model on `cleanup-fleet/skill.yaml`: `type: rigid`, `tier: 2`, `cognitive_mode: systematic-orchestrator`, `stability: static`, all four platforms, tools `[Bash, Read, Glob, Grep]`, `filesystem: read-write`, `network: false`.
- Five `phases` (select/confirm/dispatch/verify/report) each `required: true` with a one-line description matching the SKILL.
- `depends_on: [detect-doc-drift, harness-docs-pipeline, harness-roadmap-pilot]`.
- `addresses: [{signal: doc-gaps, weight: 0.7}, {signal: drift, weight: 0.5}]` (matches `detect-doc-drift`'s own signal weighting — docs-fleet works the same signals at fleet scale).
- `cli.command: harness skill run docs-fleet` with flags `--concurrency / --report-only / --dry-run / --safe-only`.
- **Checkpoint:** `harness skill validate docs-fleet` passes with the full contract.

### Task 3 — Platform mirror symlinks

- Create `agents/skills/{cursor,codex,gemini-cli}/docs-fleet` as symlinks to `../claude-code/docs-fleet` (matching every other member). Do not hand-fork content.
- **Checkpoint:** `ls -la` shows three symlinks resolving to the canonical dir.

### Task 4 — Regenerate freshness-gated artifacts

- `pnpm run generate-docs` (skills-catalog.md, cli-commands.md, mcp-tools.md, agent-setup prompt).
- `pnpm run generate:tool-catalog` (tool-catalog.md — skill count + entry).
- `pnpm run generate:plugin:all` (per-platform slash commands: `.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`).
- **Checkpoint:** re-running every generator is a fixed point (no churn beyond the docs-fleet additions); `generate:plugin:check` and `generate:tool-catalog:check` pass.

### Task 5 — Empty changeset

- Add `.changeset/docs-fleet.md` with an empty frontmatter marker (no publishable `packages/<pkg>/src/` touched → honest no-release acknowledgement per `scripts/check-changesets.mjs`).
- **Checkpoint:** `pnpm run check:changesets` passes.

### Task 6 — Provenance + verification

- Write `docs/changes/docs-fleet/provenance.json` (issue 1230, route feature, stages, assumptions, changes list).
- Build the CLI (`pnpm turbo build --filter=@harness-engineering/cli`) so the pre-commit arch hook (fail-closed) passes.
- Commit (never `--no-verify`); push via non-`.claude` worktree; open PR with `Closes #1230`.
- **Checkpoint:** all-OS CI green against fresh `main`; `harness skill validate docs-fleet` green.

## Verification tiers

- **EXISTS:** `agents/skills/claude-code/docs-fleet/{SKILL.md,skill.yaml}` present; three mirror symlinks; slash commands generated for all platforms; catalogs updated.
- **SUBSTANTIVE:** SKILL.md carries all cleanup-fleet-parity sections plus the docs-specific queue/pipeline/boundary; skill.yaml has the full five-phase contract; `harness skill validate docs-fleet` passes.
- **WIRED:** the skill is discoverable by the generators (appears in skills-catalog, tool-catalog, and each platform's command dir) and its `depends_on` names resolve to real installed skills; freshness `--check` gates green on the committed tree.

## Risks / mitigations

- **Overlap with neighbours** → mitigated by the explicit Boundary section + scope-creep Rationalization (Task 1).
- **Mirror hand-fork drift** → mitigated by symlinks (Task 3), never copies.
- **Stale catalog gates** → mitigated by running all generators and confirming a fixed point (Task 4).
- **Spurious package release** → mitigated by an empty changeset (Task 5), since no `src/` changed.
