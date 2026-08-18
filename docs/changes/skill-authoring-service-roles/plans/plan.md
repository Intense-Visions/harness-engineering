# Plan: Require Service-Definition/Provider/Consumer roles in skill-authoring guidance

Issue: Intense-Visions/harness-engineering#1397
Slug: skill-authoring-service-roles

## Problem

A capability-seam model requires every extension point to name a Service Definition,
at least one Provider, and at least one Consumer. A capability with only one role
filled is not actually swappable — it is accidental single-implementation lock-in
dressed up as an extension point. `harness-skill-authoring` had no equivalent
requirement, so a new MCP tool or skill capability could ship half-wired.

## Goal

When a new MCP tool or skill capability is proposed, its author must state what it
DEFINES (Service Definition), who PROVIDES it (≥1 Provider), and who CONSUMES it
(≥1 Consumer). Surface this both as authoring guidance and as a checklist prompt in
the `create_skill` scaffold output.

## Changes

1. **Guidance (`agents/skills/claude-code/harness-skill-authoring/SKILL.md`)**
   - New `### Phase 1C: DECLARE CAPABILITY ROLES — Service Definition / Provider /
Consumer` under `## Process`, placed between DEFINE (Phase 1) and CHOOSE TYPE
     (Phase 2). Defines the three roles, the single-role red flag, and where to
     record them.
   - New `## Gates` entry: "No half-wired capabilities" — all three roles must be
     named or the extension point collapses to a direct call.
   - New domain-specific `## Rationalizations to Reject` entry rejecting
     "there's only one implementation, so I don't need a Provider and Consumer".

2. **Skill mirrors** — the cursor/codex/gemini-cli copies of this SKILL.md are
   hardlinks to the claude-code file (same inode), so editing the canonical file
   updated all four automatically. Verified byte-identical via md5 + shared inode.

3. **`create_skill` scaffold (`packages/cli/src/commands/create-skill.ts`)**
   - New `## Capability Roles` section in the generated `SKILL.md` template with
     Defines / Provides / Consumes prompts, so every newly-scaffolded skill
     prompts its author for the three roles. This is the checklist surfaced by the
     `mcp__harness__create_skill` MCP tool (which calls `generateSkillFiles`).

4. **Test (`packages/cli/tests/commands/create-skill.test.ts`)**
   - New test asserting the generated SKILL.md contains the `## Capability Roles`
     section and all three role prompts.

## Non-changes

- No `@harness-engineering/core` export added → no `generate-core-barrel.mjs`
  allowlist change needed.
- Pure docs/CLI-template change → publishable-package impact assessed against the
  changeset gate.

## Verification

- `pnpm --filter @harness-engineering/cli test create-skill` (new + existing green).
- `pnpm generate:plugin:all` to refresh plugin artifacts derived from SKILL.md.
- `pnpm generate-docs` for reference-doc freshness if applicable.
- Full pre-commit / pre-push gauntlet (harness ci check) with built dist.
