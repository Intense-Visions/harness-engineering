# Harness Accessibility

> WCAG compliance verification and remediation. Scan components for accessibility violations, evaluate severity against design strictness, generate actionable reports, and apply automated fixes for mechanical issues.

## When to Use

- Auditing new or existing UI components for WCAG AA accessibility compliance
- Before PR merge to catch accessibility regressions in UI changes
- When `on_new_feature` triggers fire and the feature includes UI components
- When design tokens change (color updates may break contrast compliance)
- After running harness-design-system to validate the generated palette
- When `on_project_init` triggers fire to establish an accessibility baseline
- NOT for design token generation or palette selection (use harness-design-system)
- NOT for visual design review or aesthetic direction (use harness-design, Phase 4)
- NOT for non-UI code (backend services, CLI tools, data pipelines)

## Process

### Phase 1: SCAN -- Detect Accessibility Violations

1. **Load design tokens.** Read `design-system/tokens.json` (if it exists) to identify declared color values and contrast pairs. Token-defined colors are the source of truth -- hardcoded colors in components are themselves a violation.

2. **Read design strictness.** Check `harness.config.json` for `design.strictness`:
   - `strict` -- all findings are errors that block (CI fails, PR cannot merge)
   - `standard` -- warnings are visible, errors block (default behavior)
   - `permissive` -- all findings are informational (nothing blocks, but everything is reported)

2.5. **Check for i18n skill overlap.** Read `harness.config.json` for `i18n.enabled`:

- If `i18n.enabled: true`, **defer** `lang` and `dir` attribute checks to `harness-i18n`. Do not scan for missing `lang` on `<html>` or missing `dir` on user-content containers -- those checks are covered by the i18n skill's scan phase with more context (locale-aware, RTL-aware).
- If `i18n.enabled` is false or absent, scan for `lang`/`dir` as normal (these remain part of the accessibility audit).
- This deduplication prevents the same finding from appearing in both the accessibility report and the i18n report.

3. **Scan component files.** Search all files matching `.tsx`, `.jsx`, `.vue`, `.svelte`, `.html` for the following violations:

   **Images and media:**
   - `<img>` tags without `alt` attribute (`A11Y-001`)
   - `<img>` tags with empty `alt=""` on non-decorative images (`A11Y-002`)
   - `<video>` and `<audio>` without captions/transcripts (`A11Y-003`)

   **ARIA and semantics:**
   - Interactive elements (`<button>`, `<a>`, `<input>`) without accessible labels (`A11Y-010`)
   - Icon-only buttons without `aria-label` or visually hidden text (`A11Y-011`)
   - Clickable `<div>` or `<span>` without `role="button"` and keyboard handler (`A11Y-012`)
   - Missing `role` attributes on custom interactive widgets (`A11Y-013`)
   - `aria-hidden="true"` on focusable elements (`A11Y-014`)

   **Heading structure:**
   - Non-sequential heading levels (e.g., `<h1>` followed by `<h3>`, skipping `<h2>`) (`A11Y-020`)
   - Multiple `<h1>` elements on a single page/component (`A11Y-021`)
   - Empty headings (`A11Y-022`)

   **Color and contrast:**
   - Hardcoded color values not from the token set (`A11Y-030`)
   - Inline styles with color/background-color that may fail contrast (`A11Y-031`)

   **Keyboard navigation:**
   - `onClick` handlers without corresponding `onKeyDown`/`onKeyUp` (`A11Y-040`)
   - Missing `tabIndex` on custom interactive elements (`A11Y-041`)
   - Positive `tabIndex` values (disrupts natural tab order) (`A11Y-042`)
   - Missing focus indicators (`:focus` or `:focus-visible` styles) (`A11Y-043`)

   **Forms:**
   - `<input>`, `<select>`, `<textarea>` without associated `<label>` or `aria-label` (`A11Y-050`)
   - Missing `id` attributes on form controls (needed for label association) (`A11Y-051`)
   - Missing error messages or `aria-invalid` on validation states (`A11Y-052`)

4. **Load anti-pattern catalogs.** Read additional detection rules from `agents/skills/shared/design-knowledge/` if available. These catalogs contain industry-specific accessibility patterns (e.g., healthcare forms require higher contrast, fintech requires screen reader-compatible data tables).

5. **Record all findings.** Each finding includes:
   - File path
   - Line number (approximate, from Grep output)
   - Violation code (e.g., `A11Y-001`)
   - Element or pattern that triggered the finding
   - Raw evidence (the matching line of code)

### Phase 2: EVALUATE -- Assess Severity and Categorize

1. **Assign severity based on `design.strictness`:**
   - `strict` mode: all violations are `error` severity
   - `standard` mode: missing alt, missing labels, contrast failures are `error`; heading order, tabIndex are `warn`; informational patterns are `info`
   - `permissive` mode: contrast failures and missing labels are `warn`; everything else is `info`

2. **Calculate contrast ratios.** For every color pair found in scanned code:
   - Extract foreground and background colors (from inline styles, class mappings, or token references)
   - Calculate relative luminance for each color using the WCAG 2.1 formula:
     - `L = 0.2126 * R + 0.7152 * G + 0.0722 * B` (where R, G, B are linearized sRGB values)
   - Calculate contrast ratio: `(L1 + 0.05) / (L2 + 0.05)` where L1 is the lighter color
   - Compare against thresholds:
     - Normal text (< 18px regular, < 14px bold): 4.5:1 minimum (WCAG AA)
     - Large text (>= 18px regular, >= 14px bold): 3:1 minimum (WCAG AA)

3. **Cross-reference with design tokens.** If `design-system/tokens.json` exists:
   - Map hardcoded colors in code to their nearest token equivalents
   - If a token-based color pair fails contrast, flag the **token definition** (not just the component usage) -- the fix belongs in harness-design-system, not here
   - If a hardcoded color fails contrast, flag both the contrast issue and the non-token usage

4. **Check graph constraints.** If a graph exists at `.harness/graph/`, use `DesignConstraintAdapter` from `packages/graph/src/constraints/DesignConstraintAdapter.ts` to:
   - Query for existing `VIOLATES` edges (violations already recorded in the graph)
   - Add new `VIOLATES` edges for findings from this scan
   - The adapter reads `design.strictness` to control which violations produce edges

5. **Categorize findings.** Group into categories:
   - **Contrast** (A11Y-030, A11Y-031): color-related violations
   - **ARIA** (A11Y-010 through A11Y-014): attribute and role violations
   - **Semantics** (A11Y-020 through A11Y-022): heading and structure violations
   - **Keyboard** (A11Y-040 through A11Y-043): navigation and focus violations
   - **Forms** (A11Y-050 through A11Y-052): form control violations
   - **Media** (A11Y-001 through A11Y-003): image, video, audio violations

### Phase 3: REPORT -- Generate Accessibility Report

1. **Generate summary header:**

   ```
   Accessibility Report
   ====================
   Scanned:    42 component files
   Findings:   18 total (6 error, 8 warn, 4 info)
   Strictness: standard
   ```

2. **List findings grouped by category.** Each finding follows this format:

   ```
   A11Y-001 [error] Missing alt attribute on <img>
     File:      src/components/UserAvatar.tsx
     Line:      24
     Element:   <img src={user.avatarUrl} className="avatar" />
     WCAG:      1.1.1 Non-text Content
     Fix:       Add alt={user.name} or alt="" if decorative
   ```

   ```
   A11Y-031 [error] Contrast ratio 2.8:1 fails WCAG AA (requires 4.5:1)
     File:      src/components/Button.tsx
     Line:      15
     Element:   color: #999 on background: #fff
     WCAG:      1.4.3 Contrast (Minimum)
     Fix:       Use color token "neutral.600" (#475569, ratio 4.9:1) instead
   ```

3. **Provide category summaries** with counts and severity breakdown.

4. **List actionable next steps:**
   - Errors that can be auto-fixed (Phase 4)
   - Errors that require human judgment
   - Warnings to address in next iteration
   - Token-level issues to escalate to harness-design-system

### Phase 4: FIX -- Apply Automated Remediation (Optional)

This phase is optional. It applies fixes only for **mechanical issues** -- violations with a single, unambiguous correct fix. Subjective issues (color choices, layout decisions, content writing) are never auto-fixed.

1. **Fixable violations:**
   - `A11Y-001`: Add `alt=""` to `<img>` tags that are decorative (inside `<button>`, `<a>`, or with `role="presentation"`)
   - `A11Y-011`: Add `aria-label` to icon-only `<button>` elements (using the icon name as label)
   - `A11Y-012`: Add `role="button"` and `tabIndex={0}` to clickable `<div>` elements
   - `A11Y-041`: Add `tabIndex={0}` to custom interactive elements missing it
   - `A11Y-051`: Generate `id` attributes for form controls and link them to labels

2. **Apply each fix as a minimal, targeted edit.** Use the Edit tool. Do not refactor surrounding code. Do not change formatting. The fix should be the smallest possible change that resolves the violation.

3. **Show before/after diff for each fix.** Present the exact change to the user. This is a hard gate -- no fix is applied without showing the diff first.

4. **Re-scan after fixes.** Run the scan phase again on fixed files to confirm violations are resolved. Report:
   - Fixes applied: N
   - Violations resolved: N
   - Remaining violations (require human judgment): M

5. **Do NOT fix:**
   - Color choices (subjective -- escalate to harness-design-system)
   - Content for alt text on meaningful images (requires human judgment about image meaning)
   - Layout and heading structure changes (may affect design intent)
   - Any fix that would change the visual appearance of the component

## Harness Integration

- **`harness validate`** -- Accessibility findings surface as design constraint violations when `design.strictness` is `strict` or `standard`. Running validate after a scan reflects the current a11y state.
- **`harness scan`** -- Refresh the knowledge graph after fixes to update `VIOLATES` edges. Ensures impact analysis stays current.
- **`DesignConstraintAdapter`** (`packages/graph/src/constraints/DesignConstraintAdapter.ts`) -- Reads `design.strictness` from project config to control violation severity. Manages `VIOLATES` edges in the graph for design and accessibility constraints.
- **`DesignIngestor`** (`packages/graph/src/ingest/DesignIngestor.ts`) -- Provides token data used for contrast checking. The ingestor parses `tokens.json` so the accessibility scanner can compare code colors against declared tokens.
- **`harness-impact-analysis`** -- When tokens change (palette update, new colors), impact analysis traces affected components. The accessibility skill uses this to determine which components need re-scanning.
- **`harness-design-system`** -- Dependency. When contrast failures originate from token definitions (not component code), escalate to harness-design-system to fix at the source.
- **`harness-i18n` deduplication** -- When `i18n.enabled: true` in config, `lang` and `dir` attribute checks are deferred to the i18n skill. This prevents duplicate findings across the accessibility and i18n reports. When i18n is not enabled, these checks remain part of the accessibility scan.

## Success Criteria

- All scanned component files have findings categorized by severity (`error`, `warn`, `info`)
- Contrast failures detected with correct ratios and WCAG criterion references
- Missing ARIA attributes flagged with specific file paths and line numbers
- Non-sequential heading hierarchy violations identified
- Keyboard navigation gaps (missing handlers, broken tab order) detected
- Form accessibility issues (missing labels, missing error states) found
- Report generated with violation codes, WCAG references, and actionable remediation
- Automated fixes applied without breaking existing functionality or tests
- `harness validate` reflects accessibility findings at the configured strictness level
- Token-level contrast issues escalated to harness-design-system (not fixed locally)

## Examples

### Example: Scanning a React Dashboard Component

**Context:** A React component `DashboardCard.tsx` with known accessibility issues.

**Source file:**

```tsx
// src/components/DashboardCard.tsx
export function DashboardCard({ title, value, icon, onClick }) {
  return (
    <div className="card" onClick={onClick}>
      <img src={icon} />
      <h3>{title}</h3>
      <span style={{ color: '#999', fontSize: '14px' }}>{value}</span>
    </div>
  );
}
```

**SCAN findings:**

```
A11Y-001 [error] Missing alt attribute on <img>
  File:    src/components/DashboardCard.tsx
  Line:    5
  Element: <img src={icon} />
  WCAG:    1.1.1 Non-text Content

A11Y-012 [error] Clickable <div> without role="button" and keyboard handler
  File:    src/components/DashboardCard.tsx
  Line:    4
  Element: <div className="card" onClick={onClick}>
  WCAG:    2.1.1 Keyboard

A11Y-031 [warn] Contrast ratio 2.8:1 for #999 on #fff fails WCAG AA
  File:    src/components/DashboardCard.tsx
  Line:    7
  Element: <span style={{ color: '#999' }}>
  WCAG:    1.4.3 Contrast (Minimum)
  Note:    Hardcoded color -- not from token set

A11Y-030 [info] Hardcoded color value not from design token set
  File:    src/components/DashboardCard.tsx
  Line:    7
  Element: color: '#999'
```

**FIX phase (auto-fixable only):**

```diff
- <img src={icon} />
+ <img src={icon} alt="" />

- <div className="card" onClick={onClick}>
+ <div className="card" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}>
```

**Remaining (requires human judgment):**

- `A11Y-031`: Contrast failure -- fix requires choosing a darker color. Escalate to design tokens or get human input on replacement color.
- `A11Y-001`: The `alt=""` fix assumes decorative. If the icon conveys meaning, human must write descriptive alt text.

## Rationalizations to Reject

| Rationalization                                                                                                                         | Reality                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "The contrast ratio is 4.4:1 — that's essentially 4.5:1 and the difference is imperceptible. I'll mark it passing."                     | WCAG AA requires exactly 4.5:1 for normal text. 4.4:1 fails. There is no rounding or visual perception exception in the standard. Flag the failure with the actual ratio and let the user decide how to remediate.                                                             |
| "This `<div onClick>` already has good visual styling — adding `role='button'` and a keyboard handler is unnecessary clutter."          | A clickable `<div>` without `role="button"` and `onKeyDown` is inaccessible to keyboard-only users and screen reader users. Visual styling has no bearing on ARIA semantics or keyboard reachability. This is A11Y-012, always flagged.                                        |
| "The automated fix for this `<img>` alt attribute is obvious — I'll apply it without showing the diff since it's just adding `alt=''`." | Every automated fix must be presented as a before/after diff before being written to disk. This is a hard gate. The correct alt value for non-decorative images requires human judgment, and even `alt=""` makes a semantic claim about decorativeness that must be confirmed. |
| "I18n is enabled, so I'll skip the `lang` and `dir` attribute checks entirely — harness-i18n will catch them."                          | Deferral to harness-i18n is conditional on `i18n.enabled: true` in config. If i18n is not configured, these checks remain part of this skill's scan. Always read the config before skipping any check category.                                                                |
| "There are 15 findings in this component — I'll fix the easy ones automatically and leave the rest without reporting them explicitly."  | All findings must be reported, regardless of whether they are auto-fixable. The report is the primary deliverable of the REPORT phase. Selectively reporting only fixable violations hides the full accessibility debt from the team.                                          |

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No component marked "accessible" without passing WCAG AA contrast checks.** A passing scan means zero `error`-severity contrast violations, not zero findings overall.
- **No automated fix applied without showing the before/after diff.** Every fix must be presented to the user with the exact code change before being written to disk.
- **No severity downgrade below what `design.strictness` config specifies.** If the project is in `strict` mode, a missing alt attribute is an error. The scanner does not get to decide it is a warning.
- **The scan phase must complete before evaluate.** No partial evaluations on incomplete scan results. All files must be scanned before severity assignment begins.
- **No fixes that change visual appearance.** Automated fixes are structural (adding attributes, roles, handlers). If a fix would visibly change the rendered output, it requires human approval.

## Escalation

- **When contrast ratio is borderline (4.5:1 to 5:1):** Flag for human review rather than auto-passing. Report: "Contrast ratio 4.6:1 technically passes WCAG AA but is borderline. Consider using a higher-contrast alternative for better readability."
- **When a component has more than 10 findings:** Suggest architectural refactoring rather than piecemeal fixes. The component likely has systemic accessibility issues that individual fixes will not adequately address. Recommend: "This component has 14 accessibility findings. Consider refactoring to use accessible base components rather than fixing each issue individually."
- **When design tokens themselves have contrast failures:** Do not fix at the usage site. Escalate to harness-design-system: "Token pair primary-500 on neutral-50 has contrast ratio 3.2:1. This must be fixed in design-system/tokens.json, not in individual components. Run harness-design-system to update the palette."
- **When automated fix would change visual appearance:** Require explicit human approval. Present the fix with a note: "This fix changes the rendered output. The current <div> will become keyboard-focusable with a visible focus ring. Approve this change?"
- **When `design.strictness` is not configured:** Default to `standard` mode. Report: "No design.strictness found in harness.config.json. Using 'standard' (warnings visible, errors block). Set design.strictness in config to customize."
- **After 3 failed attempts to resolve a contrast issue:** The color pair may be fundamentally incompatible. Suggest: "Consider using a different color combination. The current pair cannot achieve WCAG AA compliance without changing one of the colors significantly."
