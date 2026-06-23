# Plan: Phase 1 — Doc & yaml fixes (S2 + S3)

**Date:** 2026-06-03 | **Spec:** `docs/changes/init-design-roadmap-polish/proposal.md` | **Tasks:** 3 | **Time:** ~8 min | **Integration Tier:** small

## Goal

Land the two cheapest carry-forward items from the parent spec — S2 (rewrite the obsolete `manage_roadmap`-as-creator bullet at `docs/changes/init-design-roadmap-config/proposal.md:146`) and S3 (add `harness-roadmap` to the `initialize-harness-project` `depends_on` list) — as a single doc/yaml polish commit.

## Observable Truths (Acceptance Criteria)

1. `docs/changes/init-design-roadmap-config/proposal.md:146` no longer contains the substring `Roadmap operations go through \`manage_roadmap\` MCP tool, not a skill`; the replacement bullet asserts that the init skill invokes the `harness-roadmap`skill to create`docs/roadmap.md`and then uses`manage_roadmap.add` to register the design-system roadmap item.
2. The `### Registrations Required` section in `docs/changes/init-design-roadmap-config/proposal.md` still contains exactly four bullets after the edit (D8: bullet count preserved; only the affected bullet's body changes).
3. The `### Registrations Required` heading text is unchanged.
4. `agents/skills/claude-code/initialize-harness-project/skill.yaml` `depends_on` list contains the three entries `initialize-test-suite-project`, `harness-design-system`, `harness-roadmap` in that exact order (D9: insertion under the existing `harness-design-system` line, no resort).
5. `harness validate` exits 0 after the edits.
6. A single commit on the working branch captures both the proposal.md and skill.yaml edits together; no unrelated files are staged.

## File Map

- MODIFY `docs/changes/init-design-roadmap-config/proposal.md` (rewrite line 146 bullet body only)
- MODIFY `agents/skills/claude-code/initialize-harness-project/skill.yaml` (append one yaml list entry under line 37)

No new files. No deletions. No directory creation.

## Skeleton

_Not produced — task count (3) below the standard-mode threshold of 8. Proceeding directly to full tasks._

## Tasks

### Task 1: Rewrite the obsolete Registrations bullet at proposal.md:146 (S2)

**Depends on:** none | **Files:** `docs/changes/init-design-roadmap-config/proposal.md`

Current state at line 146 (verified via Read):

```
- Roadmap operations go through `manage_roadmap` MCP tool, not a skill — no `depends_on` entry needed.
```

This bullet is obsolete: the final design has the init skill invoke the `harness-roadmap` skill to create `docs/roadmap.md` first, then call `manage_roadmap.add` to register the design-system item. Per D8, only this single bullet's body changes — the `### Registrations Required` heading and the four-bullet structure are preserved.

1. Apply this exact edit to `docs/changes/init-design-roadmap-config/proposal.md`:
   - **old_string:**
     ```
     - Roadmap operations go through `manage_roadmap` MCP tool, not a skill — no `depends_on` entry needed.
     ```
   - **new_string:**
     ```
     - The init skill invokes the `harness-roadmap` skill to create `docs/roadmap.md`, then calls `manage_roadmap.add` to register the design-system item — add `harness-roadmap` to `depends_on` alongside `harness-design-system`.
     ```
2. Read lines 141–147 of the edited file. Confirm:
   - Line 141 is still `### Registrations Required`.
   - Lines 143, 144, 145, 146 are all bullets starting with `- ` (four bullets total).
   - Line 146 now starts with `- The init skill invokes the \`harness-roadmap\` skill`.
   - Line 147 is still a blank line followed by the next `###` section heading.
3. Do not stage or commit yet — Task 3 commits both edits together.

### Task 2: Add `- harness-roadmap` to skill.yaml depends_on (S3)

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/initialize-harness-project/skill.yaml`

Current state at lines 35–37 (verified via Read):

```
depends_on:
  - initialize-test-suite-project
  - harness-design-system
```

Per D9, insert `- harness-roadmap` literally under the existing `harness-design-system` line — no alphabetical resort.

1. Apply this exact edit to `agents/skills/claude-code/initialize-harness-project/skill.yaml`:
   - **old_string:**
     ```
     depends_on:
       - initialize-test-suite-project
       - harness-design-system
     ```
   - **new_string:**
     ```
     depends_on:
       - initialize-test-suite-project
       - harness-design-system
       - harness-roadmap
     ```
2. Read lines 35–38 of the edited file. Confirm the three list entries appear in that exact order with two-space indentation (matching the existing yaml style).
3. Do not stage or commit yet — Task 3 commits both edits together.

### Task 3: Validate and commit both edits as a single Phase 1 commit

**Depends on:** Task 2 | **Files:** (none — verification and commit only)

1. Run `harness validate` from the repo root. Confirm exit code 0. The 290 pre-existing arch-baseline warnings (carry-forward from prior phases) are expected and do not block this phase; only an exit-non-zero or a _new_ failure category is a blocker.
2. Run `git diff --stat docs/changes/init-design-roadmap-config/proposal.md agents/skills/claude-code/initialize-harness-project/skill.yaml`. Confirm exactly two files appear in the diff and the change sizes are small (proposal.md: 1 line changed; skill.yaml: 1 line added).
3. Run `git diff docs/changes/init-design-roadmap-config/proposal.md agents/skills/claude-code/initialize-harness-project/skill.yaml` and visually verify both edits match Task 1 and Task 2 exactly. No unrelated hunks should appear.
4. Stage the two files explicitly (do not use `git add -A` — there are unrelated pre-existing modifications in the working tree per the session's initial git status):
   ```bash
   git add docs/changes/init-design-roadmap-config/proposal.md agents/skills/claude-code/initialize-harness-project/skill.yaml
   ```
5. Commit with a heredoc message:

   ```bash
   git commit -m "$(cat <<'EOF'
   docs(init-design-roadmap-polish): land S2 + S3 doc/yaml fixes

   - S2: rewrite proposal.md:146 Registrations bullet to reflect the
     final design (harness-roadmap skill creates docs/roadmap.md;
     manage_roadmap.add registers the design-system item). Preserves
     section heading and four-bullet structure per D8.
   - S3: add harness-roadmap to initialize-harness-project skill.yaml
     depends_on, inserted under harness-design-system per D9 (no resort).

   Closes the two cheapest carry-forward items from
   init-design-roadmap-config Phase 5; remaining FINAL-S1/S2/S3 items
   continue in subsequent polish phases.
   EOF
   )"
   ```

6. Run `git status` and confirm the commit landed (no staged files; commit visible at `HEAD` via `git log -1 --oneline`).
7. Run `harness validate` one final time. Confirm exit code 0.

## Uncertainties

- **[ASSUMPTION]** The bullet rewrite wording in Task 1 ("The init skill invokes the `harness-roadmap` skill to create `docs/roadmap.md`, then calls `manage_roadmap.add` to register the design-system item — add `harness-roadmap` to `depends_on` alongside `harness-design-system`.") matches the corrected design described in spec sections "In Scope" (S2 bullet) and Success Criteria #1. If the reviewer prefers different phrasing, the edit is a single-line revision and does not affect Task 2 or Task 3.
- **[DEFERRABLE]** `pnpm run generate-docs --check` for skills-catalog drift from the `depends_on` change is explicitly deferred to Phase 5 (per the spec's Implementation Order) — not in scope for this phase's commit.

## Notes on Integration Tier

This plan is **small**: no new entry points, no new registrations beyond the declarative `depends_on` addition (which is itself documentation per the spec's Integration Points S3 note), no new files, no architectural decisions. Wiring checks via `harness validate` are sufficient; project-level updates (roadmap, changelog, graph enrichment) are not required for this phase.
