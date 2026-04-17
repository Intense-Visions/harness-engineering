# Harness Engineering for Designers: Quickstart Guide

**Enforce design consistency, accessibility, and token integrity with mechanical precision.**

This guide is written for UI/UX designers, design system leads, and frontend designers who want to integrate Harness Engineering into their daily work. It covers what harness does for design workflows, how to use it day-to-day, which tools map to which design activities, and how to build a repeatable, high-confidence design process.

---

## Table of Contents

1. [What Is Harness Engineering?](#what-is-harness-engineering)
2. [Why Designers Should Care](#why-designers-should-care)
3. [Getting Started (5 Minutes)](#getting-started-5-minutes)
4. [The Design Toolkit at a Glance](#the-design-toolkit-at-a-glance)
5. [Day-to-Day Design Workflows](#day-to-day-design-workflows)
   - [Creating a Design System from Scratch](#1-creating-a-design-system-from-scratch)
   - [Reviewing a PR for Design Compliance](#2-reviewing-a-pr-for-design-compliance)
   - [Checking Accessibility](#3-checking-accessibility)
   - [Setting Up Visual Regression Tests](#4-setting-up-visual-regression-tests)
   - [Generating Platform Components from Tokens](#5-generating-platform-components-from-tokens)
   - [Auditing Design Consistency](#6-auditing-design-consistency)
   - [Working with the Knowledge Graph for Design](#7-working-with-the-knowledge-graph-for-design)
6. [CI/CD Integration for Design Gates](#cicd-integration-for-design-gates)
7. [Improving Your Design Processes Over Time](#improving-your-design-processes-over-time)
8. [Quick Reference Card](#quick-reference-card)
9. [FAQ](#faq)

---

## What Is Harness Engineering?

Harness Engineering is a toolkit that makes AI coding agents reliable through **mechanical enforcement**. Instead of relying on prompts, conventions, and hope, harness encodes your project's architectural decisions, quality standards, and design requirements as machine-checkable constraints. Every rule is validated on every change.

For design, this means:

- **Enforced design tokens** that prevent hardcoded colors, spacing, and typography from creeping into components
- **Automated accessibility checks** that catch WCAG violations before code ships
- **Visual regression testing** that detects unintended CSS changes across viewports and themes
- **Platform-aware component generation** that respects HIG, Material Design, and framework conventions
- **Anti-pattern detection** that flags typography, color, layout, and motion problems mechanically
- **Token-to-component traceability** via the knowledge graph, so you always know what uses what

Harness operates through **slash commands** (e.g., `/harness:code-review`) in your AI coding tool (Claude Code, Gemini CLI, Cursor), **CLI skills** invoked via `harness skill run <name>`, and **CLI commands** for scripts and CI pipelines.

> **Slash commands vs. skills:** Not every skill has a registered slash command. Core workflow skills (review, verify, etc.) are slash commands you can type directly. Domain-specific design skills (design-system, design-web, design-mobile, etc.) are invoked via `harness skill run <name>` or by asking your AI agent to run them. Both work the same way -- the difference is just how you invoke them.

---

## Why Designers Should Care

| Traditional Design Pain Point                              | How Harness Solves It                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| "Someone hardcoded a hex color instead of using a token"   | `harness-design-web` and `harness-design-mobile` generate token-bound components with zero hardcoded values                          |
| "Our components don't meet WCAG contrast ratios"           | `harness-accessibility` runs 52 violation checks including color-contrast, ARIA roles, and semantic HTML -- mechanically, every time |
| "A CSS change broke the layout on mobile"                  | `harness-visual-regression` compares screenshots across a viewport matrix (375px to 1920px) and theme variants                       |
| "iOS and Android components look nothing alike"            | `harness-design-mobile` enforces platform-specific rules (HIG for iOS, Material Design 3 for Android) from the same tokens           |
| "Our design system docs say one thing, code does another"  | `/harness:detect-doc-drift` mechanically compares documentation against code and flags drift                                         |
| "We keep repeating the same accessibility mistakes"        | 10 focused a11y skills cover ARIA patterns, keyboard nav, screen readers, motion, forms, and more -- catching issues before review   |
| "Designers and developers disagree on the source of truth" | `harness-design` creates DESIGN.md and tokens.json as the single mechanical source of truth for aesthetic direction                  |
| "We don't know which components use which tokens"          | The knowledge graph tracks design_token and USES_TOKEN edges, showing exact token-to-component relationships                         |
| "RTL layout support is always an afterthought"             | `harness-i18n` and `design-i18n-design` enforce RTL/LTR considerations from the start                                                |

---

## Getting Started (5 Minutes)

### Prerequisites

- Node.js 22+
- An AI coding agent: Claude Code, Gemini CLI, or Cursor
- Git

### Install

```bash
npm install -g @harness-engineering/cli
harness setup
```

This installs the CLI and configures slash commands, MCP server, and agent personas for your detected AI clients. After this, `/harness:*` commands are available in every conversation.

### Verify Your Project

If your project already uses harness:

```
/harness:verify
```

This runs all mechanical checks in one pass -- configuration, dependencies, lint, typecheck, tests -- and gives you a binary pass/fail.

If your project doesn't use harness yet, initialize it:

```
/harness:initialize-project
```

This walks you through setup interactively and scaffolds everything, including the design block in `harness.config.json`.

### Configure the Design Block

The design block in `harness.config.json` controls how harness enforces design standards:

```json
{
  "design": {
    "strictness": "standard",
    "platforms": ["web", "ios", "android"],
    "tokenPath": "tokens/tokens.json",
    "aestheticIntent": "modern-minimal"
  }
}
```

**Strictness levels:**

| Level        | Behavior                                                                              |
| ------------ | ------------------------------------------------------------------------------------- |
| `strict`     | Zero tolerance -- any hardcoded value, missing token, or anti-pattern fails the build |
| `standard`   | Errors on violations, warnings on suggestions (recommended starting point)            |
| `permissive` | Warnings only -- useful during migration from a legacy design system                  |

### Build the Knowledge Graph

The knowledge graph powers token traceability, impact analysis, and design drift detection:

```bash
harness scan
```

This builds a structural graph from your code, git history, and documentation. It creates `design_token` and `aesthetic_intent` nodes that enable the most powerful design features.

---

## The Design Toolkit at a Glance

### Core Design Skills

**Domain skills** (invoke via `harness skill run <name>` or ask your AI agent):

| Skill                   | What It Does                                                                  | When to Use                                   |
| ----------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| `harness-design`        | Aesthetic direction (INTENT, DIRECTION, REVIEW, ENFORCE phases)               | Setting up a new project's visual identity    |
| `harness-design-system` | Token generation in W3C DTCG format (DISCOVER, DEFINE, GENERATE, VALIDATE)    | Creating or updating your design token system |
| `harness-design-web`    | Web component generation (React, Vue, Svelte, HTML)                           | Building token-bound web components           |
| `harness-design-mobile` | Mobile component generation (React Native, SwiftUI, Flutter, Jetpack Compose) | Building platform-correct mobile components   |

### Accessibility Skills

| Skill                   | What It Does                                                                 | When to Use                                  |
| ----------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| `harness-accessibility` | WCAG compliance scanning (SCAN, EVALUATE, REPORT, FIX) -- 52 violation codes | Any accessibility audit or pre-release check |

**10 focused a11y skills** for targeted checks:

| Skill                   | Focus Area                                              |
| ----------------------- | ------------------------------------------------------- |
| `aria-patterns`         | Correct ARIA roles, states, and properties              |
| `color-contrast`        | WCAG AA/AAA contrast ratio validation                   |
| `form-patterns`         | Label association, error messaging, required indicators |
| `image-text-alt`        | Alt text presence and quality                           |
| `keyboard-navigation`   | Tab order, focus management, keyboard traps             |
| `modal-patterns`        | Focus trapping, escape key, aria-modal                  |
| `motion-animation`      | prefers-reduced-motion, animation duration limits       |
| `screen-reader-testing` | Live regions, announcements, reading order              |
| `semantic-html`         | Landmark regions, heading hierarchy, list structure     |
| `testing-automation`    | Automated a11y test setup (axe-core, pa11y, Lighthouse) |

### Visual Regression and i18n

| Skill                       | What It Does                                              | When to Use                                  |
| --------------------------- | --------------------------------------------------------- | -------------------------------------------- |
| `harness-visual-regression` | Screenshot comparison (DETECT, BASELINE, COMPARE, REPORT) | UI changes, CSS updates, component refactors |
| `harness-i18n`              | Internationalization enforcement including RTL layout     | Projects with i18n.enabled in config         |
| `design-i18n-design`        | RTL/LTR design considerations for layout and typography   | Designing for bidirectional text support     |

### Review and Verification (Slash Commands)

| Command                     | What It Does                                               | When to Use                                       |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `/harness:code-review`      | 7-phase code review pipeline -- includes design compliance | Before merging any PR that touches UI             |
| `/harness:verify`           | Binary pass/fail across all mechanical checks              | Quick gate before pushing changes                 |
| `/harness:integrity`        | Chains verification + AI review in a single pass           | Milestone boundaries, release gates               |
| `/harness:detect-doc-drift` | Finds documentation out of sync with code                  | Regular maintenance, keeping design docs accurate |

### CLI Commands for CI/Scripts

| Command              | What It Does                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `harness ci check`   | Run ALL checks in one pass (validate, deps, docs, entropy, security, perf, arch, phase-gate, traceability) |
| `harness validate`   | Configuration and structure validation                                                                     |
| `harness scan`       | Build/refresh the knowledge graph                                                                          |
| `harness check-docs` | Documentation coverage check                                                                               |

---

## Day-to-Day Design Workflows

### 1. Creating a Design System from Scratch

**The old way:** Create tokens in Figma, manually export them, hand-write component styles, hope developers use the right values.

**The harness way:**

#### Step 1: Establish Aesthetic Direction

```bash
harness skill run harness-design
```

This runs a **4-phase pipeline**:

1. **INTENT** -- Captures your style, tone, and differentiator. What does your brand feel like? What sets it apart?
2. **DIRECTION** -- Translates intent into concrete aesthetic parameters. Selects from industry profiles (saas, fintech, healthcare, ecommerce, creative, emerging-tech, lifestyle, services).
3. **REVIEW** -- Validates direction against anti-pattern catalogs for typography, color, layout, and motion.
4. **ENFORCE** -- Generates `DESIGN.md` (human-readable aesthetic spec) and `tokens.json` (machine-readable tokens).

`DESIGN.md` becomes the single source of truth that both designers and developers reference. `tokens.json` is what the build system enforces.

#### Step 2: Generate Design Tokens

```bash
harness skill run harness-design-system
```

This runs a **4-phase pipeline**:

1. **DISCOVER** -- Audits existing styles, identifies inconsistencies, catalogs what you have today
2. **DEFINE** -- Builds a token hierarchy: primitive (raw values), semantic (purpose-mapped), component (scoped to specific elements)
3. **GENERATE** -- Outputs tokens in **W3C DTCG format** with curated palettes (50+ options) and typography pairings
4. **VALIDATE** -- Runs WCAG contrast validation on every color pairing, checks token naming consistency, verifies completeness

The token file follows the W3C Design Tokens Community Group specification, ensuring compatibility with Style Dictionary, Tokens Studio, and other tooling.

#### Step 3: Generate Components

For web:

```bash
harness skill run harness-design-web
```

For mobile:

```bash
harness skill run harness-design-mobile
```

See [Generating Platform Components from Tokens](#5-generating-platform-components-from-tokens) for details.

---

### 2. Reviewing a PR for Design Compliance

**The old way:** Eyeball the diff, check if colors look right, hope nobody used `#3b82f6` instead of `var(--color-primary)`.

**The harness way:**

```
/harness:code-review
```

The standard 7-phase code review pipeline includes design compliance checks when a design block is configured. It catches:

- **Hardcoded values** -- hex colors, pixel values, font stacks that should be tokens
- **Token misuse** -- using a semantic token in the wrong context (e.g., `--color-error` for a non-error state)
- **Anti-patterns** -- typography issues (too many font sizes, inconsistent line heights), color issues (insufficient contrast, palette drift), layout issues (magic numbers, inconsistent spacing scale), motion issues (missing prefers-reduced-motion, excessive duration)
- **Platform violations** -- web components using iOS patterns, or vice versa

Every finding includes **file:line**, **severity** (critical/important/suggestion), **rationale**, and **suggested fix**.

**Rigor levels:**

- `--fast` -- Quick pass for low-risk PRs (copy changes, minor tweaks)
- (default) -- Standard review with design compliance
- `--thorough` -- Full roster with meta-judge for design system changes
- `--deep` -- Adds accessibility threat modeling

**Post to GitHub:**

```
/harness:code-review --comment
```

This posts inline comments directly on the PR, so developers see design violations right in their review flow.

---

### 3. Checking Accessibility

**The old way:** Run a Lighthouse audit late in the process, scramble to fix issues, miss things that automated tools can't catch alone.

**The harness way:**

#### Full WCAG Audit

```bash
harness skill run harness-accessibility
```

This runs a **4-phase pipeline**:

1. **SCAN** -- Crawls the target pages or components, building an accessibility tree
2. **EVALUATE** -- Checks against **52 violation codes** covering WCAG 2.1 AA and AAA criteria
3. **REPORT** -- Generates a structured report with severity, affected elements, and WCAG criterion references
4. **FIX** -- Auto-fixes what it can, flags what needs human judgment

**Auto-fixable items** (harness fixes these directly):

- Missing alt text (generates descriptive text from context)
- Missing or incorrect ARIA roles
- Incorrect tabIndex values
- Missing form label associations (for/id pairing)

**Manual review items** (harness flags these for human decision):

- Color choices that pass contrast ratios but create readability issues
- Layout decisions that affect cognitive accessibility
- Content ordering that affects screen reader comprehension

#### Targeted Checks

For specific accessibility concerns, use the focused skills:

```bash
# Check contrast ratios across your palette
harness skill run color-contrast

# Audit keyboard navigation flow
harness skill run keyboard-navigation

# Verify screen reader compatibility
harness skill run screen-reader-testing

# Check ARIA usage correctness
harness skill run aria-patterns

# Audit form accessibility
harness skill run form-patterns

# Verify modal/dialog patterns
harness skill run modal-patterns

# Check motion/animation safety
harness skill run motion-animation

# Audit alt text quality
harness skill run image-text-alt

# Validate semantic HTML structure
harness skill run semantic-html

# Set up automated a11y testing
harness skill run testing-automation
```

> **Pro tip:** Run `harness skill run testing-automation` first to set up axe-core or pa11y in your test suite. Then every future CI run catches accessibility regressions automatically.

---

### 4. Setting Up Visual Regression Tests

**The old way:** Manually compare screenshots across browsers. Miss the 2px layout shift on tablet. Ship it. Get a bug report.

**The harness way:**

```bash
harness skill run harness-visual-regression
```

This runs a **4-phase pipeline**:

1. **DETECT** -- Finds existing visual test infrastructure (Storybook, Chromatic, Percy, Playwright screenshots) and catalogs components
2. **BASELINE** -- Captures reference screenshots across the full viewport and theme matrix
3. **COMPARE** -- Runs pixel-level diffs against baselines using your configured tool
4. **REPORT** -- Classifies changes as intentional updates, regressions, or environmental noise

**Viewport matrix:**

| Viewport | Width  | Represents       |
| -------- | ------ | ---------------- |
| Mobile   | 375px  | iPhone SE/mini   |
| Tablet   | 768px  | iPad portrait    |
| Desktop  | 1280px | Standard laptop  |
| Wide     | 1920px | External monitor |

Each viewport is tested against all configured **theme variants** (light, dark, high-contrast, etc.), creating a comprehensive comparison grid.

**Supported tools:**

| Tool       | Best For                                      |
| ---------- | --------------------------------------------- |
| Chromatic  | Storybook-based workflows, cloud diffing      |
| Percy      | Cross-browser visual testing, CI integration  |
| Pixelmatch | Local pixel-level comparison, zero cost       |
| Playwright | E2E visual testing alongside functional tests |

**When to run:**

- After any CSS or styling change
- After updating design tokens
- After component refactors
- Before releases (full baseline comparison)

---

### 5. Generating Platform Components from Tokens

**The old way:** Design in Figma, hand off specs, developers interpret them differently per platform, components drift from the source of truth.

**The harness way:**

#### Web Components

```bash
harness skill run harness-design-web
```

Generates components for **React**, **Vue**, **Svelte**, or **plain HTML** with:

- **Token binding** -- Every value references a design token. No hardcoded colors, spacing, or typography.
- **CSS strategy support** -- Choose your approach:

| Strategy    | When to Use                                               |
| ----------- | --------------------------------------------------------- |
| Tailwind    | Utility-first projects, rapid prototyping                 |
| CSS Modules | Scoped styles, established projects                       |
| CSS-in-JS   | Runtime theming, dynamic styles (styled-components, etc.) |

- **Responsive behavior** -- Components respect the viewport matrix and adapt using your token breakpoints
- **Accessibility built in** -- Generated components include ARIA attributes, keyboard handlers, and semantic HTML

#### Mobile Components

```bash
harness skill run harness-design-mobile
```

Generates components for **React Native**, **SwiftUI**, **Flutter**, or **Jetpack Compose** with:

- **Platform-specific rules** -- iOS components follow Apple Human Interface Guidelines (HIG). Android components follow Material Design 3. The skill knows the difference and enforces it.
- **Token binding** -- Same tokens, platform-appropriate implementation. `--color-primary` becomes `Color.primary` in SwiftUI and `MaterialTheme.colorScheme.primary` in Jetpack Compose.
- **Adaptive patterns** -- Platform navigation patterns, safe area handling, dynamic type support

> **Key principle:** Components are generated from your tokens, not the other way around. Change a token, regenerate, and every component updates. This is the mechanical guarantee that your design system stays consistent.

---

### 6. Auditing Design Consistency

**The old way:** Periodic manual audits. Spreadsheets of violations. Fixes that drift again within a month.

**The harness way:**

#### Run the Aesthetic Direction Review

```bash
harness skill run harness-design
```

In its REVIEW and ENFORCE phases, this skill:

- **Detects anti-patterns** across four categories:
  - **Typography** -- Too many font sizes, inconsistent line heights, missing scale ratios, orphaned font families
  - **Color** -- Palette drift (colors not in the token set), insufficient contrast pairings, overuse of one-off values
  - **Layout** -- Magic numbers, inconsistent spacing, broken grid alignment, missing responsive breakpoints
  - **Motion** -- Excessive animation duration, missing reduced-motion alternatives, jarring transitions
- **Compares against industry profiles** -- Each profile (saas, fintech, healthcare, ecommerce, creative, emerging-tech, lifestyle, services) has specific expectations. A fintech app flagged for playful animations is different from a creative portfolio flagged for the same.
- **References the knowledge base** -- Anti-pattern catalogs, curated palettes, and typography pairings stored in `agents/skills/shared/design-knowledge/industries/` provide the baseline for comparison.

#### Check for Documentation Drift

```
/harness:detect-doc-drift
```

Compares your `DESIGN.md`, component documentation, and token documentation against the actual code. Flags anywhere documentation says one thing but the implementation does another.

#### Full Integrity Check

```
/harness:integrity
```

Chains verification (do the files exist, are they substantive, are they wired in?) with AI review (are they correct, consistent, and complete?) into a single report. Use this at milestone boundaries.

---

### 7. Working with the Knowledge Graph for Design

The knowledge graph is a structural model of your codebase -- 30 node types, 25 edge types -- that includes design-specific nodes and relationships.

#### Build It

```bash
harness scan
```

#### Design-Specific Graph Nodes

The **DesignIngestor** creates these node types during scan:

| Node Type          | What It Represents                                      |
| ------------------ | ------------------------------------------------------- |
| `design_token`     | A token in your token file (color, spacing, typography) |
| `aesthetic_intent` | A declared design direction from DESIGN.md              |

#### Design-Specific Graph Edges

| Edge Type         | Meaning                                             |
| ----------------- | --------------------------------------------------- |
| `USES_TOKEN`      | A component file references a specific design token |
| `DECLARES_INTENT` | A design file declares an aesthetic intent          |
| `VIOLATES_DESIGN` | A file violates a declared design constraint        |

#### What This Enables

| Capability             | How to Use It                     | Design Value                                                              |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| **Token traceability** | `/harness:impact-analysis`        | "If I change this color token, which components are affected?"            |
| **Violation tracking** | `ask_graph` (MCP tool)            | "Which files violate our design constraints?"                             |
| **Blast radius**       | `compute_blast_radius` (MCP tool) | "If I rename this spacing token, what breaks?"                            |
| **Usage analysis**     | `ask_graph` (MCP tool)            | "Which tokens are unused? Which are used most?"                           |
| **Dependency mapping** | `get_relationships` (MCP tool)    | "Show me every component that depends on our button token set"            |
| **Anomaly detection**  | `detect_anomalies` (MCP tool)     | Find components with unusual token usage patterns (potential style drift) |

#### Example: Token Change Impact

```
1. Run /harness:impact-analysis on tokens/tokens.json
2. See which components use the tokens you plan to change
3. Run harness skill run harness-visual-regression on affected components
4. Confirm no unintended visual regressions before merging
```

---

## CI/CD Integration for Design Gates

### The All-in-One CI Check

```bash
harness ci check --json
```

This runs 9 checks in sequence. The ones most relevant to design:

| Check      | What It Validates                                 | Blocks Merge?          |
| ---------- | ------------------------------------------------- | ---------------------- |
| `validate` | Configuration integrity, token file validity      | Yes (error)            |
| `deps`     | Layer dependency boundaries, no forbidden imports | Yes (error)            |
| `docs`     | Documentation coverage meets threshold            | Configurable (warning) |
| `entropy`  | Code drift, dead code detection                   | Configurable (warning) |
| `arch`     | Architecture constraints, baselines               | Yes (error)            |

### Design-Specific CI Checks

Design compliance integrates into existing harness verification commands:

```bash
# Full verification including design checks
harness ci check

# Validate project structure and token configuration
harness validate

# Check documentation coverage (catches undocumented tokens)
harness check-docs
```

When the design block is configured in `harness.config.json`, these checks automatically include:

- Token file validity (well-formed W3C DTCG format)
- No hardcoded values in component files (when strictness is `strict`)
- Design documentation coverage
- Token usage completeness (no orphaned tokens)

### GitHub Actions Setup

```bash
harness ci init --platform github
```

Generates a `.github/workflows/harness.yml` that:

- Runs checks on push to main and on pull requests
- Posts a summary comment on the PR
- Labels the PR on failure

### JSON Output for Reporting

```bash
# Get just the summary
harness ci check --json | jq '.summary'

# List all failing checks
harness ci check --json | jq '.checks[] | select(.status == "fail")'

# Get all design-related issues
harness ci check --json | jq '[.checks[].issues[] | select(.category == "design")]'
```

---

## Improving Your Design Processes Over Time

### Week 1: Foundation

- Install harness CLI and run `harness setup`
- Run `/harness:verify` on your project to see where you stand
- Configure the design block in `harness.config.json` (set strictness to `permissive` if migrating)
- Run `harness skill run harness-design` to establish aesthetic direction and generate DESIGN.md
- Run `harness scan` to build the knowledge graph with design nodes

### Week 2: Tokens and Components

- Run `harness skill run harness-design-system` to generate or formalize your token set
- Generate components for your primary platform with `harness-design-web` or `harness-design-mobile`
- Start using `/harness:code-review` for PRs that touch UI
- Run `harness skill run harness-accessibility` on your most-used pages to establish an a11y baseline

### Week 3: Visual Safety Net

- Set up `harness skill run harness-visual-regression` with baseline screenshots
- Run `harness skill run testing-automation` to add automated a11y tests to your CI
- Increase design strictness from `permissive` to `standard`
- Run `/harness:detect-doc-drift` to catch design docs that are already out of sync

### Week 4: Full Enforcement

- Add `harness ci check` to your CI pipeline if not already present
- Use `/harness:impact-analysis` before any token changes to understand blast radius
- Run the focused a11y skills (`color-contrast`, `keyboard-navigation`, `screen-reader-testing`) on critical flows
- Consider moving to `strict` strictness for new components while keeping `standard` for legacy code

### Ongoing: Continuous Improvement

- Run `/harness:detect-doc-drift` weekly to keep design docs accurate
- Run `harness skill run harness-accessibility` before each release
- Update visual regression baselines when intentional design changes land
- Monitor the knowledge graph for `VIOLATES_DESIGN` edges -- these are your design debt
- Use `harness skill run harness-design` periodically to re-audit against anti-pattern catalogs
- Review token usage via `ask_graph` to find unused tokens and consolidation opportunities

---

## Quick Reference Card

### "I need to..." --> Use this

| I Need To...                           | Command / Skill                               | Type                |
| -------------------------------------- | --------------------------------------------- | ------------------- |
| Set aesthetic direction                | `harness skill run harness-design`            | Domain skill        |
| Create or update design tokens         | `harness skill run harness-design-system`     | Domain skill        |
| Generate web components from tokens    | `harness skill run harness-design-web`        | Domain skill        |
| Generate mobile components from tokens | `harness skill run harness-design-mobile`     | Domain skill        |
| Run a full WCAG accessibility audit    | `harness skill run harness-accessibility`     | Domain skill        |
| Check color contrast ratios            | `harness skill run color-contrast`            | Domain skill        |
| Audit keyboard navigation              | `harness skill run keyboard-navigation`       | Domain skill        |
| Test screen reader compatibility       | `harness skill run screen-reader-testing`     | Domain skill        |
| Set up automated a11y tests            | `harness skill run testing-automation`        | Domain skill        |
| Run visual regression tests            | `harness skill run harness-visual-regression` | Domain skill        |
| Review a PR for design compliance      | `/harness:code-review`                        | Slash command       |
| Run all quality checks                 | `/harness:verify` or `harness ci check`       | Slash command / CLI |
| Check if design docs match code        | `/harness:detect-doc-drift`                   | Slash command       |
| See what breaks if I change a token    | `/harness:impact-analysis`                    | Slash command       |
| Deep audit before a release            | `/harness:integrity`                          | Slash command       |
| Handle RTL/LTR layout                  | `harness skill run design-i18n-design`        | Domain skill        |
| Build the knowledge graph              | `harness scan`                                | CLI                 |
| Ask questions about token usage        | `ask_graph` MCP tool                          | MCP tool            |

### Exit Codes for CI

| Code | Meaning                   | Action      |
| ---- | ------------------------- | ----------- |
| `0`  | All checks passed         | Proceed     |
| `1`  | One or more checks failed | Block merge |
| `2`  | Harness internal error    | Investigate |

---

## FAQ

### Do I need to be a developer to use harness?

No. The slash commands work in plain English through your AI coding tool. You describe what you want ("review this PR for design issues", "check the accessibility of this page", "generate a button component from our tokens") and the skill handles the technical execution. The CLI commands are also straightforward for CI integration.

### Does harness replace Figma or our design tools?

No. Harness **enforces** the design decisions you make in your design tools. You still design in Figma, Sketch, or whatever you prefer. Harness ensures that what gets built in code matches what you designed -- mechanically, every time. Think of it as the bridge between design intent and implementation reality.

### What is tokens.json and why does it matter?

`tokens.json` is your design system's source of truth in code. It follows the **W3C Design Tokens Community Group (DTCG) format**, which means it works with Style Dictionary, Tokens Studio, and other industry-standard tooling. Every color, spacing value, typography setting, and motion parameter lives here. When harness generates components, it binds them to these tokens -- no hardcoded values.

### What are industry profiles?

Industry profiles are curated sets of design expectations stored in the harness knowledge base. When you run `harness-design`, it uses your selected profile (saas, fintech, healthcare, ecommerce, creative, emerging-tech, lifestyle, services) to calibrate its anti-pattern detection. A healthcare app has different typography and color expectations than a creative portfolio. The profiles encode these differences so the tool gives relevant feedback.

### How does accessibility checking work without a browser?

The `harness-accessibility` skill performs **static analysis** of your component code, templates, and markup. It checks for structural issues (missing ARIA attributes, incorrect heading hierarchy, missing form labels) that don't need a browser to detect. For runtime checks (actual contrast rendering, screen reader behavior), use the `testing-automation` skill to set up axe-core or pa11y in your test suite, which runs in a real browser during CI.

### Can I use harness with an existing design system?

Yes. Run `harness skill run harness-design-system` in DISCOVER mode -- it audits your existing styles, identifies inconsistencies, and helps you formalize what you already have into W3C DTCG tokens. Set strictness to `permissive` during migration so existing code doesn't block your pipeline, then tighten to `standard` or `strict` once you've resolved violations.

### How do I handle platform differences between iOS and Android?

`harness-design-mobile` is platform-aware. It reads the same `tokens.json` but generates platform-appropriate implementations:

- **iOS (SwiftUI)** -- Follows Apple Human Interface Guidelines. Uses system fonts, SF Symbols conventions, native navigation patterns.
- **Android (Jetpack Compose)** -- Follows Material Design 3. Uses MaterialTheme, standard component slots, navigation rail/drawer patterns.
- **React Native** -- Generates cross-platform components with platform-specific overrides where needed.
- **Flutter** -- Uses ThemeData and platform-adaptive widgets.

The tokens are the same. The implementation respects each platform's conventions.

### What if I disagree with an anti-pattern finding?

Anti-pattern detection is configurable. If a finding is not relevant to your project (e.g., the motion catalog flags an animation that is core to your brand), you can:

1. Adjust strictness in `harness.config.json` (move from `strict` to `standard`)
2. Add specific exclusions to the design configuration
3. Document the intentional deviation in DESIGN.md so harness treats it as a declared decision rather than a violation

### How do visual regression tests handle dynamic content?

The `harness-visual-regression` skill includes noise classification in its REPORT phase. It distinguishes between:

- **Intentional changes** -- Flagged for review, baselines updated on approval
- **Regressions** -- Unexpected pixel differences that need investigation
- **Environmental noise** -- Font rendering differences, timestamp changes, animation timing -- filtered out automatically

For content that changes between runs (timestamps, user data), configure stable test fixtures in your visual test setup.

---

## Summary

Harness Engineering gives designers a **mechanical guarantee** that design decisions survive implementation. Instead of manually auditing PRs, chasing hardcoded values, and discovering accessibility issues in production:

1. **Define once, enforce everywhere** -- `harness-design` and `harness-design-system` create DESIGN.md and tokens.json as the source of truth, enforced on every change
2. **Generate, don't hand off** -- `harness-design-web` and `harness-design-mobile` produce token-bound components directly from your tokens, eliminating interpretation drift
3. **Catch accessibility early** -- `harness-accessibility` and 10 focused a11y skills find WCAG violations before they ship, with auto-fixes for common issues
4. **See every pixel change** -- `harness-visual-regression` catches CSS regressions across viewports and themes before they reach users
5. **Know your blast radius** -- The knowledge graph tracks every token-to-component relationship, so you know exactly what changes when you update a token
6. **Gate your pipeline** -- `harness ci check` runs design compliance as part of the standard CI gate

The goal isn't to slow down development. It's to make the **right design** ship, every time, across every platform.
