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

## Targeted retrofit (stage: retrofit)

The guidance + scaffold above make every _new_ skill declare its capability
roles. This stage retrofits the same `## Capability Roles` block (Defines /
Provides / Consumes, the exact shape emitted by the `create_skill` scaffold) onto
the small set of _existing_ skills that genuinely define a capability **seam** — an
interface/contract with distinct provider(s) and consumer(s). This is deliberately
**not** a blanket retrofit of all ~789 skills: a forced roles block on a non-seam
leaf workflow is exactly the accidental-single-implementation anti-pattern this
work exists to reject.

Three real seams were retrofitted (17 skills total):

1. **Design verifier interface** — Service Definition: the `Verifier<F, Cat, Meta>`
   interface (`packages/cli/src/shared/verifier.ts`) composed generically via
   `VerifierRegistry` (`packages/cli/src/design-pipeline/registry.ts`).
   - Consumer: `harness-design-pipeline` (and `harness check-design`).
   - Providers: `detect-design-drift` (`Verifier<DriftFinding>`),
     `audit-component-anatomy` (`Verifier<AnatomyFinding>`),
     `audit-brand-compliance` (`Verifier<BrandFinding>`).

2. **Craft LLM-judgment-critique** — Service Definition: the shared craft critique
   contract in `packages/cli/src/shared/craft/` (`LlmProvider` + finding/axes
   schema + run store) that every `*-craft` skill's critique phase conforms to.
   - Consumer: `craft-fleet` (the craft-pipeline elevation sweep).
   - Providers: `naming-craft`, `spec-craft`, `code-craft`, `security-craft`,
     `test-craft`, `api-craft`, `cli-ergonomics-craft`, `copy-craft`, `docs-craft`,
     `harness-design-craft`, `knowledge-craft`.

3. **Fleet family spine** — Service Definition: the shared `-fleet` handoff
   contract (`docs/reference/fleet-family.md`; concretized as `FleetHandoffRecord`
   by #1414, which this block is written to stay consistent with, not contradict).
   - Consumer: `fleet-command`.
   - Providers (named in-block): the eleven `-fleet` members.

### Retrofit assumptions / scope decisions

- **`harness-docs-pipeline` and its sub-skills were SKIPPED as a non-seam.** Unlike
  `harness-design-pipeline`, the docs pipeline does **not** consume the formal
  `Verifier<F>` interface or a verifier registry (no `shared/verifier` import); it
  is a fixed 4-phase orchestrator over named sub-skills, not a swappable-provider
  extension point. Retrofitting it would have invented a seam.
- **`harness-design-craft` is placed in the craft seam, not the verifier seam.** It
  is dispatched by `harness-design-pipeline` in the FILL phase but is deliberately
  **not** registered as a `Verifier<F>` (different output shape), so it is a craft
  Provider, not a verifier Provider. Its block records both facts.
- **Only `fleet-command` (the Consumer) was retrofitted for the fleet seam, not the
  eleven members individually.** The concrete Service Definition (`FleetHandoffRecord`)
  is still in flight in #1414; stamping every member now risks contradicting a
  not-yet-landed record, and the seam is fully declared once at the Consumer with
  the members named in-block. (`craft-fleet` still carries its own block, but for
  the craft seam it consumes; its role as a fleet Provider is noted there.)
- **Candidate 4 (standalone MCP tool provider/consumer pairs) yielded no additional
  seam.** The concrete MCP tool contracts here (`audit_anatomy`, `audit_brand`,
  `detect_drift`, and the `*_craft` tools) ARE the verifier and craft seams already
  retrofitted above; no distinct MCP-only seam skill was found worth its own block.
- **Mirror handling:** `craft-fleet` and `fleet-command` have symlinked platform
  mirrors (edit claude-code → all four update); the other 15 skills have
  byte-identical **copy** mirrors, so each was re-synced to all three mirror dirs
  (cursor/codex/gemini-cli) byte-identically after the claude-code edit. The mirror
  pattern is per-skill, not uniform.
