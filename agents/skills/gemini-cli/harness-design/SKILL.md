# Harness Design

> Aesthetic direction workflow. Capture design intent, generate DESIGN.md with anti-patterns and platform notes, review components against aesthetic guidelines, and enforce design constraints at configurable strictness levels.

## When to Use

- Establishing aesthetic direction for a new or existing project (style, tone, differentiator)
- When `on_new_feature` triggers fire and the feature has design scope requiring aesthetic guidance
- Reviewing existing components against declared design intent and anti-patterns
- Enforcing design constraints via the knowledge graph with configurable strictness
- Generating or updating `design-system/DESIGN.md` with aesthetic direction, anti-patterns, and platform notes
- NOT for design token generation or palette selection (use harness-design-system)
- NOT for accessibility auditing or WCAG compliance (use harness-accessibility)
- NOT for platform-specific token implementation into CSS/Tailwind/etc. (use harness-design-web/mobile, Phase 5)

## Process

### Phase 1: INTENT -- Capture Aesthetic Intent

1. **Read existing design artifacts.** Search for:
   - `design-system/DESIGN.md` -- existing aesthetic direction documentation (from harness-design-system output)
   - `design-system/tokens.json` -- existing W3C DTCG tokens (palette, typography, spacing defined by harness-design-system)
   - `harness.config.json` -- project configuration for design settings

2. **Check harness configuration.** Read `harness.config.json` for:
   - `design.strictness` -- enforcement level (`strict`, `standard`, `permissive`). If not set, default to `standard`.
   - `design.platforms` -- which platforms are enabled (web, mobile)
   - `design.aestheticIntent` -- path to design intent doc (default: `design-system/DESIGN.md`)

3. **Load industry profile.** If an industry is specified (via CLI `--industry` arg or config), read the industry profile from `agents/skills/shared/design-knowledge/industries/{industry}.yaml`. Available industries include: `saas`, `fintech`, `healthcare`, `ecommerce`, `creative`, `emerging-tech`, `lifestyle`, `services`. The profile provides sector-specific guidance on:
   - Recommended visual style and tone
   - Industry conventions and user expectations
   - Regulatory or cultural considerations
   - Common anti-patterns for the sector

4. **Capture user intent.** Ask the user to define:
   - **Style:** minimal, expressive, corporate, playful, editorial, or custom
   - **Tone:** warm, cool, neutral, bold, muted, or custom
   - **Key differentiator:** what makes this product's visual identity unique
   - **Anti-patterns:** specific design choices to explicitly avoid (e.g., "no gradients on data elements," "no decorative borders on cards")

5. **Load shared design knowledge.** Read anti-pattern awareness from `agents/skills/shared/design-knowledge/`:
   - `palettes/curated.yaml` -- curated palettes to understand which aesthetic families are available
   - `typography/pairings.yaml` -- typography pairings to understand which font combinations are recommended
   - Industry-specific anti-pattern guidance from the loaded industry profile

6. **Confirm intent before proceeding.** Present a summary of the captured aesthetic intent to the user. This is a hard gate -- no DESIGN.md generation without the user confirming their aesthetic intent.

### Phase 2: DIRECTION -- Generate DESIGN.md

1. **Generate or update `design-system/DESIGN.md`.** The document must contain the following sections:

   **Aesthetic Direction:**
   - Style declaration (the chosen style and what it means for this project)
   - Tone description (how the tone manifests in color usage, typography weight, spacing density)
   - Key differentiator (the unique visual identity aspect and how it is expressed)

   **Anti-Patterns:**
   - Project-specific anti-patterns (from user input in Phase 1)
   - Industry-informed anti-patterns (from the loaded industry profile)
   - Each anti-pattern includes: name, description, example of what NOT to do, and why it conflicts with the declared intent

   **Platform Notes:**
   - Web-specific guidance (CSS strategy, responsive behavior, animation preferences)
   - Mobile-specific guidance (touch targets, native component usage, platform conventions)
   - Cross-platform consistency rules (which elements must be identical vs. platform-adapted)

   **Strictness Override:**
   - Current `designStrictness` level and what it means
   - Instructions for changing strictness in `harness.config.json`
   - Behavior differences per level:
     - `permissive` -- all design violations reported as `info` (nothing blocks)
     - `standard` -- anti-pattern and accessibility violations are `warn`, critical violations are `error` (default)
     - `strict` -- accessibility violations are `error` (blocks CI/PR merge), anti-pattern violations are `warn`

2. **Populate the knowledge graph.** If a graph exists at `.harness/graph/`:
   - Create an `AestheticIntent` node with properties: style, tone, differentiator, strictness level. Use `DesignIngestor` from `packages/graph/src/ingest/DesignIngestor.ts` for graph ingestion.
   - Create a `DECLARES_INTENT` edge from the project node to the `AestheticIntent` node.
   - This enables downstream skills (harness-accessibility, harness-impact-analysis) to query the declared design intent.

3. **Run harness validate.** After generating DESIGN.md, verify the project still passes all constraints. The new file must not break existing validations.

### Phase 3: REVIEW -- Review Components Against Design Intent

1. **Scan for anti-pattern violations.** Use Grep to search the codebase for patterns that match declared anti-patterns:
   - Hardcoded color values not present in `design-system/tokens.json` (suggests off-brand color usage)
   - Font families flagged as anti-patterns in the design intent (e.g., decorative fonts in a minimal project)
   - Layout patterns on the forbidden list (e.g., excessive drop shadows in a flat design, gradients on data elements)
   - CSS properties or values that contradict the declared style (e.g., rounded corners in a sharp-edge design)

2. **Load detection rules from shared design knowledge.** Read from `agents/skills/shared/design-knowledge/`:
   - Typography anti-patterns: font combinations that clash with the declared style
   - Color anti-patterns: usage patterns that undermine the declared tone
   - Industry-specific rules from the loaded industry profile

3. **Cross-reference with graph constraints.** If a graph exists at `.harness/graph/`:
   - Query for existing `VIOLATES_DESIGN` edges using `DesignConstraintAdapter` from `packages/graph/src/constraints/DesignConstraintAdapter.ts`
   - Compare current findings against previously recorded violations
   - Identify new violations and resolved violations

4. **Assign severity based on `designStrictness`:**
   - `permissive` -- all findings are `info` severity
   - `standard` -- anti-pattern violations and accessibility-related findings are `warn`, critical design constraint violations are `error`
   - `strict` -- accessibility violations are `error` (blocks), anti-pattern violations are `warn`

5. **Report findings.** Present each finding with:
   - File path and line number
   - Violation description and which anti-pattern or design constraint it violates
   - Severity level (based on current strictness)
   - Suggested remediation

### Phase 4: ENFORCE -- Surface and Record Violations

1. **Create constraint nodes in the graph.** For each violated design rule, if a graph exists at `.harness/graph/`:
   - Create a `DesignConstraint` node for the rule being violated (if one does not already exist)
   - Create a `VIOLATES_DESIGN` edge from the violating component to the `DesignConstraint` node
   - Use `DesignConstraintAdapter` from `packages/graph/src/constraints/DesignConstraintAdapter.ts` to manage constraint creation and violation recording

2. **Format violation output.** Each violation follows a numbered format:

   ```
   DESIGN-001 [warn] Anti-pattern: gradient used on data visualization element
     File:       src/components/Chart.tsx
     Line:       42
     Constraint: No gradients on data elements
     Intent:     Style "minimal" prohibits decorative effects on informational components
     Fix:        Replace linear-gradient with solid color from token "neutral.100"

   DESIGN-002 [error] Off-brand color: hardcoded #ff6b35 not in token set
     File:       src/components/Alert.tsx
     Line:       18
     Constraint: All colors must reference design tokens
     Intent:     Tone "cool" conflicts with warm orange accent
     Fix:        Use token "semantic.warning" (#f59e0b) or add color to tokens.json via harness-design-system

   DESIGN-003 [info] Typography: decorative font "Playfair Display" used in component
     File:       src/components/Hero.tsx
     Line:       8
     Constraint: Heading font must match declared typography pairing
     Intent:     Style "minimal" uses Inter for all headings
     Fix:        Replace with token "typography.heading.fontFamily"
   ```

3. **Control severity by `designStrictness`:**
   - `permissive` -- all violations output as `info` (DESIGN-001 [info], DESIGN-002 [info], etc.)
   - `standard` -- anti-patterns and a11y = `warn`, off-brand tokens = `error` (default)
   - `strict` -- a11y violations = `error` (blocks CI), anti-patterns = `warn`, off-brand tokens = `error`

4. **Run harness validate.** After recording violations in the graph, run validation to ensure the enforcement pass is consistent with the project state.

## Harness Integration

- **`harness validate`** -- Run after generating DESIGN.md and after enforcement passes. Design violations surface as constraint violations at the configured strictness level.
- **`harness scan`** -- Run after changes to refresh the knowledge graph. Updated graph enables accurate violation detection and impact analysis.
- **`DesignIngestor`** (`packages/graph/src/ingest/DesignIngestor.ts`) -- Parses `tokens.json` and `DESIGN.md` to create graph nodes representing the design system. Creates `AestheticIntent` nodes and `DECLARES_INTENT` edges during the DIRECTION phase.
- **`DesignConstraintAdapter`** (`packages/graph/src/constraints/DesignConstraintAdapter.ts`) -- Manages `DesignConstraint` nodes and `VIOLATES_DESIGN` edges in the graph. Reads `design.strictness` to control violation severity. Used during REVIEW and ENFORCE phases.
- **`harness-design-system`** -- Dependency. This skill reads tokens and design intent generated by harness-design-system. Token-level issues (palette changes, new colors) are resolved by running harness-design-system, not this skill.
- **`harness-impact-analysis`** -- When design tokens change, impact analysis traces which components consume affected tokens. Use this to determine which components need re-review after token updates.

## Success Criteria

- `design-system/DESIGN.md` exists with all required sections: Aesthetic Direction, Anti-Patterns, Platform Notes, Strictness Override
- Anti-patterns are detected in the codebase and reported with file paths, line numbers, and severity
- `designStrictness` configuration is read from `harness.config.json` and respected in all severity assignments
- `AestheticIntent` node created in the knowledge graph with style, tone, differentiator, and strictness properties
- `DECLARES_INTENT` edge connects the project to the aesthetic intent node
- `DesignConstraint` nodes created for each violated design rule
- `VIOLATES_DESIGN` edges connect violating components to their constraint nodes
- Violations output in numbered format (DESIGN-001, DESIGN-002, etc.) with severity matching strictness level
- `harness validate` passes after DESIGN.md generation and enforcement
- User confirmed aesthetic intent before DESIGN.md generation (hard gate)

## Examples

### Example: SaaS Analytics Dashboard Aesthetic Direction

**Context:** A SaaS analytics dashboard project. Industry: `saas`. Design tokens already generated by harness-design-system. No existing DESIGN.md aesthetic direction.

**INTENT capture:**

```
Industry profile:     Loaded (saas) -- recommends professional, data-focused aesthetic
Style:                Minimal
Tone:                 Cool, professional
Differentiator:       Dense information display with generous whitespace between sections
Anti-patterns:        No gradients on data elements, no decorative borders on cards,
                      no more than 2 font weights per component
Strictness:           standard (from harness.config.json)
```

**DIRECTION output (DESIGN.md excerpt):**

```markdown
## Aesthetic Direction

**Style:** Minimal -- clean lines, flat surfaces, no decorative elements that do not serve
an informational purpose. Every visual element must earn its place by conveying data or
guiding the user's eye.

**Tone:** Cool, professional -- slate and blue palette dominates. Warm colors reserved
exclusively for semantic states (warning, error). No warm accents in neutral UI.

**Differentiator:** Dense information display with generous whitespace between sections.
Components are compact internally but breathe externally. Card padding is tight (12px),
but gaps between cards are generous (24px+).

## Anti-Patterns

| Pattern                    | Description                                  | Why It Conflicts                           |
| -------------------------- | -------------------------------------------- | ------------------------------------------ |
| Gradients on data elements | linear-gradient on charts, tables, cards     | Minimal style: flat surfaces only          |
| Decorative card borders    | border with color on .card elements          | Minimal style: borders are structural only |
| Excess font weights        | More than 2 font-weight values per component | Minimal style: typographic restraint       |

## Strictness Override

Current level: **standard**

To change, update `harness.config.json`:
"design": { "strictness": "strict" | "standard" | "permissive" }
```

**REVIEW findings:**

```
Found 3 anti-pattern violations in 2 files:

DESIGN-001 [warn] Gradient on data element
  File:       src/components/RevenueChart.tsx:42
  Constraint: No gradients on data elements
  Fix:        Replace linear-gradient(#3b82f6, #1d4ed8) with solid token "primary.500"

DESIGN-002 [warn] Decorative border on card
  File:       src/components/MetricCard.tsx:15
  Constraint: No decorative borders on cards
  Fix:        Remove border-color: #3b82f6, use border-color: transparent or remove border

DESIGN-003 [info] Three font weights in one component
  File:       src/components/MetricCard.tsx:8
  Constraint: Max 2 font weights per component
  Fix:        Consolidate font-weight values to 400 (body) and 600 (heading) only
```

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No DESIGN.md generated without the user confirming aesthetic intent.** The INTENT phase must end with explicit user confirmation of style, tone, differentiator, and anti-patterns. Do not generate based on assumptions.
- **No enforcement without reading tokens from harness-design-system.** The REVIEW and ENFORCE phases require `design-system/tokens.json` to exist. If tokens have not been generated, instruct the user to run harness-design-system first.
- **Strictness must be read from configuration, not assumed.** Read `design.strictness` from `harness.config.json`. If the key does not exist, default to `standard` and report the default to the user. Never hardcode a strictness level.
- **No anti-pattern detection without a declared intent.** The REVIEW phase requires an existing DESIGN.md with declared anti-patterns. If no intent has been captured, run the INTENT and DIRECTION phases first.
- **No graph mutations without validating node types.** When creating `AestheticIntent`, `DesignConstraint`, or `VIOLATES_DESIGN` edges, verify the node and edge types are registered in the graph schema before writing.

## Escalation

- **When the user cannot articulate a style or tone:** Suggest industry-based defaults from the loaded industry profile. Present 2-3 options with examples: "Based on the saas industry profile, common styles are: (1) Minimal -- clean, data-focused, (2) Corporate -- structured, trustworthy, (3) Expressive -- colorful, engaging. Which resonates most?"
- **When declared anti-patterns conflict with existing code:** Present a migration path rather than flagging every instance as a violation. Report: "Found 47 instances of gradients on data elements. Recommend a phased migration: (1) Update new components immediately, (2) Schedule legacy component updates over 3 sprints. Set strictness to 'permissive' during migration to avoid blocking CI."
- **When tokens do not exist yet:** Do not attempt to infer a token set. Instruct the user: "Design tokens have not been generated. Run harness-design-system first to create `design-system/tokens.json`, then re-run harness-design for aesthetic direction."
- **When strictness level conflicts with team velocity:** Explain the tradeoffs: "Strict mode blocks PRs on any design violation. If this is slowing the team, consider 'standard' mode which blocks only on critical violations (off-brand colors, accessibility) and warns on anti-patterns."
- **When the knowledge graph is unavailable:** Skip graph operations in DIRECTION and ENFORCE phases. Log: "Graph not available at `.harness/graph/` -- skipping AestheticIntent node creation and violation recording. Run `harness scan` later to populate." Continue with file-based operations.
