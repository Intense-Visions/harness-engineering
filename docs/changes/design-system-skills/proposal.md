# Harness Design System Skills

> Give the harness comprehensive design capabilities — from token management to aesthetic direction to platform-specific implementation, with graph-backed enforcement.

## Overview & Goals

**Project:** Harness Design System Skills
**Scope:** 5 new skills + graph schema extension + config additions
**Date:** 2026-03-19

### Goals

1. Give the harness comprehensive design capabilities — from token management to aesthetic direction to platform-specific implementation
2. Enforce design consistency with the same rigor the harness enforces architecture
3. Support web (Tailwind/React/Vue/Svelte) and mobile (React Native/SwiftUI/Flutter/Compose) from day one
4. Use W3C DTCG token format for portability; harness graph for enforcement
5. Ship advisory-with-guardrails by default, configurable strictness for opinionated teams

### Non-Goals

- Visual design tool (no Figma/sketch canvas — this is code-side)
- Screenshot-to-code conversion
- Runtime design token resolution (build-time only)
- Replacing existing design tools — complementing them

**Keywords:** design-tokens, accessibility, WCAG, typography, color-palette, component-patterns, aesthetic-direction, W3C-DTCG, design-enforcement, mobile-design

---

## Decisions

| #   | Decision         | Choice                                                                                     | Rationale                                                                            |
| --- | ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1   | Audience         | Layered — fundamentals for all, aesthetics opt-in                                          | Maximizes adoption without forcing opinion                                           |
| 2   | Stack scope      | Web + Mobile with framework-agnostic foundation                                            | Full product surface coverage; foundation layer prevents duplication                 |
| 3   | Persistence      | W3C DTCG `tokens.json` + harness graph indexing                                            | Portable standard for interop with Figma/Style Dictionary; graph enables enforcement |
| 4   | Opinion strength | Advisory with guardrails, `designStrictness` config (`strict` / `standard` / `permissive`) | Default doesn't block; strict mode is opt-in power feature                           |
| 5   | Structure        | 5-skill layered family                                                                     | Matches harness pattern of focused, composable skills                                |
| 6   | Graph role       | Active enforcement in v1; schema designed for cross-cutting analysis later                 | Delivers value now without over-engineering                                          |
| 7   | Delivery         | All phases shipped together                                                                | Eliminates risk of incomplete vision; skills designed as a cohesive family           |

### Synthesis from Referenced Frameworks

**Ported:**

- From **Anthropic frontend-design**: aesthetic direction process, anti-slop philosophy, "design thinking before coding" gate
- From **UI/UX Pro Max**: industry-aware reasoning rules, multi-domain search (styles x palettes x typography), persistent design system files
- From **Impeccable**: command-based design vocabulary, anti-pattern catalogs, project-level design context accumulation
- From **Vercel skills**: accessibility rule sets, composition patterns, performance-aware component guidelines
- From **W3C DTCG**: token format specification, vendor-neutral interchange

**Not ported:**

- UI/UX Pro Max's Python CLI / BM25 ranking engine (too heavy; harness graph replaces this)
- Impeccable's 20 micro-commands (consolidated into 5 skill phases instead)
- Anthropic's hard font bans as default behavior (moved to `strict` mode only)

---

## Technical Design

### Skill Family Architecture

```
Foundation Layer (triggers: on_new_feature, on_project_init, manual)
├── harness-design-system        -> tokens, palette, typography, spacing, design intent
│   cognitive_mode: constructive-architect
│   type: rigid
│   phases: discover -> define -> generate -> validate
│
├── harness-accessibility        -> WCAG audit, ARIA, contrast, focus, screen reader
│   cognitive_mode: meticulous-verifier
│   type: rigid
│   phases: scan -> evaluate -> report -> fix

Aesthetic Layer (triggers: manual, on_new_feature)
├── harness-design               -> aesthetic direction, anti-patterns, design review
│   cognitive_mode: advisory-guide
│   type: flexible (configurable strictness)
│   phases: intent -> direction -> review -> enforce

Implementation Layer (triggers: manual, on_new_feature, on_commit)
├── harness-design-web           -> Tailwind/CSS, React/Vue/Svelte component patterns
│   cognitive_mode: meticulous-implementer
│   type: rigid
│   phases: scaffold -> implement -> verify
│
├── harness-design-mobile        -> RN, SwiftUI, Flutter, Compose patterns
│   cognitive_mode: meticulous-implementer
│   type: rigid
│   phases: scaffold -> implement -> verify
```

### File Layout

```
design-system/
├── tokens.json                  # W3C DTCG format — source of truth
├── DESIGN.md                    # Aesthetic intent, strictness config, anti-patterns
└── pages/
    └── [page-name].md           # Per-page/screen overrides

harness.config.json additions:
  "design": {
    "strictness": "standard",        # strict | standard | permissive
    "platforms": ["web", "mobile"],   # which implementation skills activate
    "tokenPath": "design-system/tokens.json",
    "aestheticIntent": "design-system/DESIGN.md"
  }
```

### tokens.json (W3C DTCG Format)

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "primary": {
      "$value": "#2563eb",
      "$type": "color",
      "$description": "Primary brand color"
    },
    "primary-contrast": {
      "$value": "#ffffff",
      "$type": "color",
      "$description": "Text on primary — must pass WCAG AA"
    }
  },
  "typography": {
    "display": {
      "$value": {
        "fontFamily": "Instrument Serif",
        "fontSize": "3rem",
        "fontWeight": 400,
        "lineHeight": 1.1
      },
      "$type": "typography"
    },
    "body": {
      "$value": {
        "fontFamily": "Geist",
        "fontSize": "1rem",
        "fontWeight": 400,
        "lineHeight": 1.6
      },
      "$type": "typography"
    }
  },
  "spacing": {
    "scale": {
      "$value": ["0.25rem", "0.5rem", "1rem", "1.5rem", "2rem", "3rem", "4rem"],
      "$type": "dimension"
    }
  }
}
```

### DESIGN.md Structure

```markdown
# Design Intent

## Aesthetic Direction

**Style:** [e.g., "Refined minimalism with editorial typography"]
**Tone:** [e.g., "Professional but warm — not corporate sterile"]
**Differentiator:** [e.g., "Generous whitespace + oversized serif headings"]

## Anti-Patterns (project-specific)

- No system/default fonts in user-facing UI
- No purple-gradient-on-white hero sections
- No icon-only buttons without labels

## Platform Notes

- **Web:** Tailwind + shadcn/ui base, custom tokens override defaults
- **Mobile:** iOS-first, Material adaptation for Android

## Strictness Override

level: standard
```

### Graph Schema Extension

**New node types:**

```
DesignToken      { name, type, value, group }
AestheticIntent  { style, tone, differentiator, strictness }
DesignConstraint { rule, severity, scope }
```

**New edge types:**

```
USES_TOKEN       Component -> DesignToken
DECLARES_INTENT  Project/Page -> AestheticIntent
VIOLATES         Component -> DesignConstraint
PLATFORM_BINDING DesignToken -> Platform { web | ios | android }
```

**Ingestion:** `ingest_source` hook on `design-system/tokens.json` and `design-system/DESIGN.md` — parses and populates graph nodes. Runs on file change.

**Enforcement:** `enforce-architecture` gains a `design` constraint category. Violations surface in `harness-verify` output:

```
DESIGN-001 [warn]  Button uses hardcoded #3b82f6, not token color.primary
DESIGN-002 [warn]  Heading uses Inter — flagged in project anti-patterns
DESIGN-003 [error] Contrast ratio 2.8:1 fails WCAG AA (requires 4.5:1)
```

**Severity controlled by `designStrictness`:**

- `permissive`: all design violations are `info`
- `standard`: anti-pattern + a11y violations are `warn`; nothing blocks
- `strict`: a11y violations are `error` (blocks); anti-patterns are `warn`

### Skill Dependencies

```
harness-design-system  <- (none, foundation)
harness-accessibility  <- harness-design-system (reads tokens for contrast checks)
harness-design         <- harness-design-system (reads tokens + writes DESIGN.md)
harness-design-web     <- harness-design-system, harness-design
harness-design-mobile  <- harness-design-system, harness-design
```

**Integration with existing skills:**

- `harness-verify` -> runs design constraint checks
- `harness-integrity` -> includes design health in integrity report
- `harness-impact-analysis` -> traces token changes to affected components
- `enforce-architecture` -> gains design constraint category

### Industry-Aware Recommendations

Stored as structured data in shared knowledge:

```
agents/skills/shared/design-knowledge/
├── industries/           # industry -> recommended styles, palettes, typography
│   ├── saas.yaml
│   ├── fintech.yaml
│   ├── healthcare.yaml
│   ├── ecommerce.yaml
│   └── ...
├── anti-patterns/        # universal + industry-specific anti-patterns
│   ├── typography.yaml
│   ├── color.yaml
│   ├── layout.yaml
│   └── motion.yaml
├── palettes/             # curated palettes with WCAG-validated contrast pairs
├── typography/           # font pairings with fallback stacks
└── platform-rules/
    ├── web.yaml
    ├── ios.yaml
    ├── android.yaml
    └── flutter.yaml
```

Skills query this data directly — no external CLI or ranking engine needed.

---

## Success Criteria

| #   | Criterion                                                                                                                             | How to Verify                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | `harness-design-system` generates valid W3C DTCG `tokens.json` from user input                                                        | Parse output against DTCG JSON schema; tokens resolve correctly              |
| 2   | `harness-accessibility` detects WCAG AA contrast failures                                                                             | Feed known-bad color pairs; skill reports violations with correct ratios     |
| 3   | `harness-design` produces `DESIGN.md` with all required sections (direction, tone, anti-patterns, platform notes)                     | Structural validation of output file                                         |
| 4   | `harness-design-web` generates components that reference tokens, not hardcoded values                                                 | Grep output for hardcoded colors/fonts; should find none                     |
| 5   | `harness-design-mobile` generates platform-appropriate patterns (iOS HIG safe areas, Material 3 elevation, etc.)                      | Platform-specific linting rules pass                                         |
| 6   | `designStrictness: strict` causes a11y violations to surface as `error` in `harness-verify`                                           | Run verify with known violation; confirm exit code != 0                      |
| 7   | `designStrictness: permissive` downgrades all design violations to `info`                                                             | Run verify with known violation; confirm exit code == 0, info-level output   |
| 8   | Changing a token in `tokens.json` triggers `impact-analysis` to list affected components                                              | Modify token, run impact analysis, confirm component list is accurate        |
| 9   | `enforce-architecture` reports components using colors/fonts not in the token set                                                     | Introduce off-token color; confirm DESIGN-001 violation surfaces             |
| 10  | Industry knowledge YAML files load and produce relevant recommendations for at least 8 verticals                                      | Query each industry; confirm non-empty style + palette + typography response |
| 11  | All 5 skills pass `harness validate` and existing skill schema tests                                                                  | `pnpm test` in skills/tests passes                                           |
| 12  | Platform parity — all 5 skills exist in both `claude-code/` and `gemini-cli/`                                                         | `platform-parity.test.ts` passes                                             |
| 13  | Graph ingestion of `tokens.json` produces correct `DesignToken` nodes and `USES_TOKEN` edges                                          | Query graph after ingestion; confirm node count matches token count          |
| 14  | Anti-pattern detection flags at least: generic fonts, hardcoded colors, missing alt text, contrast failures                           | Test suite with known anti-patterns; all detected                            |
| 15  | Skills compose — running `harness-design` then `harness-design-web` produces consistent output referencing the same tokens and intent | End-to-end test: design -> implement -> verify pipeline                      |

---

## Implementation Order

### Phase 1: Shared Foundation

- Design knowledge data files (`agents/skills/shared/design-knowledge/`)
- Industry YAML files (8+ verticals), anti-pattern catalogs, palette/typography data
- Platform rules (web, iOS, Android, Flutter)
- `harness.config.json` schema extension for `design` block

### Phase 2: Graph Schema

- New node types: `DesignToken`, `AestheticIntent`, `DesignConstraint`
- New edge types: `USES_TOKEN`, `DECLARES_INTENT`, `VIOLATES`, `PLATFORM_BINDING`
- `ingest_source` hook for `tokens.json` and `DESIGN.md`
- Wire `design` constraint category into `enforce-architecture`

### Phase 3: Foundation Skills

- `harness-design-system` — token generation, palette, typography, spacing (skill.yaml + SKILL.md, both platforms)
- `harness-accessibility` — WCAG scanning, contrast checking, ARIA validation (skill.yaml + SKILL.md, both platforms)

### Phase 4: Aesthetic Skill

- `harness-design` — aesthetic direction workflow, anti-pattern enforcement, `DESIGN.md` generation, strictness configuration (skill.yaml + SKILL.md, both platforms)

### Phase 5: Implementation Skills

- `harness-design-web` — Tailwind/CSS generation, React/Vue/Svelte component patterns, token-bound output (skill.yaml + SKILL.md, both platforms)
- `harness-design-mobile` — React Native/SwiftUI/Flutter/Compose patterns, platform-specific rules (skill.yaml + SKILL.md, both platforms)

### Phase 6: Integration

- Wire all 5 skills into `harness-verify` and `harness-integrity`
- Connect `impact-analysis` to design token graph
- Add design health to `harness-onboarding` output
- Update existing skill tests: schema, structure, platform-parity

### Phase 7: Validation

- End-to-end test: `design-system` -> `design` -> `design-web` -> `verify` pipeline
- Run against sample projects (SaaS dashboard, e-commerce storefront, mobile fitness app)
- All 15 success criteria pass

**Dependency order:**

```
Phase 1 --> Phase 2 --> Phase 3 --> Phase 4 --> Phase 5 --> Phase 6 --> Phase 7
  (data)     (graph)   (foundation) (aesthetic) (platform)  (wiring)   (verify)
```

Phases 4 and 5 can run in parallel after Phase 3 completes.

---

## Sources

- [Anthropic Frontend Design Skill](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md)
- [UI/UX Pro Max Skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [Impeccable](https://impeccable.style/)
- [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills)
- [W3C Design Tokens Community Group](https://www.designtokens.org/)
- [Top 8 Claude Skills for UI/UX Engineers](https://snyk.io/articles/top-claude-skills-ui-ux-engineers/)
- [Best Claude Code Skills 2026](https://www.firecrawl.dev/blog/best-claude-code-skills)
- [Claude-A11y-Skill](https://github.com/airowe/claude-a11y-skill)
