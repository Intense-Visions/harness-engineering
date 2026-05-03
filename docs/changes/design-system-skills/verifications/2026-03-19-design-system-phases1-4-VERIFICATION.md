---
phase: design-system-phases-1-4
verified: 2026-03-19T21:45:00Z
status: gaps_found
score: 14/16 must-haves verified
gaps:
  - truth: 'Anti-pattern catalog data files exist for typography, color, layout, and motion'
    status: failed
    reason: 'The spec and Phase 1 plan explicitly require agents/skills/shared/design-knowledge/anti-patterns/ with 4 YAML files. The directory does not exist.'
    artifacts:
      - path: 'agents/skills/shared/design-knowledge/anti-patterns/typography.yaml'
        issue: 'MISSING - file does not exist'
      - path: 'agents/skills/shared/design-knowledge/anti-patterns/color.yaml'
        issue: 'MISSING - file does not exist'
      - path: 'agents/skills/shared/design-knowledge/anti-patterns/layout.yaml'
        issue: 'MISSING - file does not exist'
      - path: 'agents/skills/shared/design-knowledge/anti-patterns/motion.yaml'
        issue: 'MISSING - file does not exist'
    missing:
      - 'Create agents/skills/shared/design-knowledge/anti-patterns/ directory'
      - 'Create typography.yaml with 8+ universal and 4+ industry-specific anti-patterns'
      - 'Create color.yaml with 8+ universal and 4+ industry-specific anti-patterns'
      - 'Create layout.yaml with 8+ universal and 4+ industry-specific anti-patterns'
      - 'Create motion.yaml with 6+ universal and 3+ industry-specific anti-patterns'
  - truth: 'Platform rules data files exist for web, iOS, Android, and Flutter'
    status: failed
    reason: 'The spec and Phase 1 plan explicitly require agents/skills/shared/design-knowledge/platform-rules/ with 4 YAML files. The directory does not exist.'
    artifacts:
      - path: 'agents/skills/shared/design-knowledge/platform-rules/web.yaml'
        issue: 'MISSING - file does not exist'
      - path: 'agents/skills/shared/design-knowledge/platform-rules/ios.yaml'
        issue: 'MISSING - file does not exist'
      - path: 'agents/skills/shared/design-knowledge/platform-rules/android.yaml'
        issue: 'MISSING - file does not exist'
      - path: 'agents/skills/shared/design-knowledge/platform-rules/flutter.yaml'
        issue: 'MISSING - file does not exist'
    missing:
      - 'Create agents/skills/shared/design-knowledge/platform-rules/ directory'
      - 'Create web.yaml with CSS/Tailwind conventions, responsive breakpoints, a11y patterns'
      - 'Create ios.yaml with HIG compliance, SF Pro, Dynamic Type, safe areas'
      - 'Create android.yaml with Material Design 3, Roboto, 48dp targets, Compose patterns'
      - 'Create flutter.yaml with cross-platform considerations, adaptive widgets, ThemeData'
---

# Design System Skills: Phases 1-4 Verification Report

**Spec:** docs/changes/design-system-skills/proposal.md
**Verified:** 2026-03-19T21:45:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                   | Status   | Evidence                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Industry YAML files exist for 8+ verticals                                              | VERIFIED | 8 files in `agents/skills/shared/design-knowledge/industries/` (saas, fintech, healthcare, ecommerce, creative, services, lifestyle, emerging-tech), each 80+ lines with styles/palette/typography/anti_patterns                        |
| 2   | Anti-pattern catalogs exist for typography, color, layout, motion                       | FAILED   | Directory `agents/skills/shared/design-knowledge/anti-patterns/` does not exist. Zero files found. Spec and plan both require 4 YAML files.                                                                                             |
| 3   | Curated palettes with WCAG contrast pairs exist                                         | VERIFIED | `palettes/curated.yaml` exists, 234 lines, contains palette entries with contrast_pairs                                                                                                                                                 |
| 4   | Typography pairings with fallback stacks exist                                          | VERIFIED | `typography/pairings.yaml` exists, 274 lines, contains pairing entries with display/body/mono/fallbacks                                                                                                                                 |
| 5   | Platform rules exist for web, iOS, Android, Flutter                                     | FAILED   | Directory `agents/skills/shared/design-knowledge/platform-rules/` does not exist. Zero files found. Spec and plan both require 4 YAML files.                                                                                            |
| 6   | harness.config.json schema accepts design block                                         | VERIFIED | `DesignConfigSchema` in `packages/cli/src/config/schema.ts` (lines 60-65) with strictness enum, platforms enum, tokenPath, aestheticIntent. Wired into `HarnessConfigSchema` (line 88). Tests pass (15 tests in design-schema.test.ts). |
| 7   | Graph node types include design_token, aesthetic_intent, design_constraint              | VERIFIED | Lines 38-40 of `packages/graph/src/types.ts`                                                                                                                                                                                            |
| 8   | Graph edge types include uses_token, declares_intent, violates_design, platform_binding | VERIFIED | Lines 71-74 of `packages/graph/src/types.ts`                                                                                                                                                                                            |
| 9   | DesignIngestor parses tokens.json and DESIGN.md into graph nodes                        | VERIFIED | 187-line implementation in `packages/graph/src/ingest/DesignIngestor.ts`, 12 passing tests covering token ingestion (7 nodes from fixture), intent parsing, anti-pattern extraction, error handling                                     |
| 10  | DesignConstraintAdapter detects hardcoded colors/fonts not in token set                 | VERIFIED | 121-line implementation in `packages/graph/src/constraints/DesignConstraintAdapter.ts`, 11 passing tests covering color detection, font detection, severity mapping (permissive/standard/strict), checkAll                              |
| 11  | DesignIngestor and DesignConstraintAdapter exported from graph package                  | VERIFIED | Lines 95, 98-99 of `packages/graph/src/index.ts`                                                                                                                                                                                        |
| 12  | harness-design-system skill exists on both platforms with correct schema                | VERIFIED | skill.yaml + SKILL.md (282 lines) in claude-code and gemini-cli. Byte-identical copies. Schema passes. cognitive_mode: constructive-architect, type: rigid, phases: discover/define/generate/validate                                   |
| 13  | harness-accessibility skill exists on both platforms with correct schema                | VERIFIED | skill.yaml + SKILL.md (274 lines) in claude-code and gemini-cli. Byte-identical copies. Schema passes. cognitive_mode: meticulous-verifier, type: rigid, depends_on: [harness-design-system], phases: scan/evaluate/report/fix          |
| 14  | harness-design skill exists on both platforms with correct schema                       | VERIFIED | skill.yaml + SKILL.md (260 lines) in claude-code and gemini-cli. Byte-identical copies. Schema passes. cognitive_mode: advisory-guide, type: flexible, depends_on: [harness-design-system], phases: intent/direction/review/enforce     |
| 15  | All SKILL.md files reference shared design-knowledge and graph artifacts                | VERIFIED | All 3 SKILL.md files reference `agents/skills/shared/design-knowledge/`, `DesignIngestor`, and `DesignConstraintAdapter` with correct paths                                                                                             |
| 16  | All tests pass with no regressions                                                      | VERIFIED | graph: 25 files, 231 tests passed. CLI: 62 files, 408 tests passed. skills: 4 files, 459 tests passed. Full monorepo: 16 packages, all green.                                                                                           |

**Score:** 14/16 truths verified

### Required Artifacts -- Phase 1: Shared Foundation

| Artifact                                                              | Expected                       | Exists | Substantive                                    | Wired                        | Status   |
| --------------------------------------------------------------------- | ------------------------------ | ------ | ---------------------------------------------- | ---------------------------- | -------- |
| `agents/skills/shared/design-knowledge/industries/saas.yaml`          | Industry vertical data         | Yes    | Yes (80 lines)                                 | Referenced by SKILL.md files | VERIFIED |
| `agents/skills/shared/design-knowledge/industries/fintech.yaml`       | Industry vertical data         | Yes    | Yes (80 lines)                                 | Referenced by SKILL.md files | VERIFIED |
| `agents/skills/shared/design-knowledge/industries/healthcare.yaml`    | Industry vertical data         | Yes    | Yes (80 lines)                                 | Referenced by SKILL.md files | VERIFIED |
| `agents/skills/shared/design-knowledge/industries/ecommerce.yaml`     | Industry vertical data         | Yes    | Yes (80 lines)                                 | Referenced by SKILL.md files | VERIFIED |
| `agents/skills/shared/design-knowledge/industries/creative.yaml`      | Industry vertical data         | Yes    | Yes (80 lines)                                 | Referenced by SKILL.md files | VERIFIED |
| `agents/skills/shared/design-knowledge/industries/services.yaml`      | Industry vertical data         | Yes    | Yes (80 lines)                                 | Referenced by SKILL.md files | VERIFIED |
| `agents/skills/shared/design-knowledge/industries/lifestyle.yaml`     | Industry vertical data         | Yes    | Yes (80 lines)                                 | Referenced by SKILL.md files | VERIFIED |
| `agents/skills/shared/design-knowledge/industries/emerging-tech.yaml` | Industry vertical data         | Yes    | Yes (83 lines)                                 | Referenced by SKILL.md files | VERIFIED |
| `agents/skills/shared/design-knowledge/anti-patterns/typography.yaml` | Typography anti-patterns       | **No** | --                                             | --                           | MISSING  |
| `agents/skills/shared/design-knowledge/anti-patterns/color.yaml`      | Color anti-patterns            | **No** | --                                             | --                           | MISSING  |
| `agents/skills/shared/design-knowledge/anti-patterns/layout.yaml`     | Layout anti-patterns           | **No** | --                                             | --                           | MISSING  |
| `agents/skills/shared/design-knowledge/anti-patterns/motion.yaml`     | Motion anti-patterns           | **No** | --                                             | --                           | MISSING  |
| `agents/skills/shared/design-knowledge/palettes/curated.yaml`         | Curated palettes with contrast | Yes    | Yes (234 lines)                                | Referenced by SKILL.md       | VERIFIED |
| `agents/skills/shared/design-knowledge/typography/pairings.yaml`      | Font pairings with fallbacks   | Yes    | Yes (274 lines)                                | Referenced by SKILL.md       | VERIFIED |
| `agents/skills/shared/design-knowledge/platform-rules/web.yaml`       | Web platform rules             | **No** | --                                             | --                           | MISSING  |
| `agents/skills/shared/design-knowledge/platform-rules/ios.yaml`       | iOS platform rules             | **No** | --                                             | --                           | MISSING  |
| `agents/skills/shared/design-knowledge/platform-rules/android.yaml`   | Android platform rules         | **No** | --                                             | --                           | MISSING  |
| `agents/skills/shared/design-knowledge/platform-rules/flutter.yaml`   | Flutter platform rules         | **No** | --                                             | --                           | MISSING  |
| `packages/cli/src/config/schema.ts` (DesignConfigSchema)              | Schema extension               | Yes    | Yes (6 lines + wired into HarnessConfigSchema) | Tested (15 tests)            | VERIFIED |
| `packages/cli/tests/config/design-schema.test.ts`                     | Schema tests                   | Yes    | Yes (107 lines, 15 test cases)                 | Imports DesignConfigSchema   | VERIFIED |

### Required Artifacts -- Phase 2: Graph Schema

| Artifact                                                               | Expected                                                       | Exists | Substantive                    | Wired                                            | Status   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- | ------ | ------------------------------ | ------------------------------------------------ | -------- |
| `packages/graph/src/types.ts` (node types)                             | design_token, aesthetic_intent, design_constraint              | Yes    | Yes (3 entries)                | Used by DesignIngestor + DesignConstraintAdapter | VERIFIED |
| `packages/graph/src/types.ts` (edge types)                             | uses_token, declares_intent, violates_design, platform_binding | Yes    | Yes (4 entries)                | Available for use                                | VERIFIED |
| `packages/graph/src/ingest/DesignIngestor.ts`                          | Token + DESIGN.md ingestor                                     | Yes    | Yes (187 lines, 3 methods)     | Exported from index.ts, tested                   | VERIFIED |
| `packages/graph/src/ingest/ingestUtils.ts`                             | Shared hash/merge/empty helpers                                | Yes    | Yes (22 lines)                 | Imported by DesignIngestor                       | VERIFIED |
| `packages/graph/tests/ingest/DesignIngestor.test.ts`                   | Ingestor tests                                                 | Yes    | Yes (182 lines, 12 test cases) | Imports DesignIngestor                           | VERIFIED |
| `packages/graph/src/constraints/DesignConstraintAdapter.ts`            | Constraint checker                                             | Yes    | Yes (121 lines, 4 methods)     | Exported from index.ts, tested                   | VERIFIED |
| `packages/graph/tests/constraints/DesignConstraintAdapter.test.ts`     | Constraint tests                                               | Yes    | Yes (157 lines, 11 test cases) | Imports DesignConstraintAdapter                  | VERIFIED |
| `packages/graph/__fixtures__/sample-project/design-system/tokens.json` | W3C DTCG fixture                                               | Yes    | Yes (51 lines, 7 tokens)       | Used by DesignIngestor tests                     | VERIFIED |
| `packages/graph/__fixtures__/sample-project/design-system/DESIGN.md`   | Design intent fixture                                          | Yes    | Yes                            | Used by DesignIngestor tests                     | VERIFIED |
| `packages/graph/src/index.ts` (exports)                                | DesignIngestor, DesignConstraintAdapter, types                 | Yes    | Yes (3 export lines)           | Consumable by downstream                         | VERIFIED |

### Required Artifacts -- Phase 3: Foundation Skills

| Artifact                                                     | Expected           | Exists | Substantive                         | Wired                               | Status   |
| ------------------------------------------------------------ | ------------------ | ------ | ----------------------------------- | ----------------------------------- | -------- |
| `agents/skills/claude-code/harness-design-system/skill.yaml` | Skill metadata     | Yes    | Yes (50 lines, all required fields) | Schema-validated (459 tests pass)   | VERIFIED |
| `agents/skills/claude-code/harness-design-system/SKILL.md`   | Skill instructions | Yes    | Yes (282 lines, all 7 sections)     | References design-knowledge + graph | VERIFIED |
| `agents/skills/claude-code/harness-accessibility/skill.yaml` | Skill metadata     | Yes    | Yes (51 lines, depends_on correct)  | Schema-validated                    | VERIFIED |
| `agents/skills/claude-code/harness-accessibility/SKILL.md`   | Skill instructions | Yes    | Yes (274 lines, all 7 sections)     | References design-knowledge + graph | VERIFIED |
| `agents/skills/gemini-cli/harness-design-system/skill.yaml`  | Platform copy      | Yes    | Byte-identical to claude-code       | Platform-parity test passes         | VERIFIED |
| `agents/skills/gemini-cli/harness-design-system/SKILL.md`    | Platform copy      | Yes    | Byte-identical to claude-code       | Platform-parity test passes         | VERIFIED |
| `agents/skills/gemini-cli/harness-accessibility/skill.yaml`  | Platform copy      | Yes    | Byte-identical to claude-code       | Platform-parity test passes         | VERIFIED |
| `agents/skills/gemini-cli/harness-accessibility/SKILL.md`    | Platform copy      | Yes    | Byte-identical to claude-code       | Platform-parity test passes         | VERIFIED |

### Required Artifacts -- Phase 4: Aesthetic Skill

| Artifact                                              | Expected           | Exists | Substantive                                    | Wired                               | Status   |
| ----------------------------------------------------- | ------------------ | ------ | ---------------------------------------------- | ----------------------------------- | -------- |
| `agents/skills/claude-code/harness-design/skill.yaml` | Skill metadata     | Yes    | Yes (53 lines, type: flexible, advisory-guide) | Schema-validated                    | VERIFIED |
| `agents/skills/claude-code/harness-design/SKILL.md`   | Skill instructions | Yes    | Yes (260 lines, all 7 sections)                | References design-knowledge + graph | VERIFIED |
| `agents/skills/gemini-cli/harness-design/skill.yaml`  | Platform copy      | Yes    | Byte-identical to claude-code                  | Platform-parity test passes         | VERIFIED |
| `agents/skills/gemini-cli/harness-design/SKILL.md`    | Platform copy      | Yes    | Byte-identical to claude-code                  | Platform-parity test passes         | VERIFIED |

### Key Link Verification

| From                    | To                    | Via                   | Status    | Details                                                                                                     |
| ----------------------- | --------------------- | --------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| DesignIngestor          | GraphStore            | Constructor injection | WIRED     | `constructor(private readonly store: GraphStore)` -- calls `store.addNode()`                                |
| DesignConstraintAdapter | GraphStore            | Constructor injection | WIRED     | `constructor(private readonly store: GraphStore)` -- calls `store.findNodes()`                              |
| DesignIngestor          | index.ts exports      | Named export          | WIRED     | `export { DesignIngestor } from './ingest/DesignIngestor.js'`                                               |
| DesignConstraintAdapter | index.ts exports      | Named export          | WIRED     | `export { DesignConstraintAdapter }` + type exports                                                         |
| DesignConfigSchema      | HarnessConfigSchema   | `.optional()` field   | WIRED     | `design: DesignConfigSchema.optional()` on line 88                                                          |
| SKILL.md files          | design-knowledge data | Path references       | WIRED     | All 3 SKILL.md files reference `agents/skills/shared/design-knowledge/` paths                               |
| SKILL.md files          | graph classes         | Class name references | WIRED     | All 3 SKILL.md files reference `DesignIngestor` and `DesignConstraintAdapter` by full path                  |
| KnowledgeIngestor       | DesignIngestor        | Integration call      | NOT WIRED | KnowledgeIngestor does NOT import or call DesignIngestor. Per Phase 2 plan this is "optional" and deferred. |

### Anti-Patterns Found

| File   | Line | Pattern | Severity | Impact                                                                   |
| ------ | ---- | ------- | -------- | ------------------------------------------------------------------------ |
| (none) | --   | --      | --       | No TODO/FIXME/placeholder/stub patterns found in any implementation file |

### Test Results

| Package                    | Files       | Tests | Status              |
| -------------------------- | ----------- | ----- | ------------------- |
| @harness-engineering/graph | 25          | 231   | All passed          |
| @harness-engineering/cli   | 62          | 408   | All passed          |
| agents/skills              | 4           | 459   | All passed          |
| Full monorepo (pnpm test)  | 16 packages | All   | All passed (cached) |

### Human Verification Required

None identified. All automated checks provide sufficient coverage for the deliverables in scope.

### Gaps Summary

**Two Phase 1 data deliverables are completely missing:**

1. **Anti-pattern catalogs** (`agents/skills/shared/design-knowledge/anti-patterns/`): The spec (lines 239-243) and Phase 1 plan (Task 4) both explicitly require 4 YAML files: `typography.yaml`, `color.yaml`, `layout.yaml`, `motion.yaml`. Each should contain 6-8+ universal anti-patterns and 3-4+ industry-specific anti-patterns with structured detection/fix guidance. The directory does not exist and zero files were created.

2. **Platform rules** (`agents/skills/shared/design-knowledge/platform-rules/`): The spec (lines 246-250) and Phase 1 plan (Task 6) both explicitly require 4 YAML files: `web.yaml`, `ios.yaml`, `android.yaml`, `flutter.yaml`. Each should contain platform-specific guidance for typography, spacing, color, components, accessibility, and framework patterns. The directory does not exist and zero files were created.

**Root cause:** These were Phase 1 deliverables (Tasks 4 and 6 in the plan) that were never executed. The Phase 1 plan specified 18 YAML files total; only 10 were created (8 industries + 1 palette + 1 typography). The missing 8 files account for 2 of the 4 spec-mandated data directories.

**Impact on downstream phases:** The SKILL.md files in Phases 3-4 reference anti-pattern catalogs and platform rules conceptually, but the underlying data files they would read from do not exist. When an agent runs `harness-design` or `harness-accessibility` and attempts to load anti-pattern catalogs from `agents/skills/shared/design-knowledge/anti-patterns/`, it will find nothing. The skills are structurally complete but their data foundation is incomplete.

**Note:** The Phase 4 plan (Risk #4) explicitly acknowledges this gap: "anti-patterns/ and platform-rules/ directories -- The spec mentions these in shared design-knowledge but they were not created in Phase 1." The gap was known but not addressed.

**Everything else is solid.** Phases 2, 3, and 4 are fully delivered with substantive implementations, comprehensive tests, proper wiring, and zero anti-patterns.

---

_Verified: 2026-03-19T21:45:00Z_
_Verifier: Claude (gsd-verifier)_
