# Plan: Docs Phase 4 — Skills Catalog Generator Reconciliation

**Date:** 2026-04-01
**Spec:** docs/changes/docs-auto-generation/proposal.md
**Estimated tasks:** 2
**Estimated time:** 8 minutes

## Goal

Verify and reconcile the existing skills catalog generator in `scripts/generate-docs.mjs` against the spec requirements, fixing the one identified gap: missing link to the features overview.

## Reconciliation Analysis

The skills catalog generator is approximately 95% complete. It correctly:

- Globs `agents/skills/claude-code/*/skill.yaml` (80 skills found, 80 directories exist)
- Parses all required YAML fields: name, tier, description, triggers, platforms, cognitive_mode, type, depends_on
- Groups by tier (Tier 1: 11 Workflow, Tier 2: 20 Maintenance, Tier 3: 49 Domain)
- Sorts alphabetically within each tier
- Outputs to `docs/reference/skills-catalog.md` with the auto-generated header
- Includes a count summary in the intro paragraph

The single gap is:

1. **No features overview link** in the intro text (spec Goal #4: "Generated docs follow a consistent format and link back to the features overview")

This matches the same gap found and fixed in the CLI reference (Phase 2). All three generated docs should include this link for consistency.

## Observable Truths (Acceptance Criteria)

1. When `node scripts/generate-docs.mjs` is run, `docs/reference/skills-catalog.md` is produced with the auto-generated header.
2. The generated skills catalog lists all 80 skills grouped by tier: Tier 1 — Workflow (11), Tier 2 — Maintenance (20), Tier 3 — Domain (49).
3. Each skill entry shows: name, description, triggers, platforms, type, and (when present) cognitive mode and depends_on.
4. Skills are sorted alphabetically within each tier.
5. The generated skills catalog contains a link to `../guides/features-overview.md` in the introductory section.
6. `harness validate` passes after all changes.

## File Map

- MODIFY `scripts/generate-docs.mjs` (add features overview link to skills catalog intro)
- MODIFY `docs/reference/skills-catalog.md` (regenerated output — reflects the link addition)

## Tasks

### Task 1: Add features overview link to skills catalog intro

**Depends on:** none
**Files:** `scripts/generate-docs.mjs`

1. Open `scripts/generate-docs.mjs` and locate the `generateSkillsCatalog` function's intro lines (lines 269-274):

   ```javascript
   const lines = [
     HEADER,
     '# Skills Catalog\n\n',
     `${skills.length} skills across 3 tiers. `,
     'Tier 1 and 2 skills are registered as slash commands. ',
     'Tier 3 skills are discoverable via the `search_skills` MCP tool.\n\n',
   ];
   ```

2. Replace with:

   ```javascript
   const lines = [
     HEADER,
     '# Skills Catalog\n\n',
     `${skills.length} skills across 3 tiers. `,
     'Tier 1 and 2 skills are registered as slash commands. ',
     'Tier 3 skills are discoverable via the `search_skills` MCP tool. ',
     'See the [Features Overview](../guides/features-overview.md) for narrative documentation.\n\n',
   ];
   ```

3. Run: `node scripts/generate-docs.mjs`

4. Verify the generated `docs/reference/skills-catalog.md` contains the link text `[Features Overview](../guides/features-overview.md)` in the introductory paragraph.

5. Run: `npx harness validate`

6. Commit: `fix(docs): add features overview link to skills catalog generator`

### Task 2: Regenerate and verify all three reference docs

**Depends on:** Task 1 (and Phase 3 tasks)
**Files:** `docs/reference/skills-catalog.md`

[checkpoint:human-verify] — Verify all three generated docs are consistent before final commit.

1. Run: `node scripts/generate-docs.mjs`

2. Verify all three reference docs have the features overview link:
   - `grep "Features Overview" docs/reference/cli-commands.md` — should match
   - `grep "Features Overview" docs/reference/mcp-tools.md` — should match
   - `grep "Features Overview" docs/reference/skills-catalog.md` — should match

3. Verify skill counts match:
   - `grep -c "^### " docs/reference/skills-catalog.md` — should be 80
   - The tier headers should show: Tier 1 (11), Tier 2 (20), Tier 3 (49)

4. Spot-check a few skills for completeness:
   - `harness-brainstorming` should show triggers (manual, on_new_feature), platforms (claude-code, gemini-cli), type (rigid), cognitive mode (constructive-architect), depends_on (harness-planning, harness-soundness-review)
   - `harness-pre-commit-review` should show depends_on (harness-code-review) and no cognitive mode (if not set in YAML)

5. Run: `npx harness validate`

6. Commit: `docs(reference): regenerate skills catalog with features overview link`
