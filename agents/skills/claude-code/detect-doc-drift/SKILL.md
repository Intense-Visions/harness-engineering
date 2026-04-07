# Detect Doc Drift

> Detect documentation that has drifted from code. Find stale docs before they mislead developers and AI agents.

## When to Use

- After completing a feature, bug fix, or refactoring
- During code review — check if the changed files have associated docs that need updating
- As a periodic hygiene check (weekly or per-sprint)
- When `on_post_feature` or `on_doc_check` triggers fire
- When onboarding reveals confusion caused by outdated documentation
- NOT during active development — wait until the code is stable before checking docs
- NOT for writing new documentation from scratch (use align-documentation instead)

## Process

### Phase 1: Scan — Run Drift Detection

1. **Run `harness check-docs`** to identify all documentation issues. Capture the full output.

2. **Run `harness cleanup --type drift`** for a deeper analysis that cross-references code changes against documentation references.

3. **Optionally, run `git diff` against a baseline** (last release, last sprint, etc.) to identify which code files changed. This helps prioritize — docs for recently changed files are most likely to be drifted.

### Graph-Enhanced Context (when available)

When a knowledge graph exists at `.harness/graph/`, use graph queries for faster, more accurate drift detection:

- `query_graph` — find `documents` edges where the target code node has changed since the doc node was last updated

When a graph is available, drift is simply stale edges: doc-to-code edges where the code side has been modified more recently than the doc side. This replaces regex pattern matching and catches semantic drift that text search misses. Fall back to file-based commands if no graph is available.

### Pipeline Context (when orchestrated)

When invoked by `harness-docs-pipeline`, check for a `pipeline` field in `.harness/handoff.json`:

- If `pipeline` field exists: read `DocPipelineContext` from it
  - Use `pipeline.exclusions` to skip findings that were already addressed in a previous phase
  - Write `DriftFinding[]` results back to `pipeline.driftFindings` in handoff.json
  - This enables the orchestrator to track findings across phases and avoid double-counting
- If `pipeline` field does not exist: behave exactly as today (standalone mode)

No changes to the skill's interface or output format — the pipeline field is purely additive.

### Phase 2: Identify — Classify Drift Types

Categorize each finding into one of these drift types:

**Renamed but not updated:**
A function, class, variable, or file was renamed in code, but documentation still references the old name. This is the most common type of drift.

- Example: `calculateShipping()` was renamed to `computeShippingCost()`, but AGENTS.md and three inline comments still say `calculateShipping`.

**New code with no docs:**
A new module, function, or API was added but no documentation entry exists. This is not "drift" in the strict sense but a gap that grows into drift over time.

- Example: `src/services/notification-service.ts` was added two sprints ago. It has 5 public exports. No AGENTS.md section, no doc page, no inline doc comments beyond basic JSDoc.

**Deleted code still referenced:**
A file, function, or feature was removed, but documentation still describes it as if it exists. This actively misleads readers.

- Example: `src/utils/legacy-parser.ts` was deleted. The architecture doc still includes it in the data flow diagram. AGENTS.md still warns about its quirks.

**Changed behavior not reflected:**
A function's signature, return type, error handling, or side effects changed, but the documentation describes the old behavior.

- Example: `createUser()` now throws `ValidationError` instead of returning `null` on invalid input. The API docs still say "returns null if validation fails."

**Moved code with stale paths:**
A file or module was moved to a different directory, but documentation references the old path.

- Example: `src/helpers/format.ts` was moved to `src/utils/format.ts`. Three doc files and AGENTS.md reference the old path.

### Phase 3: Prioritize — Rank by Impact

Not all drift is equally harmful. Prioritize fixes:

**Critical (fix immediately):**

- Public API documentation that describes wrong behavior — external consumers will write broken code
- AGENTS.md sections that reference deleted files — AI agents will hallucinate about non-existent code
- README getting-started guides with wrong commands — new developers cannot onboard

**High (fix before next release):**

- Internal API docs with wrong signatures — developers waste time debugging
- Architecture docs with stale diagrams — wrong mental models lead to wrong decisions
- Frequently accessed docs with broken links — high-traffic pages with dead ends

**Medium (fix in next sprint):**

- Internal docs for stable code — low change rate means low confusion rate
- Comments in rarely modified files — few people read them
- Edge case documentation — affects few users

**Low (fix when convenient):**

- Stylistic inconsistencies in docs (capitalization, formatting)
- Redundant documentation that says the same thing in multiple places
- Historical notes that are outdated but clearly marked as historical

### Phase 4: Report — Generate Actionable Output

For each drift finding, provide:

1. **File and line number** of the drifted documentation
2. **The specific stale content** (quote the exact text that is wrong)
3. **What changed in code** (the commit, file, and nature of the change)
4. **Suggested fix** (the replacement text or action needed)
5. **Priority tier** (Critical / High / Medium / Low)

Group findings by documentation file so that fixes can be applied file-by-file.

## Harness Integration

- **`harness check-docs`** — Primary tool. Scans all documentation files for broken references, stale paths, and missing entries.
- **`harness cleanup --type drift`** — Deeper analysis that cross-references git history with documentation references to detect semantic drift.
- **`harness cleanup --type drift --json`** — Machine-readable output for automated pipelines.
- **`harness fix-drift`** — Auto-fix simple drift issues after review (use align-documentation skill for applying fixes).

## Success Criteria

- `harness check-docs` reports zero errors
- All file paths referenced in documentation resolve to existing files
- All function/class names referenced in documentation match current code
- All API documentation matches current function signatures and behavior
- No documentation references deleted files, functions, or features
- Drift findings are prioritized and assigned to the appropriate fix cycle

## Rationalizations to Reject

| Rationalization                                                           | Why It Is Wrong                                                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| "The docs are close enough -- a renamed function is obvious from context" | Renamed references in AGENTS.md cause AI agents to hallucinate about non-existent code. Precision matters.                           |
| "We only changed internal code, so the docs do not need checking"         | Internal API docs with wrong signatures waste developer debugging time. Changed-behavior-not-reflected drift is High priority.       |
| "There are too many findings to deal with right now, so skip the scan"    | The escalation protocol exists for this case: focus on Critical and High items, create a tracking issue for the rest.                |
| "We can rely on code review to catch stale docs"                          | Code reviewers focus on code correctness, not documentation cross-references. harness check-docs catches what humans routinely miss. |

## Examples

### Example: Renamed function detected

**Drift finding:**

```
DRIFT: Renamed reference detected
  Doc: AGENTS.md:47
  Stale text: "Use `calculateShipping()` to compute shipping costs"
  Code change: calculateShipping renamed to computeShippingCost (commit a1b2c3d)
  File: src/services/shipping.ts:24
  Priority: High
  Suggested fix: Replace `calculateShipping()` with `computeShippingCost()`
```

### Example: Deleted file still documented

**Drift finding:**

```
DRIFT: Reference to deleted file
  Doc: docs/architecture.md:112
  Stale text: "The legacy parser (src/utils/legacy-parser.ts) handles XML input"
  Code change: File deleted in commit d4e5f6g, functionality merged into unified-parser.ts
  Priority: Critical
  Suggested fix: Update section to reference unified-parser.ts, remove legacy parser description
```

### Example: New module with no documentation

**Drift finding:**

```
GAP: Undocumented module
  File: src/services/notification-service.ts
  Created: commit h7i8j9k (3 weeks ago)
  Public exports: NotificationService, NotificationType, sendNotification
  Imported by: 4 modules
  Documentation references: 0
  Priority: High
  Suggested fix: Add AGENTS.md section describing purpose, constraints, and public API
```

## Escalation

- **When drift is extensive (>30 findings):** Do not try to fix everything. Focus on Critical and High priority items. Create a tracking issue for the remaining items and schedule them across sprints.
- **When you cannot determine the correct replacement text:** The code change may have been complex. Check the commit message and PR description for context. If still unclear, flag the finding for the original author to resolve.
- **When documentation is in a format you cannot parse:** Some docs may be in wiki pages, Confluence, or other external systems. Report the finding with a link and flag it for manual review.
- **When drift reveals a deeper problem (code changed but nobody knew):** This suggests a process gap. Recommend adding `harness check-docs` to the CI pipeline or pre-merge hooks to catch drift at the source.
