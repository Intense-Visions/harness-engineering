# Plan: i18n Integration Wiring (Phase 5)

**Date:** 2026-03-20
**Spec:** docs/changes/i18n-localization-skills/proposal.md
**Estimated tasks:** 6
**Estimated time:** 20 minutes

## Goal

Wire the three completed i18n skills into four existing harness skills (integrity, release-readiness, initialize-harness-project, accessibility) so that i18n checks participate in quality gates, project initialization, and accessibility deduplication, and document the graph integration design for future implementation.

## Observable Truths (Acceptance Criteria)

1. When `i18n.enabled: true` in `harness.config.json`, `harness-integrity` includes an i18n scan phase between design health and review, and the unified report includes an `i18n` line item.
2. When `i18n.enabled` is false or absent, `harness-integrity` skips the i18n phase entirely.
3. When `harness-release-readiness` runs, it checks translation coverage against `coverage.minimumPercent` and blocks release in strict mode if below threshold.
4. When `harness-initialize-project` runs, Phase 3 (CONFIGURE) asks about i18n requirements and invokes `harness-i18n-workflow` configure + scaffold if the answer is yes.
5. When `harness-i18n` is enabled, `harness-accessibility` defers `lang` attribute (A11Y not assigned a code but referenced in scan) and `dir` attribute checks to the i18n skill to avoid duplicate findings.
6. The proposal document contains a "Graph Integration Design" section documenting `translation_key` nodes, `locale_coverage` nodes, and `TRANSLATED_IN`/`USED_BY`/`MISSING_IN` edges for future schema extension.
7. Every modified SKILL.md is byte-identical between `agents/skills/claude-code/` and `agents/skills/gemini-cli/`.
8. `harness validate` passes after all modifications.

## File Map

```
MODIFY agents/skills/claude-code/harness-integrity/SKILL.md
MODIFY agents/skills/gemini-cli/harness-integrity/SKILL.md
MODIFY agents/skills/claude-code/harness-release-readiness/SKILL.md
MODIFY agents/skills/gemini-cli/harness-release-readiness/SKILL.md
MODIFY agents/skills/claude-code/initialize-harness-project/SKILL.md
MODIFY agents/skills/gemini-cli/initialize-harness-project/SKILL.md
MODIFY agents/skills/claude-code/harness-accessibility/SKILL.md
MODIFY agents/skills/gemini-cli/harness-accessibility/SKILL.md
MODIFY docs/changes/i18n-localization-skills/proposal.md
```

## Tasks

### Task 1: Wire i18n scan into harness-integrity

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-integrity/SKILL.md`, `agents/skills/gemini-cli/harness-integrity/SKILL.md`

1. Open `agents/skills/claude-code/harness-integrity/SKILL.md`.

2. After the `### Phase 1.7: DESIGN HEALTH (conditional)` section (ends at line 55), insert a new section:

   ```markdown
   ### Phase 1.8: I18N SCAN (conditional)

   When the project has `i18n.enabled: true` in `harness.config.json`:

   1. Run `harness-i18n` in scan mode to detect hardcoded strings, missing translations, locale-sensitive formatting issues, and RTL violations.
   2. Combine findings into an i18n health summary:
      - Error count (blocking, based on `i18n.strictness`)
      - Warning count (non-blocking)
      - Info count (advisory)
   3. **Error-severity i18n findings are blocking** in `strict` mode only. In `standard` and `permissive` modes, i18n findings do not block.
   4. If no `i18n` block exists or `i18n.enabled` is false, skip this phase entirely.
   ```

3. In the Phase 3: REPORT section, update the report format to include an `i18n` line. After the `- Design:` line, add:

   ```
   - i18n:     [PASS/WARN/FAIL/SKIPPED] ([count] errors, [count] warnings)
   ```

4. In the "Rules" section under the report, update the overall PASS description to include i18n:

   Replace:

   ```
   - Overall `PASS` requires: all non-skipped mechanical checks pass AND zero blocking review findings AND zero blocking design findings (strict mode only).
   ```

   With:

   ```
   - Overall `PASS` requires: all non-skipped mechanical checks pass AND zero blocking review findings AND zero blocking design findings (strict mode only) AND zero blocking i18n findings (strict mode only).
   ```

5. In the Harness Integration section, add a bullet:

   ```
   - Invokes `harness-i18n` for i18n compliance when `i18n.enabled` is true in config. i18n strictness controls whether findings block the overall result.
   ```

6. In Example: All Clear, add after the Design line:

   ```
   - i18n: PASS (0 errors, 0 warnings)
   ```

7. In Example: Security Blocking Issue, add after the Design line:

   ```
   - i18n: SKIPPED
   ```

8. Copy the modified file byte-for-byte to `agents/skills/gemini-cli/harness-integrity/SKILL.md`.

9. Run: `harness validate`

10. Commit: `feat(i18n): wire harness-i18n scan into harness-integrity as conditional phase`

### Task 2: Wire i18n coverage into harness-release-readiness

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-release-readiness/SKILL.md`, `agents/skills/gemini-cli/harness-release-readiness/SKILL.md`

1. Open `agents/skills/claude-code/harness-release-readiness/SKILL.md`.

2. In the "Standard Checks (always run)" section, after the CI/CD table (ends around line 114), add a new subsection:

   ```markdown
   ##### i18n Coverage (conditional)

   When `i18n.enabled: true` in `harness.config.json`, run these checks:

   | Check                                                                                          | Severity if failing             |
   | ---------------------------------------------------------------------------------------------- | ------------------------------- |
   | Translation coverage meets `i18n.coverage.minimumPercent` for all target locales               | fail (strict) / warn (standard) |
   | No untranslated values (source text in target locale files) when `coverage.detectUntranslated` | warn                            |
   | All CLDR plural forms present for target locales when `coverage.requirePlurals`                | warn                            |
   | No stale translations (source changed since last translation timestamp)                        | warn                            |
   | `harness-i18n` scan passes with zero errors                                                    | fail (strict) / warn (standard) |

   If `i18n.enabled` is false or the `i18n` config block is absent, skip this section entirely and report it as "N/A" in the audit output.
   ```

3. In the AUDIT output format (around line 156-169), add a line after CI/CD:

   ```
   i18n:       N/N passed, N warnings, N failures (or: skipped — i18n not enabled)
   ```

4. In the Harness Integration section (around line 492-498), add a bullet:

   ```
   - **i18n coverage** — When `i18n.enabled: true`, Phase 1 checks translation coverage against configured thresholds. Uses `harness-i18n` scan results and `harness-i18n-workflow` coverage tracking. Blocks release in strict mode if coverage is below `i18n.coverage.minimumPercent`.
   ```

5. Copy the modified file byte-for-byte to `agents/skills/gemini-cli/harness-release-readiness/SKILL.md`.

6. Run: `harness validate`

7. Commit: `feat(i18n): wire i18n coverage checks into harness-release-readiness`

### Task 3: Wire i18n scaffolding into initialize-harness-project

**Depends on:** none
**Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`, `agents/skills/gemini-cli/initialize-harness-project/SKILL.md`

1. Open `agents/skills/claude-code/initialize-harness-project/SKILL.md`.

2. In Phase 3: CONFIGURE, after step 4 (around line 60, the "For advanced" paragraph), add a new step:

   ```markdown
   5. **Configure i18n (all levels).** Ask: "Will this project support multiple languages?" Based on the answer:
      - **Yes:** Invoke `harness-i18n-workflow` configure phase to set up i18n config in `harness.config.json` (source locale, target locales, framework, strictness). Then invoke `harness-i18n-workflow` scaffold phase to create translation file structure and extraction config. Set `i18n.enabled: true`.
      - **No:** Set `i18n.enabled: false` in `harness.config.json`. The `harness-i18n-process` skill will still fire gentle prompts for unconfigured projects when features touch user-facing strings.
      - **Not sure yet:** Skip i18n configuration entirely. Do not set `i18n.enabled`. The project can enable i18n later by running `harness-i18n-workflow` directly.
   ```

3. In the Harness Integration section (around line 89-93), add a bullet:

   ```
   - **`harness-i18n-workflow configure` + `harness-i18n-workflow scaffold`** — Invoked during Phase 3 if the project will support multiple languages. Sets up i18n configuration and translation file structure.
   ```

4. In the Success Criteria section, add:

   ```
   - i18n configuration is set if the human chose to enable it during init
   ```

5. In the Example: New TypeScript Project, in the CONFIGURE section, add after the constraints line:

   ```
   - Ask: "Will this project support multiple languages?"
   - Human: "Yes, Spanish and French."
   - Run harness-i18n-workflow configure (source: en, targets: es, fr)
   - Run harness-i18n-workflow scaffold (creates locales/ directory structure)
   ```

6. Copy the modified file byte-for-byte to `agents/skills/gemini-cli/initialize-harness-project/SKILL.md`.

7. Run: `harness validate`

8. Commit: `feat(i18n): wire i18n scaffolding into initialize-harness-project`

### Task 4: Add accessibility deduplication for i18n overlap

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-accessibility/SKILL.md`, `agents/skills/gemini-cli/harness-accessibility/SKILL.md`

1. Open `agents/skills/claude-code/harness-accessibility/SKILL.md`.

2. In Phase 1: SCAN, after step 2 (reading design strictness, around line 26), insert a new step:

   ```markdown
   2.5. **Check for i18n skill overlap.** Read `harness.config.json` for `i18n.enabled`:

   - If `i18n.enabled: true`, **defer** `lang` and `dir` attribute checks to `harness-i18n`. Do not scan for missing `lang` on `<html>` or missing `dir` on user-content containers -- those checks are covered by the i18n skill's scan phase with more context (locale-aware, RTL-aware).
   - If `i18n.enabled` is false or absent, scan for `lang`/`dir` as normal (these remain part of the accessibility audit).
   - This deduplication prevents the same finding from appearing in both the accessibility report and the i18n report.
   ```

3. In the Harness Integration section (around line 171), add a bullet:

   ```
   - **`harness-i18n` deduplication** -- When `i18n.enabled: true` in config, `lang` and `dir` attribute checks are deferred to the i18n skill. This prevents duplicate findings across the accessibility and i18n reports. When i18n is not enabled, these checks remain part of the accessibility scan.
   ```

4. Copy the modified file byte-for-byte to `agents/skills/gemini-cli/harness-accessibility/SKILL.md`.

5. Run: `harness validate`

6. Commit: `feat(i18n): add accessibility deduplication for lang/dir when i18n enabled`

### Task 5: Document graph integration design in proposal

**Depends on:** none
**Files:** `docs/changes/i18n-localization-skills/proposal.md`

1. Open `docs/changes/i18n-localization-skills/proposal.md`.

2. After the "Implementation Order" section (which ends at line 375), add a new section:

   ```markdown
   ---

   ## Graph Integration Design (Future)

   This section documents the graph schema extensions needed when the knowledge graph (`packages/graph`) is extended to support i18n data. This is a design reference for future implementation -- it is NOT implemented as part of the initial skill rollout.

   ### Node Types

   #### `translation_key`

   Represents a single translatable string key in the codebase.

   | Property      | Type   | Description                                          |
   | ------------- | ------ | ---------------------------------------------------- |
   | `key`         | string | The translation key (e.g., `checkout.summary.total`) |
   | `sourceValue` | string | The value in the source locale                       |
   | `namespace`   | string | Namespace grouping (e.g., `checkout`, `common`)      |
   | `filePath`    | string | File where the key is defined                        |

   #### `locale_coverage`

   Represents the translation coverage state for a specific locale.

   | Property       | Type   | Description                           |
   | -------------- | ------ | ------------------------------------- |
   | `locale`       | string | BCP 47 locale code (e.g., `fr`, `ja`) |
   | `percent`      | number | Overall coverage percentage           |
   | `missingCount` | number | Number of missing translations        |
   | `staleCount`   | number | Number of translations needing update |

   ### Edge Types

   | Edge            | From              | To                  | Description                                 |
   | --------------- | ----------------- | ------------------- | ------------------------------------------- |
   | `TRANSLATED_IN` | `translation_key` | `locale_coverage`   | Key has a translation in the given locale   |
   | `USED_BY`       | `translation_key` | `component`/`route` | Key is referenced by a component or route   |
   | `MISSING_IN`    | `translation_key` | `locale_coverage`   | Key lacks a translation in the given locale |

   ### Example Queries

   - "What components in the checkout flow have missing French translations?" -- Traverse `USED_BY` edges from `translation_key` nodes that have `MISSING_IN` edges to the `fr` locale, filter by component path prefix.
   - "Which translation keys are unused?" -- Find `translation_key` nodes with zero outgoing `USED_BY` edges.
   - "If I change this component, which keys need review?" -- Traverse incoming `USED_BY` edges to find all translation keys referenced by the component.

   ### Fallback Behavior (No Graph)

   When the graph is unavailable (`.harness/graph/` does not exist or is empty), the i18n skills fall back to:

   - **File-based key tracking:** Parse translation files directly, compare key sets across locale files.
   - **Content-aware coverage:** Detect untranslated values (source text appearing in target locale files), missing keys per file, missing plural forms.
   - **No contextual grouping:** Coverage is reported globally or per-file, not per-component or per-route.

   This graceful degradation ensures the i18n skills work in projects that have not built a knowledge graph.
   ```

3. Run: `harness validate`

4. Commit: `docs(i18n): add graph integration design to proposal`

### Task 6: Final validation and single integration commit

**Depends on:** Tasks 1-5
**Files:** all modified files

[checkpoint:human-verify] -- Review all modifications before final validation.

1. Run: `harness validate` to confirm project health after all changes.

2. Verify byte-identical parity for all four skill pairs:

   ```bash
   diff agents/skills/claude-code/harness-integrity/SKILL.md agents/skills/gemini-cli/harness-integrity/SKILL.md
   diff agents/skills/claude-code/harness-release-readiness/SKILL.md agents/skills/gemini-cli/harness-release-readiness/SKILL.md
   diff agents/skills/claude-code/initialize-harness-project/SKILL.md agents/skills/gemini-cli/initialize-harness-project/SKILL.md
   diff agents/skills/claude-code/harness-accessibility/SKILL.md agents/skills/gemini-cli/harness-accessibility/SKILL.md
   ```

3. All four diffs should produce no output (byte-identical).

**Note on commit strategy:** Based on learnings from prior phases, Tasks 1-5 can each be committed individually OR combined into a single integration commit. The single-commit approach is recommended for documentation-only cross-skill integration changes. If using single-commit:

```
feat(i18n): wire i18n integration into integrity, release-readiness, init, and accessibility
```

## Parallelization

Tasks 1 through 5 are fully independent -- they modify different files with no shared state. They can be executed in parallel by separate agents if using `harness-parallel-agents`.

Task 6 depends on all of Tasks 1-5 completing.

## Traceability

| Observable Truth                             | Delivered By |
| -------------------------------------------- | ------------ |
| 1. Integrity includes i18n scan when enabled | Task 1       |
| 2. Integrity skips i18n when not enabled     | Task 1       |
| 3. Release-readiness checks coverage         | Task 2       |
| 4. Init asks about i18n                      | Task 3       |
| 5. Accessibility defers lang/dir checks      | Task 4       |
| 6. Graph integration documented              | Task 5       |
| 7. Gemini-cli parity                         | Tasks 1-4    |
| 8. harness validate passes                   | Task 6       |
