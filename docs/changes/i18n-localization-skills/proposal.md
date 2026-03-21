# Harness i18n & Localization Skills

> Make internationalization impossible to forget — from detection to workflow to process injection, across web, mobile, and backend.

## Overview & Goals

**Project:** Harness i18n & Localization Skill Family
**Scope:** 3 new skills + shared knowledge base + config additions + integration wiring
**Date:** 2026-03-20

### Goals

1. Make i18n impossible to forget by injecting considerations into the development process upstream (brainstorming, planning, design)
2. Detect i18n violations mechanically — hardcoded strings, missing translations, locale-sensitive formatting, RTL issues — across web, mobile, and backend
3. Manage the translation lifecycle — key extraction, file scaffolding, coverage tracking, pseudo-localization — with opinionated defaults that adapt to existing frameworks
4. Provide a comprehensive knowledge base of locale profiles, language pitfalls, industry-specific guidance, text expansion factors, and MCP server interop
5. Integrate into existing quality gates (integrity, release readiness) and project initialization with configurable strictness
6. Gracefully degrade — contextual coverage with graph, content-aware without; gate enforcement when configured, gentle prompts when not

### Non-Goals

- Replacing translation management systems (Crowdin, Lokalise, Tolgee) — we integrate with them via MCP
- Performing actual translations — we detect, extract, scaffold, and track; translation is done by humans, MT engines, or TMS platforms
- Building framework-specific i18n libraries — we guide usage of existing ones (i18next, FormatJS, vue-i18n, flutter intl, etc.)

**Keywords:** i18n, localization, translation, locale, RTL, pluralization, ICU-MessageFormat, CLDR, pseudo-localization, text-expansion

---

## Decisions

| #   | Decision                 | Choice                                                                                     | Rationale                                                                                                                                                                                                              |
| --- | ------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Lifecycle scope          | Full lifecycle: detection + process integration + translation workflow                     | Reactive-only detection doesn't solve the "forgot about i18n" problem. Need upstream injection and workflow support.                                                                                                   |
| 2   | Opinion strength         | Opinionated with escape hatches                                                            | Greenfield projects need strong defaults (ICU MessageFormat, JSON-based files). Existing projects need the skill to detect and adapt to whatever framework is already in use. Mirrors `harness-design-system` pattern. |
| 3   | Platform scope           | Web + mobile + backend                                                                     | Backend i18n (API errors, emails, notifications) is where i18n gets missed most. Limiting to frontend only leaves the biggest gap unfilled.                                                                            |
| 4   | Quality gate integration | Standalone + wired into integrity and release readiness                                    | Teams should be able to run the i18n scanner independently, but it should also participate in unified quality gates. Same pattern as accessibility.                                                                    |
| 5   | Process injection mode   | Adaptive: prompt-based when unconfigured, gate-based when enabled                          | Avoids annoying teams that genuinely don't need i18n while seeding the habit in teams that haven't considered it.                                                                                                      |
| 6   | Coverage tracking        | Contextual (graph) with content-aware fallback                                             | "Checkout flow is 94% translated" is more actionable than "12 keys missing globally." Graph isn't always available, so degrade gracefully.                                                                             |
| 7   | Knowledge base scope     | C+: profiles, pitfalls, industry context, testing patterns, MCP interop, a11y intersection | Comprehensive without duplicating what TMS platforms handle.                                                                                                                                                           |
| 8   | Skill architecture       | 3-skill family mirroring design system pattern                                             | Separation of concerns: detection ≠ workflow ≠ process injection. Composable adoption — teams enable what they need.                                                                                                   |
| 9   | Project lifecycle        | Part of init + retrofit path                                                               | New projects get asked about i18n during scaffolding. Existing projects can enable i18n and get an audit + scaffolding.                                                                                                |
| 10  | Market position          | First-mover in AI dev framework space                                                      | Zero of 15+ analyzed frameworks have i18n support. Clear differentiator.                                                                                                                                               |

### Landscape Analysis

**AI Dev Frameworks (0/15+ have i18n):** Spec Kit, BMAD, GSD, Superpowers, Claude Flow, Kiro, Cursor ecosystem, CodeRabbit, Qodo, Augment Code, gstack, Composio, Goose, Turbo Flow — none have i18n skills, rules, or guidance.

**Emerging i18n MCP ecosystem:** Tolgee MCP (TMS integration), Lingo.dev MCP (brand voice, glossary, multi-engine MT), Lokalise MCP (59 tools), i18next MCP (project analysis, coverage), Better i18n (MCP + agent skills — only project combining both, but platform-coupled). These are complementary, not competitive — harness integrates with them rather than replacing them.

**Key i18n tools informing the design:** eslint-plugin-i18next (hardcoded string detection), i18n-unused (dead key detection), pseudo-localization libraries (testing), Unicode CLDR (locale data authority), ICU MessageFormat 2.0 (emerging standard).

---

## Technical Design

### Skill Family Structure

```
agents/skills/claude-code/
├── harness-i18n/                    # Core: detection & scanning
│   ├── skill.yaml
│   └── SKILL.md
├── harness-i18n-workflow/           # Translation lifecycle management
│   ├── skill.yaml
│   └── SKILL.md
├── harness-i18n-process/            # Upstream process injection
│   ├── skill.yaml
│   └── SKILL.md

agents/skills/shared/
├── i18n-knowledge/
│   ├── locales/                     # Per-locale profiles (~20 at launch)
│   │   ├── ar.yaml                  # Arabic: RTL, 6 plural forms, reshaping
│   │   ├── de.yaml                  # German: +35% expansion, compound words
│   │   ├── ja.yaml                  # Japanese: no word spaces, 3 scripts, CJK width
│   │   ├── hi.yaml                  # Hindi: Devanagari ligatures, Indian grouping
│   │   ├── zh-Hans.yaml             # Simplified Chinese
│   │   ├── zh-Hant.yaml             # Traditional Chinese
│   │   └── ...                      # en, es, fr, pt, it, ko, he, th, ru, pl, tr, nl, sv, fi
│   ├── industries/                  # Industry-specific i18n guidance
│   │   ├── fintech.yaml             # Currency precision, number formatting, regulatory
│   │   ├── healthcare.yaml          # Medical terminology, FDA date formats, IFU
│   │   ├── ecommerce.yaml           # Addresses, measurements, sizing, phone numbers
│   │   ├── legal.yaml               # Jurisdiction formats, contract dates
│   │   └── gaming.yaml              # Character limits, cultural adaptation
│   ├── frameworks/                  # Framework detection & adaptation
│   │   ├── react-intl.yaml          # FormatJS patterns, eslint-plugin-formatjs
│   │   ├── i18next.yaml             # i18next patterns, namespace conventions
│   │   ├── vue-i18n.yaml            # Vue-specific patterns
│   │   ├── flutter-intl.yaml        # ARB files, intl package
│   │   ├── apple-strings.yaml       # NSLocalizedString, String Catalogs
│   │   ├── android-resources.yaml   # XML resources, plurals
│   │   └── backend-patterns.yaml    # Error catalogs, email templates, notifications
│   ├── anti-patterns/               # Common mistakes by category
│   │   ├── string-handling.yaml     # Concatenation, hardcoding, interpolation mistakes
│   │   ├── formatting.yaml          # Date/number/currency locale bugs
│   │   ├── pluralization.yaml       # Hardcoded plural logic, missing categories
│   │   ├── layout.yaml              # Fixed-width assumptions, RTL failures
│   │   └── encoding.yaml            # UTF-8 assumptions, emoji handling
│   ├── testing/                     # Testing patterns
│   │   ├── pseudo-localization.yaml # Pseudo-locale generation, what it catches
│   │   └── locale-testing.yaml      # Layout testing, functional testing per locale
│   ├── accessibility/               # i18n × a11y intersection
│   │   └── intersection.yaml        # lang tags, bidi a11y, script sizing
│   └── mcp-interop/                 # MCP server integration guidance
│       ├── tolgee.yaml              # Tolgee MCP capabilities & when to use
│       ├── lingo-dev.yaml           # Lingo.dev MCP capabilities
│       ├── lokalise.yaml            # Lokalise MCP capabilities
│       └── i18next-mcp.yaml         # i18next MCP server capabilities
```

### Skill Definitions

#### `harness-i18n` (Core Detection & Scanning)

- **Cognitive mode:** `meticulous-verifier`
- **Type:** rigid
- **Triggers:** `manual`, `on_pr`, `on_commit`, `on_review`
- **Phases:** `detect` → `scan` → `report` → `fix` (optional)
- **Depends on:** none (leaf skill)

| Phase    | What It Does                                                                                                                                                                                                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detect` | Identify project platform(s) (web/mobile/backend), i18n framework in use (or absence of one), existing translation files, locale config. Read `harness.config.json` for i18n settings.                                                                                                                                                                                                      |
| `scan`   | Scan source files for violations: hardcoded user-facing strings, locale-sensitive formatting (dates, numbers, currency without `Intl`), missing `lang`/`dir` attributes, concatenated strings, hardcoded plural logic, missing translation keys per locale, untranslated values (source language in target files). Platform-aware: different rules for `.tsx`, `.swift`, `.kt`, `.py`, etc. |
| `report` | Group findings by severity and category. If graph available: map findings to components/routes for contextual coverage. If not: content-aware key-level coverage. Output format matches `harness-accessibility` report structure.                                                                                                                                                           |
| `fix`    | Auto-fix mechanical issues only: wrap string literals in `t()` calls (framework-detected), add `lang` attributes, add `dir="auto"` to user-content containers. Interactive confirmation for each fix category.                                                                                                                                                                              |

**Detection rules by platform:**

_Web (React/Vue/Svelte/vanilla):_

- String literals in JSX text content and common props (`title`, `placeholder`, `alt`, `aria-label`)
- `new Date().toLocaleDateString()` without explicit locale argument
- `Number.toFixed()` / `.toLocaleString()` without locale
- Template literals with user-facing text
- CSS `width`/`max-width` on text containers without overflow handling
- Missing `dir` attribute on `<html>` or user-content containers
- Missing `lang` attribute on `<html>`

_Mobile (iOS/Android/Flutter):_

- String literals in UI builders (SwiftUI `Text()`, Compose `Text()`, Flutter `Text()`) not wrapped in localization calls
- Hardcoded `.strings`/`.xml` values missing from other locale files
- Missing plural forms in `.stringsdict` / `<plurals>` / ARB
- Layout constraints that assume LTR (hardcoded `left`/`right` instead of `leading`/`trailing`/`start`/`end`)

_Backend (Node/Python/Go/Java):_

- Hardcoded strings in API error responses, email templates, notification content
- Date/number formatting without locale parameter in API responses
- Hardcoded currency symbols or decimal separators
- Log messages mixed with user-facing messages (detection heuristic: strings returned in HTTP responses, rendered in templates, or passed to email/notification services)

#### `harness-i18n-workflow` (Translation Lifecycle)

- **Cognitive mode:** `constructive-architect`
- **Type:** flexible
- **Triggers:** `manual`, `on_project_init`
- **Phases:** `configure` → `scaffold` → `extract` → `track`
- **Depends on:** `harness-i18n`

| Phase       | What It Does                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `configure` | Set up i18n config in `harness.config.json`: source locale, target locales, strictness, framework choice (or auto-detect), translation file format, key naming convention. Opinionated defaults: ICU MessageFormat, JSON, dot-notation keys.                 |
| `scaffold`  | Create translation file structure based on framework. Generate locale files for declared target locales. Set up extraction config. If retrofitting: audit existing codebase and generate initial key catalog from detected strings.                          |
| `extract`   | Extract translatable strings from source code into translation files. Generate keys following configured naming convention. Preserve existing translations. Flag strings needing human review (context-dependent meaning).                                   |
| `track`     | Coverage dashboard: per-locale completion %, untranslated values, stale translations (source changed since last translation), missing plural forms. Pseudo-localization generation for testing. MCP server recommendations based on detected workflow needs. |

**Opinionated defaults (greenfield):**

- Message format: ICU MessageFormat (industry standard, widest tooling support)
- File format: JSON (universal, every TMS imports/exports it)
- Key naming: dot-notation namespaced by feature (`checkout.summary.totalLabel`)
- Directory structure: `locales/{locale}/{namespace}.json`
- Source locale: `en`
- Pseudo-locale: `en-XA` (generated, not manually maintained)

**Framework adaptation (existing projects):**

- Detect framework from `package.json`, `Podfile`, `build.gradle`, `pubspec.yaml`
- Load framework profile from `i18n-knowledge/frameworks/`
- Adapt extraction patterns, key conventions, and file formats to match
- Warn on anti-patterns specific to the detected framework

**Retrofit workflow:**

1. Run `harness-i18n` detect + scan to assess current state
2. Report: X hardcoded strings found, Y existing translation keys, Z locales configured
3. Generate initial key catalog from detected strings (keys auto-generated, flagged for human review)
4. Scaffold missing translation files for declared target locales
5. Set up `harness.config.json` i18n section
6. Generate coverage baseline

#### `harness-i18n-process` (Upstream Injection)

- **Cognitive mode:** `advisory-guide`
- **Type:** flexible
- **Triggers:** `on_new_feature`, `on_review`
- **Phases:** `check-config` → `inject` → `validate`
- **Depends on:** `harness-i18n`, `harness-i18n-workflow`

| Phase          | What It Does                                                                                                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `check-config` | Read `harness.config.json`. Determine mode: if `i18n.enabled: true` → gate mode. If unconfigured → prompt mode.                                                                                                                                                                                                                |
| `inject`       | **Prompt mode:** Add i18n consideration prompts to brainstorming/planning outputs. "Have you considered locale requirements for this feature?" with relevant locale pitfalls from knowledge base. **Gate mode:** Validate that specs/plans address i18n. Flag missing locale handling as warning (standard) or error (strict). |
| `validate`     | Verify i18n was addressed in the output artifact (spec, plan, or review). In gate mode, block progression if i18n requirements are unaddressed for features that touch user-facing strings.                                                                                                                                    |

**Prompt mode injection points:**

- During `harness-brainstorming` Phase 2 (EVALUATE): "For this feature, which user-facing strings will need translation? Consider: [relevant pitfalls from knowledge base based on configured target locales]."
- During `harness-planning` task breakdown: "Include i18n tasks: string extraction, translation file updates, pseudo-locale testing."
- During `harness-code-review`: "Check for hardcoded strings and locale-sensitive formatting."

**Gate mode validation:**

- Spec must contain a "Localization" or "i18n" section addressing: which strings are user-facing, which locales are affected, any locale-specific formatting requirements
- Plan must include at least one i18n-related task for features touching user-facing content
- Review must confirm no new hardcoded strings introduced

### Configuration Schema

Addition to `harness.config.json`:

```jsonc
{
  "i18n": {
    "enabled": true, // Master toggle
    "strictness": "standard", // "strict" | "standard" | "permissive"
    "sourceLocale": "en", // BCP 47 code
    "targetLocales": ["es", "fr", "de", "ja", "ar"],
    "framework": "auto", // "auto" | "i18next" | "react-intl" | "vue-i18n" | "flutter-intl" | "apple" | "android" | "custom"
    "format": "json", // Translation file format
    "messageFormat": "icu", // "icu" | "i18next" | "custom"
    "keyConvention": "dot-notation", // "dot-notation" | "snake_case" | "camelCase" | "custom"
    "translationPaths": {
      "web": "src/locales/{locale}.json",
      "mobile": "assets/translations/{locale}.json",
      "backend": "locales/{locale}.json",
    },
    "platforms": ["web", "backend"],
    "industry": "fintech", // Loads industry-specific rules
    "coverage": {
      "minimumPercent": 95, // Release gate threshold
      "requirePlurals": true, // Enforce all CLDR plural forms
      "detectUntranslated": true, // Flag values matching source locale
    },
    "pseudoLocale": "en-XA",
    "mcp": {
      "server": "tolgee", // MCP server for TMS operations
      "projectId": "my-project",
    },
  },
}
```

### Integration Points

**`harness-integrity`** — Chains `harness-i18n` scan phase. Conditional on `i18n.enabled` in config. Findings included in unified integrity report. Error-severity findings block in strict mode only.

**`harness-release-readiness`** — Checks translation coverage against `coverage.minimumPercent`. Reports per-locale coverage. Flags stale translations. Blocks release if below threshold in strict mode.

**`harness-initialize-project`** — During project init, asks: "Will this project support multiple languages?" If yes, invokes `harness-i18n-workflow` configure + scaffold phases. If no, sets `i18n.enabled: false` (prompts still fire via process skill for unconfigured projects).

**Retrofit path** — Running `harness-i18n-workflow` on an existing project triggers: framework detection → codebase audit → initial key catalog generation → translation file scaffolding → config setup → coverage baseline.

**`harness-accessibility`** — Cross-references: i18n skill checks `lang`/`dir` attributes and screen reader language tagging. Accessibility skill defers those checks when i18n skill is enabled to avoid duplicate findings.

### Graph Integration

When the knowledge graph is available:

- **Node types:** `translation_key` (properties: key, source_value, namespace, component), `locale_coverage` (properties: locale, percent, missing_count)
- **Edges:** `TRANSLATED_IN` (key → locale), `USED_BY` (key → component/route), `MISSING_IN` (key → locale)
- **Queries:** "What components in the checkout flow have missing French translations?" "Which translation keys are unused?" "If I change this component, which keys need review?"

When graph is unavailable:

- Falls back to file-based key tracking and content-aware coverage (detect untranslated values, missing keys per file)

---

## Success Criteria

### Core Skill (`harness-i18n`)

1. When run against a project with hardcoded user-facing strings, the scan detects them with ≤5% false positive rate across supported platforms (web/mobile/backend)
2. When a project uses an existing i18n framework (i18next, react-intl, vue-i18n, flutter intl, Apple strings, Android XML), the skill auto-detects it and applies framework-appropriate rules
3. When a project has translation files, the skill detects missing keys, untranslated values (source text in target files), and missing plural forms per CLDR rules
4. When `lang`/`dir` attributes are missing from HTML/JSX, the skill detects and can auto-fix them
5. When string concatenation is used to build user-facing messages, the skill flags it with the correct alternative (interpolation pattern for the detected framework)
6. Findings are grouped by category (strings, formatting, plurals, layout, encoding) and severity, matching `harness-accessibility` report structure

### Workflow Skill (`harness-i18n-workflow`)

7. When run on a greenfield project, the skill scaffolds translation files, extraction config, and locale directories using opinionated defaults (ICU MessageFormat, JSON, dot-notation keys)
8. When run on an existing project with hardcoded strings (retrofit), the skill generates an initial key catalog with extracted strings and scaffolds missing translation files
9. When `coverage.minimumPercent` is configured, the skill reports per-locale coverage percentages accurately
10. When graph is available, coverage is reported per-component/route. When graph is unavailable, coverage falls back to per-file key-level tracking
11. When pseudo-localization is requested, the skill generates a pseudo-locale that applies text expansion (+35%), accent characters, and bracket wrapping while preserving interpolation placeholders

### Process Skill (`harness-i18n-process`)

12. When `i18n.enabled: false` or unconfigured, brainstorming/planning receive a prompt-level nudge about locale considerations — dismissible, non-blocking
13. When `i18n.enabled: true` and `strictness: "standard"`, specs/plans missing i18n handling for user-facing features produce a warning
14. When `i18n.enabled: true` and `strictness: "strict"`, specs/plans missing i18n handling produce an error that blocks progression
15. When `harness-initialize-project` runs, it asks about i18n requirements and invokes workflow scaffolding if yes

### Integration

16. `harness-integrity` includes i18n findings in its unified report when `i18n.enabled: true`
17. `harness-release-readiness` blocks release when translation coverage is below `coverage.minimumPercent` in strict mode
18. `harness-accessibility` defers `lang`/`dir` attribute checks to the i18n skill when both are enabled, avoiding duplicate findings

### Knowledge Base

19. Locale profiles exist for ≥20 major locales covering: plural rules, text direction, expansion factor, script characteristics, number/date formatting, and common pitfalls
20. Industry profiles exist for fintech, healthcare, e-commerce, legal, and gaming with actionable i18n guidance
21. Framework profiles exist for all supported frameworks with detection patterns, key conventions, and recommended tooling
22. MCP interop profiles exist for Tolgee, Lingo.dev, Lokalise, and i18next-mcp with capability descriptions and integration guidance

---

## Implementation Order

### Phase 1: Knowledge Base Foundation

- Create `agents/skills/shared/i18n-knowledge/` directory structure
- Write locale profiles for top 20 locales (en, es, fr, de, pt, it, ja, zh-Hans, zh-Hant, ko, ar, he, hi, th, ru, pl, tr, nl, sv, fi)
- Write industry profiles (fintech, healthcare, e-commerce, legal, gaming)
- Write framework detection profiles (react-intl, i18next, vue-i18n, flutter-intl, apple-strings, android-resources, backend-patterns)
- Write anti-pattern definitions (string-handling, formatting, pluralization, layout, encoding)
- Write testing patterns (pseudo-localization, locale testing)
- Write accessibility × i18n intersection rules
- Write MCP interop profiles (Tolgee, Lingo.dev, Lokalise, i18next-mcp)

_Why first:_ Everything else consumes this data. Getting the knowledge right early means the skills have real substance behind their checks.

### Phase 2: Core Skill (`harness-i18n`)

- Create `skill.yaml` and `SKILL.md`
- Implement framework auto-detection logic
- Implement hardcoded string scanning per platform (web, mobile, backend)
- Implement translation file validation (missing keys, untranslated values, missing plural forms)
- Implement `lang`/`dir` attribute detection and auto-fix
- Implement string concatenation detection
- Implement report generation (grouped by category/severity)
- Add i18n config schema to `harness.config.json` types

_Why second:_ The scanner is the foundation. Everything else (workflow, process, integrations) depends on being able to detect i18n state.

### Phase 3: Workflow Skill (`harness-i18n-workflow`)

- Create `skill.yaml` and `SKILL.md`
- Implement configuration phase (guided setup, opinionated defaults)
- Implement scaffolding (translation file creation, directory structure)
- Implement string extraction and key generation
- Implement retrofit mode (audit existing project, generate initial catalog)
- Implement coverage tracking (key-level and content-aware)
- Implement pseudo-localization generation
- Implement MCP server recommendation logic

_Why third:_ Depends on the core skill for framework detection and scanning. Enables the full translation lifecycle.

### Phase 4: Process Skill (`harness-i18n-process`)

- Create `skill.yaml` and `SKILL.md`
- Implement config-aware mode switching (prompt vs gate)
- Implement prompt-mode injection points for brainstorming/planning
- Implement gate-mode validation for specs and plans
- Implement adaptive behavior (unconfigured → prompt, configured → gate)

_Why fourth:_ The least urgent mechanically, but the most important for the "bake it in" goal. Needs the other two skills stable first so it can reference their outputs.

### Phase 5: Integration Wiring

- Wire `harness-i18n` into `harness-integrity` (conditional on config)
- Wire coverage checks into `harness-release-readiness`
- Wire scaffolding into `harness-initialize-project`
- Implement `harness-accessibility` deduplication (defer `lang`/`dir` checks when i18n enabled)
- Implement graph integration (translation_key nodes, locale_coverage, USED_BY edges)
- Implement graph fallback (content-aware coverage when graph unavailable)

_Why last:_ Integration requires all three skills to be functional. Graph integration is the highest-complexity piece and benefits from having the simpler file-based path working first.

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
