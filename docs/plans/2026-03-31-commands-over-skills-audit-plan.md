# Plan: Commands-Over-Skills Audit (Phase 5 of Context Efficiency Pipeline)

**Date:** 2026-03-31
**Spec:** docs/changes/context-efficiency-pipeline/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

All SKILL.md files use CLI commands instead of MCP tool invocations when pass/fail or human-readable output is sufficient, and a written guideline documents the MCP-vs-CLI decision boundary.

## Observable Truths (Acceptance Criteria)

1. A decision guideline document exists at `docs/guidelines/mcp-vs-cli.md` explaining when to use MCP tools vs CLI commands, with concrete examples.
2. When `harness-codebase-cleanup/SKILL.md` references dead code detection, it uses `harness cleanup --type dead-code` as the primary method (not `detect_entropy` MCP tool as primary).
3. When `harness-codebase-cleanup/SKILL.md` references hotspot detection, it uses `git log` analysis directly (not `harness skill run harness-hotspot-detector` as primary).
4. When `harness-pre-commit-review/SKILL.md` references security scanning, it uses `harness check-security --changed-only` (not `run_security_scan` MCP tool as primary).
5. When `harness-security-review/SKILL.md` references security scanning in Phase 1, it uses `harness check-security` as the primary method (not `run_security_scan` MCP tool).
6. When `harness-verify/SKILL.md` references roadmap sync, the MCP tool usage is retained (justified: branching on structured JSON response fields).
7. `harness validate` passes after all changes.

## Audit Findings Summary

The audit scanned all 77 SKILL.md files under `agents/skills/claude-code/*/SKILL.md`. The following categories of invocations were identified:

### Category A: MCP Tool Where CLI Suffices (Offenders -- Fix)

| #   | Skill                     | Current Pattern                                 | Simpler Alternative                                         | Reason                                                                                |
| --- | ------------------------- | ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | harness-codebase-cleanup  | `detect_entropy` MCP tool as alternative to CLI | `harness cleanup --type dead-code --json` (already listed!) | MCP presented as co-equal; CLI is sufficient since output is pass/fail + finding list |
| 2   | harness-codebase-cleanup  | `harness skill run harness-hotspot-detector`    | Inline `git log` analysis (already provided as fallback)    | Skill invocation is wasteful; the git log command is right there in the same step     |
| 3   | harness-pre-commit-review | `run_security_scan` MCP tool (primary)          | `harness check-security --changed-only`                     | Pass/fail + findings list; no structured JSON branching needed                        |
| 4   | harness-security-review   | `run_security_scan` MCP tool (primary, Phase 1) | `harness check-security`                                    | Mechanical scan phase is pass/fail; CLI provides same output                          |

### Category B: MCP Tool Justified (Keep)

| Skill                     | Pattern                                                    | Justification                                                              |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| harness-autopilot         | `gather_context` MCP tool                                  | Branches on structured JSON fields (state, learnings, handoff, validation) |
| harness-execution         | `gather_context` MCP tool                                  | Same -- structured multi-field response                                    |
| harness-pre-commit-review | `review_changes` MCP tool                                  | Returns structured ReviewFinding objects for dedup/merge                   |
| harness-verify            | `manage_roadmap` MCP tool                                  | Branches on sync result fields                                             |
| harness-execution         | `manage_roadmap` MCP tool                                  | Branches on sync result fields                                             |
| harness-roadmap           | `manage_roadmap` MCP tool                                  | Core purpose of skill -- structured CRUD                                   |
| harness-dependency-health | `query_graph` / `get_relationships` / `check_dependencies` | Returns structured graph data for analysis                                 |
| harness-impact-analysis   | `query_graph` / `get_impact` / `get_relationships`         | Returns structured graph data for impact tracing                           |
| harness-hotspot-detector  | `query_graph` / `get_impact` / `get_relationships`         | Returns structured graph data                                              |

### Category C: Cross-Skill References (Not Offenders)

| Skill                 | Pattern                                            | Status                                                         |
| --------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| harness-i18n-process  | Suggests `harness skill run harness-i18n-workflow` | Appropriate -- user-facing suggestion, not internal invocation |
| harness-brainstorming | "invoke harness-planning"                          | Appropriate -- skill transition, not wasteful invocation       |
| Various skills        | "NOT for X (use harness-Y)" in When to Use         | Appropriate -- routing guidance, not invocations               |

**Top 5 offenders to fix:** Items 1-4 from Category A, plus writing the guideline (item 5).

## File Map

- CREATE `docs/guidelines/mcp-vs-cli.md`
- MODIFY `agents/skills/claude-code/harness-codebase-cleanup/SKILL.md` (demote MCP to fallback, promote CLI; promote inline git log over skill invocation)
- MODIFY `agents/skills/claude-code/harness-pre-commit-review/SKILL.md` (replace MCP primary with CLI)
- MODIFY `agents/skills/claude-code/harness-security-review/SKILL.md` (replace MCP primary with CLI)

## Tasks

### Task 1: Audit and Document Findings

**Depends on:** none
**Files:** (read-only audit -- no files modified)

1. Read all 77 SKILL.md files and identify every MCP tool invocation and cross-skill invocation.
2. Classify each into Category A (offender), Category B (justified), or Category C (not an invocation).
3. For each Category A item, identify the CLI equivalent and the reason the MCP tool is unnecessary.
4. Produce a summary matching the "Audit Findings Summary" section above. This summary will be embedded in the guideline document (Task 2) and used to guide Tasks 3-5.
5. Run: `harness validate`
6. No commit -- this is a research task.

**Verification:** The audit identifies at least 3 offenders (spec requires 3-5). The classification logic matches the decision boundary: MCP when branching on structured JSON, CLI when pass/fail.

---

### Task 2: Write MCP-vs-CLI Decision Guideline

**Depends on:** Task 1
**Files:** `docs/guidelines/mcp-vs-cli.md`

1. Create directory if needed: `mkdir -p docs/guidelines`
2. Create `docs/guidelines/mcp-vs-cli.md` with the following content:

```markdown
# MCP vs CLI: Decision Guideline

> When should a SKILL.md instruct the agent to use an MCP tool vs a CLI command via Bash?

## Decision Rule

**Use CLI via Bash when:**

- The output is pass/fail (exit code is sufficient)
- The output is human-readable text (findings list, validation report)
- You do not need to branch on specific fields in structured output
- The command has a direct `harness` CLI equivalent

**Use MCP tool when:**

- You need to branch on specific fields in a structured JSON response
- You need to parse and transform the response programmatically
- The tool returns structured data (graph queries, context bundles, CRUD results)
- No CLI equivalent exists for the operation

## Quick Reference

| Operation              | Use | Command/Tool                                                                                 |
| ---------------------- | --- | -------------------------------------------------------------------------------------------- |
| Project validation     | CLI | `harness validate`                                                                           |
| Dependency checking    | CLI | `harness check-deps`                                                                         |
| Documentation checking | CLI | `harness check-docs`                                                                         |
| Security scanning      | CLI | `harness check-security`                                                                     |
| Dead code detection    | CLI | `harness cleanup --type dead-code`                                                           |
| Doc drift detection    | CLI | `harness cleanup --type drift`                                                               |
| Architecture checking  | CLI | `harness check-arch`                                                                         |
| Performance checking   | CLI | `harness check-perf`                                                                         |
| Drift auto-fix         | CLI | `harness fix-drift`                                                                          |
| Hotspot detection      | CLI | `git log --format=format: --name-only --since="6 months ago" \| sort \| uniq -c \| sort -rn` |
| Load working context   | MCP | `gather_context` (branches on state/learnings/handoff fields)                                |
| Graph queries          | MCP | `query_graph`, `get_impact`, `get_relationships` (structured graph data)                     |
| Roadmap CRUD           | MCP | `manage_roadmap` (structured sync results)                                                   |
| Code review dispatch   | MCP | `review_changes` (structured ReviewFinding objects)                                          |

## Anti-Patterns

1. **MCP for pass/fail checks.** If you only check whether the command succeeded or failed, use CLI. Example: `harness check-security` instead of `run_security_scan` MCP tool.
2. **Skill invocation for inline operations.** If the operation is a single command (e.g., `git log` for hotspot analysis), run it directly instead of invoking another skill via `harness skill run`.
3. **MCP with fallback to CLI.** If the SKILL.md says "use MCP tool, or if unavailable, use CLI" and the CLI provides the same information, just use CLI. The fallback pattern wastes tokens describing two paths.

## When to Add `--json` to CLI

Some CLI commands support `--json` for machine-readable output. Use `--json` when:

- The SKILL.md needs to parse specific fields from the output (e.g., violation counts, file paths)
- The output feeds into a structured report

Even with `--json`, prefer CLI over MCP if you are not branching on the response structure.
```

3. Run: `harness validate`
4. Commit: `docs: add MCP-vs-CLI decision guideline for SKILL.md authoring`

**Verification:** `docs/guidelines/mcp-vs-cli.md` exists and covers both decision rules and the quick reference table.

---

### Task 3: Fix harness-codebase-cleanup -- Demote MCP, Promote CLI and Inline Git

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-codebase-cleanup/SKILL.md`

1. Read `agents/skills/claude-code/harness-codebase-cleanup/SKILL.md` fully.

2. In Phase 1 (CONTEXT), line 29, change:

   **Before:**

   ```markdown
   1. **Run hotspot detection** via `harness skill run harness-hotspot-detector` or equivalent git log analysis:
   ```

   **After:**

   ```markdown
   1. **Run hotspot detection** via git log analysis:
   ```

   Remove the `harness skill run harness-hotspot-detector` reference. The git log command on the next line is the correct approach -- it is a single bash command, not worth invoking a separate skill.

3. In Phase 2 (DETECT), lines 40-41, change:

   **Before:**

   ```markdown
   - Run `harness cleanup --type dead-code --json`
   - Or use the `detect_entropy` MCP tool with `type: 'dead-code'`
   ```

   **After:**

   ```markdown
   - Run `harness cleanup --type dead-code --json`
   ```

   Remove the MCP alternative. The CLI command provides the same output.

4. In the Harness Integration section, lines 207-208, change:

   **Before:**

   ```markdown
   - **`harness skill run harness-hotspot-detector`** -- Hotspot context for safety classification
   - **`detect_entropy` MCP tool with `autoFix: true`** -- Detects entropy and applies safe fixes via the MCP server
   ```

   **After:**

   ```markdown
   - **`git log` analysis** -- Hotspot context for safety classification (inline command, no skill invocation needed)
   ```

   Remove both the skill invocation reference and the MCP tool reference from the integration section.

5. Run: `harness validate`
6. Commit: `refactor(skills): replace MCP and skill invocations with CLI in codebase-cleanup`

**Verification:** `harness-codebase-cleanup/SKILL.md` no longer references `detect_entropy` MCP tool or `harness skill run harness-hotspot-detector`. The `harness cleanup` CLI command and inline git log are the primary methods.

---

### Task 4: Fix harness-pre-commit-review -- Replace MCP Security Scan with CLI

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-pre-commit-review/SKILL.md`

1. Read `agents/skills/claude-code/harness-pre-commit-review/SKILL.md` fully.

2. In Phase 3 (Security Scan), around line 153, change:

   **Before:**

   ```markdown
   Use the `run_security_scan` MCP tool or invoke the scanner on the staged files. Report any findings:
   ```

   **After:**

   ```markdown
   Run `harness check-security --changed-only` on the staged files. Report any findings:
   ```

   The CLI command provides the same pass/fail + findings output. No structured JSON branching is needed here.

3. Verify that the `review_changes` MCP tool reference (around line 172) is NOT changed -- this one is justified because it returns structured `ReviewFinding` objects that the skill branches on.

4. Run: `harness validate`
5. Commit: `refactor(skills): replace MCP security scan with CLI in pre-commit-review`

**Verification:** `harness-pre-commit-review/SKILL.md` uses `harness check-security --changed-only` for security scanning. The `review_changes` MCP tool reference is unchanged.

---

### Task 5: Fix harness-security-review -- Replace MCP Security Scan with CLI

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-security-review/SKILL.md`

1. Read `agents/skills/claude-code/harness-security-review/SKILL.md` fully.

2. In Phase 1 (Mechanical Scan), around lines 58-65, change:

   **Before:**

   ````markdown
   1. **Run the scanner.** Use the `run_security_scan` MCP tool or invoke `SecurityScanner` directly:

      ```bash
      # Via MCP
      harness scan --security

      # Via CLI
      npx vitest run packages/core/tests/security/
      ```
   ````

   ````

   **After:**
   ```markdown
   1. **Run the scanner.** Use the `harness check-security` CLI command:

      ```bash
      harness check-security
   ````

   For machine-readable output, add `--json`. For scanning only changed files, add `--changed-only`.

   ```

   The mechanical scan phase is pass/fail. No structured JSON branching is needed.

   ```

3. In the Harness Integration section (around line 152), change:

   **Before:**

   ```markdown
   - **`run_security_scan` MCP tool** -- Run the mechanical scanner programmatically
   ```

   **After:**

   ```markdown
   - **`harness check-security`** -- Run the mechanical scanner via CLI. Use `--json` for machine-readable output.
   ```

4. Run: `harness validate`
5. Commit: `refactor(skills): replace MCP security scan with CLI in security-review`

**Verification:** `harness-security-review/SKILL.md` uses `harness check-security` for Phase 1 scanning. No `run_security_scan` MCP reference remains in the mechanical scan instructions.

---

### Task 6: Final Validation and Regression Check

**Depends on:** Tasks 3, 4, 5
**Files:** (none created -- validation only)

[checkpoint:human-verify]

1. Run: `harness validate` -- must pass.
2. Verify each observable truth:
   - `docs/guidelines/mcp-vs-cli.md` exists with decision rules and quick reference table.
   - `harness-codebase-cleanup/SKILL.md` uses CLI and git log (no `detect_entropy`, no `harness skill run harness-hotspot-detector`).
   - `harness-pre-commit-review/SKILL.md` uses `harness check-security --changed-only` (no `run_security_scan` MCP as primary).
   - `harness-security-review/SKILL.md` uses `harness check-security` (no `run_security_scan` MCP as primary).
   - `harness-verify/SKILL.md` still uses `manage_roadmap` MCP tool (unchanged -- justified).
3. Verify no regressions: scan all modified SKILL.md files for broken markdown (unbalanced code fences, broken tables).
4. Run: `harness validate`
5. Commit: (no commit -- validation only, unless fixes are needed)

**Verification:** All observable truths confirmed. `harness validate` passes.
