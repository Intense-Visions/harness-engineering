# audit-component-anatomy — Finding Codes Reference

> Canonical reference for every finding code emitted by the `audit-component-anatomy` skill (`mcp__harness__audit_anatomy`). Codes are namespaced under three families: `ANAT-D*` (definition findings — anatomy parts missing from a component definition), `ANAT-P*` (pattern-presence findings — usage sites that omit a required affordance), and `ANAT-U*` (usage findings — reserved for v2, not emitted in v1).
>
> **Scope:** This document is authoritative for v1 (Sprint 1 vertical slice + Sprint 2 catalog expansion). Codes marked `RESERVED` will be defined incrementally during Phase 2 catalog expansion as conventions and patterns are authored.
>
> **Audience:** skill authors filling in Phase 2 catalog entries, downstream consumers (sub-project #4 verifier, sub-project #5 orchestrator) wiring on finding shape, designers reading audit output looking up what a code means.

---

## Table of Contents

- [Conventions](#conventions)
  - [Code-family scheme](#code-family-scheme)
  - [Range allocation](#range-allocation)
  - [Severity defaults and strictness](#severity-defaults-and-strictness)
  - [Source citation prefixes](#source-citation-prefixes)
  - [Entry format](#entry-format)
- [ANAT-D000 — JSDoc-vs-convention divergence (info)](#anat-d000--jsdoc-vs-convention-divergence-info)
- [ANAT-D\* — Definition findings](#anat-d--definition-findings)
  - [Tier-1 critical: required-slot missing (D001–D029)](#tier-1-critical-required-slot-missing-d001d029)
    - [ANAT-D001 — Button: missing required `content` slot](#anat-d001--button-missing-required-content-slot)
    - [ANAT-D002 — Button: missing required `focus` state](#anat-d002--button-missing-required-focus-state)
    - [ANAT-D003 — Button: missing required `default` state](#anat-d003--button-missing-required-default-state)
    - [ANAT-D004 — Input: missing required `label` slot](#anat-d004--input-missing-required-label-slot)
    - [ANAT-D005 — Dialog: missing required `title` slot](#anat-d005--dialog-missing-required-title-slot)
    - [ANAT-D006 — Select: missing required `label` slot](#anat-d006--select-missing-required-label-slot)
    - [ANAT-D007 — Switch: missing required `label` slot](#anat-d007--switch-missing-required-label-slot)
    - [ANAT-D010 — Tabs: missing required `root` slot](#anat-d010--tabs-missing-required-root-slot)
    - [ANAT-D011 — Tabs: missing required `tablist` slot](#anat-d011--tabs-missing-required-tablist-slot)
    - [ANAT-D012 — Tabs: missing required `trigger` slot](#anat-d012--tabs-missing-required-trigger-slot)
    - [ANAT-D013 — Tabs: missing required `panel` slot](#anat-d013--tabs-missing-required-panel-slot)
    - [ANAT-D014 — Tabs: missing required `selected` state](#anat-d014--tabs-missing-required-selected-state)
    - [ANAT-D015 — Tabs: missing required `focused` state (roving tabindex)](#anat-d015--tabs-missing-required-focused-state-roving-tabindex)
    - [ANAT-D020 — EmptyState: missing required `headline` slot](#anat-d020--emptystate-missing-required-headline-slot)
    - [ANAT-D021 — EmptyState: missing required `default` state](#anat-d021--emptystate-missing-required-default-state)
    - [ANAT-D008–D009 — RESERVED (critical required-slot, form-field overflow)](#anat-d008d009--reserved-critical-required-slot-form-field-overflow)
    - [ANAT-D022–D029 — RESERVED (critical required-slot)](#anat-d022d029--reserved-critical-required-slot)
  - [Tier-2 recommended: recommended-state missing (D030–D099)](#tier-2-recommended-recommended-state-missing-d030d099)
  - [Tier-3 optional: variant / size / cosmetic missing (D100–D199)](#tier-3-optional-variant--size--cosmetic-missing-d100d199)
- [ANAT-P\* — Pattern-presence findings](#anat-p--pattern-presence-findings)
  - [Tier-1 critical structural (P001–P019)](#tier-1-critical-structural-p001p019)
    - [ANAT-P001 — Data list rendered via `.map()` without empty-state guard](#anat-p001--data-list-rendered-via-map-without-empty-state-guard)
  - [Tier-2 recommended (P020–P059)](#tier-2-recommended-p020p059)
    - [ANAT-P004 — Conditional render without fallback affordance](#anat-p004--conditional-render-without-fallback-affordance)
  - [Tier-3 informational (P060–P099)](#tier-3-informational-p060p099)
- [ANAT-U\* — Usage findings (v2 reservation)](#anat-u--usage-findings-v2-reservation)
- [Reserved-code authoring convention](#reserved-code-authoring-convention)
- [Cross-references](#cross-references)

---

## Conventions

### Code-family scheme

| Family    | Meaning                                                                                                                                                                              | v1 status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `ANAT-D*` | **Definition findings.** A component **definition** omits an anatomy part the convention library marks as required or recommended for its `componentType`.                           | Ships     |
| `ANAT-P*` | **Pattern-presence findings.** A usage site exhibits a structural pattern (e.g., `.map(...)` over data) without the conventional companion affordance (e.g., an empty-state branch). | Ships     |
| `ANAT-U*` | **Usage findings.** A specific call site of a known component omits a required prop (e.g., `<Input>` without `label`). Reserved namespace — **not emitted in v1**; planned for v2.   | Reserved  |

All codes are formatted `ANAT-{family}{3-digit}`. The format is stable: `ANAT-D023`, `ANAT-P001`, `ANAT-U045`. Three digits leave headroom (up to 999 per family) without pushing toward a fourth.

### Range allocation

The range allocation below is the **authoritative reservation** Sprint 2 catalog authors must respect. The bands reflect a Tier-1 (critical / required) → Tier-3 (cosmetic / optional) gradient so consumers can severity-filter on numeric range when a project-side mapping is convenient.

**ANAT-D (definition):**

| Range       | Tier   | Semantic                                                                                                               | Default severity (at `standard` strictness) |
| ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `ANAT-D000` | Info   | Authoring-divergence info finding — JSDoc declaration diverges from convention library. Always emitted.                | `info`                                      |
| `D001–D029` | Tier-1 | **Critical:** a component definition lacks a required slot/state from its convention (e.g., Button missing `content`). | `error`                                     |
| `D030–D099` | Tier-2 | **Recommended:** a component definition lacks a recommended state from its convention (e.g., Button missing `hover`).  | `warn`                                      |
| `D100–D199` | Tier-3 | **Optional/cosmetic:** a component lacks a conventional variant or sizing token.                                       | `info`                                      |
| `D200`      | —      | Reserved as the post-v1 catalog ceiling sentinel. Do not emit.                                                         | —                                           |

**ANAT-P (pattern-presence):**

| Range       | Tier   | Semantic                                                                                                             | Default severity (at `standard` strictness) |
| ----------- | ------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `P001–P019` | Tier-1 | **Critical structural:** a structural pattern reliably implies a missing affordance (e.g., `.map()` without empty).  | `warn`                                      |
| `P020–P059` | Tier-2 | **Recommended:** an ambiguous pattern that frequently indicates a craft gap (e.g., conditional render w/o fallback). | `info`                                      |
| `P060–P099` | Tier-3 | **Informational:** patterns that are stylistic signals worth surfacing but rarely worth blocking.                    | `info`                                      |
| `P100`      | —      | Reserved as the post-v1 catalog ceiling sentinel. Do not emit.                                                       | —                                           |

**ANAT-U (usage — v2):**

| Range       | Tier   | Semantic                                                            | v1 status               |
| ----------- | ------ | ------------------------------------------------------------------- | ----------------------- |
| `U001–U199` | Tier-1 | Usage findings (e.g., `<Input>` without `label` prop at call site). | Reserved — **v1: none** |

### Severity defaults and strictness

Every finding declares a `severityDefault` in its rule definition. The runtime severity is `severityDefault × design.strictness` via `findings/severity.ts`. The matrix at `standard` strictness is the table above; `strict` promotes one level (warn → error, info → warn); `permissive` demotes one level (error → warn, warn → info). `ANAT-D000` is exempt from promotion and stays `info` at all strictness levels (it's authoring guidance, not a violation).

### Source citation prefixes

Per the Phase 0 schema-fit review recommendation (review.md §EmptyState), each rule's `source.ref` field uses one of the published prefixes below. Adding a new prefix requires updating this list AND the schema validator.

| Prefix                      | Authority                                                                        |
| --------------------------- | -------------------------------------------------------------------------------- |
| `APG/`                      | W3C ARIA Authoring Practices Guide — primary authority for accessible patterns.  |
| `OpenUI/`                   | Open UI community proposals — used for emerging components without APG coverage. |
| `Radix/`                    | Radix Primitives — used for well-established compound-component shapes.          |
| `design-component-anatomy/` | Internal harness knowledge skill — used for taste-driven patterns without APG.   |

### Entry format

Each defined code entry uses this shape:

- **Code** — the `ANAT-X###` identifier.
- **Severity default** — `error` | `warn` | `info` at `standard` strictness.
- **Component type** _(D family only)_ — the `componentType` the convention applies to.
- **Source citation** — `source.ref` plus optional `url`.
- **Message template** — the human-readable message string (or template-function signature for P family).
- **Fix hint** — the verbatim guidance text written into the finding's `fix.description` field.
- **Positive example** — a code snippet that **would** emit the finding.
- **Negative example** — a code snippet that **would not** emit the finding.
- **Schema notes** — any Phase 0 caveats or runner-side behavior consumers should know.

---

## ANAT-D000 — JSDoc-vs-convention divergence (info)

**Severity default:** `info` (always; not promoted by strictness)

**Source citation:** `design-component-anatomy/jsdoc-divergence` (internal — codified by Decision #1's hybrid stack)

**Message template:**

> `JSDoc @anatomy declaration for {componentType} diverges from the convention library: {diff}. JSDoc wins (per Decision #1 resolution order). This finding is informational — no action required if the divergence is intentional.`

**Fix hint:**

> Either (a) accept the divergence as intentional and leave the JSDoc declaration in place, or (b) align the JSDoc declaration with the convention library by adding the missing `@anatomy-*` tags. If the convention itself is wrong for your project, prefer the DESIGN.md `## Component Anatomy Overrides` section so the override is project-wide, not file-local.

**Positive example (finding emitted):**

```tsx
/**
 * Button component for primary actions.
 *
 * @component-type Button
 * @anatomy-slot content required
 * @anatomy-state default
 * @anatomy-state focus
 * // Note: omits `hover`, `disabled`, `loading` — convention has them.
 */
export const Button = (props) => /* ... */;
```

Emits one `ANAT-D000` info finding identifying the three states present in the convention but absent from JSDoc.

**Negative example (no finding):**

```tsx
/**
 * Button component for primary actions.
 *
 * @component-type Button
 * @anatomy-slot content required
 * @anatomy-slot icon-leading
 * @anatomy-slot icon-trailing
 * @anatomy-state default
 * @anatomy-state hover
 * @anatomy-state focus
 * @anatomy-state disabled exclusive
 * @anatomy-state loading exclusive
 * @anatomy-variant primary|secondary|ghost|danger
 * @anatomy-size sm|md|lg
 */
export const Button = (props) => /* ... */;
```

JSDoc matches convention; no divergence; no finding.

**Schema notes:**

- `ANAT-D000` is the only `ANAT-D*` code that **does not** correspond to a missing anatomy part. It exists to make the JSDoc-vs-convention resolution layer visible (per Decision #1 layer 1).
- The finding is emitted **per file**, not per missing tag — one finding summarizes the full divergence set in its `evidence.snippet`.
- Strictness does **not** promote this code. It stays `info` at strict, standard, and permissive.

---

## ANAT-D\* — Definition findings

### Tier-1 critical: required-slot missing (D001–D029)

The Tier-1 band is reserved for definition findings where a component **omits a part the convention marks `required: true`**. These are baseline-failure findings — the component is structurally incomplete relative to its catalog convention. Default severity `error` at `standard` strictness.

Codes D001–D003 belong to the Button convention (Phase 0 spike: `conventions/button.md`). Code D004 belongs to the Input convention (Phase 2 catalog expansion). Code D005 belongs to the Dialog convention (Phase 0 spike: `conventions/dialog.md`). Code D006 belongs to the Select convention (Phase 2 catalog expansion: `conventions/select.md`). Code D007 belongs to the Switch convention (Phase 2 catalog expansion: `conventions/switch.md`). Codes D010–D015 belong to the Tabs convention (Phase 0 spike: `conventions/tabs.md`). Codes D020–D021 belong to the EmptyState convention (Phase 0 spike: `conventions/empty-state.md`). Codes D008–D009, D016–D019, and D022–D029 are RESERVED for Phase 2 — assignment proceeds in the order the catalog authors land conventions per Decision #5's 20-component scope.

#### ANAT-D001 — Button: missing required `content` slot

**Severity default:** `error`

**Component type:** Button

**Source citation:** `APG/button` — <https://www.w3.org/WAI/ARIA/apg/patterns/button/>

**Message template:**

> `Button definition is missing the required \`content\` slot. A Button without accessible content (label or aria-label) is the canonical APG violation — assistive technology cannot announce the button's purpose.`

**Fix hint** (from Phase 0 spec `conventions/button.md`):

> Add visible label content as children or via a `label` / `aria-label` prop. A Button without accessible content is the canonical APG violation.

**Positive example (finding emitted):**

```tsx
interface ButtonProps {
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  // No children prop, no label prop, no aria-label — content slot missing.
}

export const Button = ({ onClick, variant }: ButtonProps) => (
  <button onClick={onClick} className={variant} />
);
```

Emits one `ANAT-D001` error finding at the Button definition.

**Negative example (no finding):**

```tsx
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button = ({ children, onClick, variant }: ButtonProps) => (
  <button onClick={onClick} className={variant}>
    {children}
  </button>
);
```

The `children: React.ReactNode` prop satisfies the `content` slot. No finding.

**Schema notes:**

- The AST runner satisfies the `content` slot by detecting any of: a `children` prop typed as `React.ReactNode` / `ReactNode` / `string`, a `label` prop typed as `string`, or an `aria-label` prop typed as `string`.
- Coordinates with harness-accessibility deferral (Phase 1 step 2.6): when `design.audit.componentAnatomy.enabled = true`, harness-accessibility defers A11Y-010 for Button call sites in favor of this `ANAT-D001` definition finding.

#### ANAT-D002 — Button: missing required `focus` state

**Severity default:** `error`

**Component type:** Button

**Source citation:** `APG/button` — <https://www.w3.org/WAI/ARIA/apg/patterns/button/>

**Message template:**

> `Button definition does not surface a focus state. The APG keyboard-navigation contract requires a visible focus indicator on every interactive control.`

**Fix hint** (from Phase 0 spec `conventions/button.md`):

> Provide a `:focus-visible` style. Required by APG keyboard-navigation contract.

**Positive example (finding emitted):**

```tsx
export const Button = ({ children }: { children: React.ReactNode }) => (
  <button
    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
    // No `focus-visible:` utility, no `:focus` rule in associated stylesheet.
  >
    {children}
  </button>
);
```

Emits one `ANAT-D002` error finding.

**Negative example (no finding):**

```tsx
export const Button = ({ children }: { children: React.ReactNode }) => (
  <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50">
    {children}
  </button>
);
```

`focus-visible:` utility present; focus state surfaced; no finding.

**Schema notes:**

- The AST runner satisfies the `focus` state by detecting any of: a Tailwind `focus-visible:*` or `focus:*` utility in className, a CSS selector `:focus-visible` or `:focus` in a same-file or imported stylesheet, an `aria-` attribute commonly paired with focus management (`aria-activedescendant`).
- This is the second-most-common harness-accessibility deferral target (after A11Y-010). When anatomy audit emits D002 the corresponding A11Y focus-indicator findings are suppressed for that Button.

#### ANAT-D003 — Button: missing required `default` state

**Severity default:** `error`

**Component type:** Button

**Source citation:** `APG/button` — <https://www.w3.org/WAI/ARIA/apg/patterns/button/>

**Message template:**

> `Button definition does not render a default (idle, enabled) state. Every Button must render unconditionally — if all branches that return JSX are themselves gated by state, the component has no baseline render.`

**Fix hint** (from Phase 0 spec `conventions/button.md`):

> Every Button must render a default (idle, enabled) state. Usually implicit — flagged only if all renderable states are themselves conditional.

**Positive example (finding emitted):**

```tsx
export const Button = ({ children, loading, disabled }: ButtonProps) => {
  if (loading) return <Spinner />;
  if (disabled) return null;
  // No unconditional return — no default state.
};
```

Emits one `ANAT-D003` error finding.

**Negative example (no finding):**

```tsx
export const Button = ({ children, loading, disabled }: ButtonProps) => {
  if (loading) return <Spinner />;
  return <button disabled={disabled}>{children}</button>;
};
```

Default render path present; no finding.

**Schema notes:**

- Detected by the AST runner walking control flow within the component function body. If every `return` is reached only through a conditional whose tests are stateful (`if (loading)`, `if (disabled)`, ternary-of-state), the default state is considered missing.

#### ANAT-D004 — Input: missing required `label` slot

**Severity default:** `error`

**Component type:** Input

**Source citation:** `APG/textbox` — <https://www.w3.org/WAI/ARIA/apg/patterns/>

**Message template:**

> `Input definition is missing the required \`label\` slot. An Input that accepts no labelling affordance (no \`label\`, \`aria-label\`, or \`aria-labelledby\` prop) is the canonical APG violation — assistive technology cannot announce the field's purpose.`

**Fix hint** (verbatim from the convention rule):

> Add a labelling affordance. Accept a `label` prop (string), an `aria-label` prop (string), or an `aria-labelledby` prop (id reference). An Input without any labelling affordance is the canonical APG violation — assistive technology cannot announce the field's purpose.

**Positive example (finding emitted):**

```tsx
interface InputProps {
  value?: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  // No label, aria-label, or aria-labelledby — label slot missing.
}

export const Input = ({ value, onChange, placeholder }: InputProps) => (
  <input value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} />
);
```

Emits one `ANAT-D004` error finding at the Input definition.

**Negative example (no finding — `label` prop):**

```tsx
interface InputProps {
  label: string;
  value?: string;
}

export const Input = ({ label, value }: InputProps) => (
  <label>
    {label}
    <input value={value} />
  </label>
);
```

The `label: string` prop satisfies the `label` slot. No finding.

**Negative example (no finding — `aria-labelledby` prop):**

```tsx
interface InputProps {
  'aria-labelledby': string;
  value?: string;
}

export const Input = (props: InputProps) => (
  <input aria-labelledby={props['aria-labelledby']} value={props.value} />
);
```

`aria-labelledby` is one of the three accepted labelling affordances. No finding.

**Schema notes:**

- The AST runner satisfies the `label` slot by detecting any of: a `label` prop, an `aria-label` prop, or an `aria-labelledby` prop on the parsed prop type. Names only — type compatibility (string vs. ReactNode) is not yet checked, matching the Phase 1 ANAT-D001 satisfiability stance.
- Authors who route labelling through an external `<label htmlFor>` element should wire it via `aria-labelledby` to remain audit-visible. The audit deliberately does NOT inspect call sites for v1 — usage-side checks belong to the reserved `ANAT-U*` namespace (v2).
- Coordinates with harness-accessibility deferral (Phase 1 step 2.6): when `design.audit.componentAnatomy.enabled = true`, harness-accessibility defers `A11Y-050` (`<input>` without an associated `<label>`) for Input call sites in favor of this definition-side finding. This is the primary overlap point with the a11y skill — the deferral pattern ensures the same root cause is reported exactly once.
- Tier-2 Input slots (`helper-text`, `error-text`) are catalogued on the convention rule but not yet wired to a finding code. The D040-D049 sub-band is reserved for those when the runner ships recommended-slot findings.

#### ANAT-D010 — Tabs: missing required `root` slot

**Severity default:** `error`

**Component type:** Tabs

**Source citation:** `APG/tabs` — <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>

**Message template:**

> `Tabs compound is missing the required \`root\` slot. The root container owns the \`value\`/\`onValueChange\` state and serves as the export entry point — without it the compound cannot be composed correctly.`

**Fix hint** (from Phase 0 spec `conventions/tabs.md`):

> Export a root container (`Tabs` or `Tabs.Root`) that owns the `value`/`onValueChange` state and renders an element with `role` implied via children.

**Positive example (finding emitted):**

```tsx
// File exports loose Trigger and Panel components but no Root.
export const TabsTrigger = ({ value, children }) => /* ... */;
export const TabsPanel = ({ value, children }) => /* ... */;
// No `export const Tabs` or `Tabs.Root`.
```

Emits one `ANAT-D010` error finding.

**Negative example (no finding):**

```tsx
export const Tabs = ({ value, onValueChange, children }) => (
  <TabsContext.Provider value={{ value, onValueChange }}>
    <div data-component="tabs-root">{children}</div>
  </TabsContext.Provider>
);
export const TabsList = ({ children }) => <div role="tablist">{children}</div>;
export const TabsTrigger = (/* ... */) => /* ... */;
export const TabsPanel = (/* ... */) => /* ... */;
```

Root export present; no finding.

**Schema notes:**

- Convention-side only — does **not** detect mismatched trigger/panel counts at usage sites. The trigger/panel id-pairing rule is acknowledged in Phase 0 review.md §Tabs as a known out-of-band runner concern.

#### ANAT-D011 — Tabs: missing required `tablist` slot

**Severity default:** `error`

**Component type:** Tabs

**Source citation:** `APG/tabs` — <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>

**Message template:**

> `Tabs compound is missing the required \`tablist\` slot. Required by the APG keyboard model — triggers must be grouped under \`role="tablist"\` for arrow-key navigation to work correctly.`

**Fix hint** (from Phase 0 spec `conventions/tabs.md`):

> Provide a `Tabs.List` (or equivalent) subcomponent that renders `role="tablist"` and contains the trigger children. Required by APG keyboard model.

**Positive example (finding emitted):**

```tsx
export const Tabs = ({ children }) => <div>{children}</div>;
export const TabsTrigger = (/* ... */) => <button role="tab">/* ... */</button>;
export const TabsPanel = (/* ... */) => <div role="tabpanel">/* ... */</div>;
// No TabsList export, no role="tablist" wrapper.
```

Emits one `ANAT-D011` error finding.

**Negative example (no finding):**

```tsx
export const TabsList = ({ children }) => <div role="tablist">{children}</div>;
```

`TabsList` subcomponent present and renders `role="tablist"`; no finding.

#### ANAT-D012 — Tabs: missing required `trigger` slot

**Severity default:** `error`

**Component type:** Tabs

**Source citation:** `APG/tabs` — <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>

**Message template:**

> `Tabs compound is missing the required \`trigger\` slot. At least one trigger subcomponent must be representable to make the Tabs interactive.`

**Fix hint** (from Phase 0 spec `conventions/tabs.md`):

> Provide a `Tabs.Trigger` subcomponent that renders `role="tab"`, accepts a `value` prop, and exposes `aria-selected` + `aria-controls` automatically. At least one trigger must be representable.

**Positive example (finding emitted):**

```tsx
export const Tabs = (/* ... */) => /* ... */;
export const TabsList = (/* ... */) => /* ... */;
export const TabsPanel = (/* ... */) => /* ... */;
// No TabsTrigger export.
```

Emits one `ANAT-D012` error finding.

**Negative example (no finding):**

```tsx
export const TabsTrigger = ({ value, children }: { value: string; children: ReactNode }) => {
  const ctx = useTabsContext();
  return (
    <button
      role="tab"
      aria-selected={ctx.value === value}
      aria-controls={`panel-${value}`}
      onClick={() => ctx.onValueChange(value)}
    >
      {children}
    </button>
  );
};
```

Trigger subcomponent present and surfaces required ARIA; no finding.

#### ANAT-D013 — Tabs: missing required `panel` slot

**Severity default:** `error`

**Component type:** Tabs

**Source citation:** `APG/tabs` — <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>

**Message template:**

> `Tabs compound is missing the required \`panel\` slot. Triggers without paired panels render but have nothing to control — the compound is functionally inert.`

**Fix hint** (from Phase 0 spec `conventions/tabs.md`):

> Provide a `Tabs.Panel` subcomponent that renders `role="tabpanel"`, accepts a `value` prop matching its paired trigger, and sets `aria-labelledby` to the trigger's id. One panel per trigger.

**Positive example (finding emitted):**

```tsx
export const Tabs = (/* ... */) => /* ... */;
export const TabsList = (/* ... */) => /* ... */;
export const TabsTrigger = (/* ... */) => /* ... */;
// No TabsPanel export.
```

Emits one `ANAT-D013` error finding.

**Negative example (no finding):**

```tsx
export const TabsPanel = ({ value, children }: { value: string; children: ReactNode }) => {
  const ctx = useTabsContext();
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" aria-labelledby={`trigger-${value}`}>
      {children}
    </div>
  );
};
```

Panel subcomponent present; no finding.

#### ANAT-D014 — Tabs: missing required `selected` state

**Severity default:** `error`

**Component type:** Tabs

**Source citation:** `APG/tabs` — <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>

**Message template:**

> `Tabs trigger does not surface a \`selected\` state via \`aria-selected\`. Exactly one trigger must be selected at any time and the selection must be announced to assistive technology.`

**Fix hint** (from Phase 0 spec `conventions/tabs.md`):

> Exactly one trigger is `selected` at any time. Exclusivity is structural — the audit checks that the trigger surfaces `aria-selected` and that selection state is single-valued.

**Positive example (finding emitted):**

```tsx
export const TabsTrigger = ({ value, children }) => (
  <button onClick={/* ... */}>{children}</button>
  // No aria-selected, no context-driven selected styling.
);
```

Emits one `ANAT-D014` error finding.

**Negative example (no finding):**

```tsx
export const TabsTrigger = ({ value, children }) => {
  const ctx = useTabsContext();
  return (
    <button role="tab" aria-selected={ctx.value === value}>
      {children}
    </button>
  );
};
```

`aria-selected` bound to context; no finding.

**Schema notes:**

- Per Phase 0 review.md §Tabs: `exclusive: true` on the selected state carries the **per-sibling-set** semantics (exactly-one across the tablist), not the per-instance semantics that `exclusive` has on Button states. The runner does not enforce "exactly one selected" at runtime — only that the trigger declaration surfaces `aria-selected`.

#### ANAT-D015 — Tabs: missing required `focused` state (roving tabindex)

**Severity default:** `error`

**Component type:** Tabs

**Source citation:** `APG/tabs` — <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>

**Message template:**

> `Tabs trigger does not implement roving tabindex. APG requires exactly one trigger to be tab-reachable (\`tabindex=0\`), the rest tab-unreachable (\`tabindex=-1\`), with arrow keys moving the active trigger.`

**Fix hint** (from Phase 0 spec `conventions/tabs.md`):

> Roving tabindex per APG: exactly one trigger has `tabindex=0`, the rest `-1`. Focus is exclusive across the tablist.

**Positive example (finding emitted):**

```tsx
export const TabsTrigger = ({ value, children }) => (
  <button role="tab" aria-selected={/* ... */}>
    {children}
  </button>
  // No tabIndex management.
);
```

Emits one `ANAT-D015` error finding.

**Negative example (no finding):**

```tsx
export const TabsTrigger = ({ value, children }) => {
  const ctx = useTabsContext();
  const isActive = ctx.value === value;
  return (
    <button role="tab" aria-selected={isActive} tabIndex={isActive ? 0 : -1}>
      {children}
    </button>
  );
};
```

Roving tabindex present; no finding.

#### ANAT-D020 — EmptyState: missing required `headline` slot

**Severity default:** `error`

**Component type:** EmptyState

**Source citation:** `OpenUI/empty-state` — <https://open-ui.org/components/empty-state.research/>

**Message template:**

> `EmptyState definition is missing the required \`headline\` slot. Without a headline the component cannot communicate its purpose to the user — an EmptyState without a message is indistinguishable from a layout bug.`

**Fix hint** (from Phase 0 spec `conventions/empty-state.md`):

> Required short message (one sentence) explaining the empty condition. Accept as `title` prop or as the first text child. Without a headline the component is not communicating its purpose.

**Positive example (finding emitted):**

```tsx
interface EmptyStateProps {
  icon?: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
  // No `title` / `headline` prop, no children typed as ReactNode for headline.
}

export const EmptyState = ({ icon, description, action }: EmptyStateProps) => (
  <div className="empty-state">
    {icon}
    {description && <p>{description}</p>}
    {action}
  </div>
);
```

Emits one `ANAT-D020` error finding.

**Negative example (no finding):**

```tsx
interface EmptyStateProps {
  title: string;
  icon?: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState = ({ title, icon, description, action }: EmptyStateProps) => (
  <div className="empty-state">
    {icon}
    <h2>{title}</h2>
    {description && <p>{description}</p>}
    {action}
  </div>
);
```

`title: string` prop satisfies the `headline` slot; no finding.

**Schema notes:**

- Headline is the **only** required slot for EmptyState per Phase 0 spec — every other slot is optional and lives in the Tier-3 cosmetic band (D100+) when conventions are violated.

#### ANAT-D021 — EmptyState: missing required `default` state

**Severity default:** `error`

**Component type:** EmptyState

**Source citation:** `OpenUI/empty-state` — <https://open-ui.org/components/empty-state.research/>

**Message template:**

> `EmptyState definition conditionally returns null — the default render state is missing. EmptyState renders one visual state and should not gate that render on its own props.`

**Fix hint** (from Phase 0 spec `conventions/empty-state.md`):

> EmptyState renders one visual state. Required-by-default; flagged only if the component conditionally returns null on its own.

**Positive example (finding emitted):**

```tsx
export const EmptyState = ({ shouldShow, title }: EmptyStateProps) => {
  if (!shouldShow) return null;
  return (
    <div>
      <h2>{title}</h2>
    </div>
  );
  // The component owns the gate — caller cannot rely on it always rendering.
};
```

Emits one `ANAT-D021` error finding.

**Negative example (no finding):**

```tsx
export const EmptyState = ({ title }: EmptyStateProps) => (
  <div>
    <h2>{title}</h2>
  </div>
);
// Caller decides whether to render; EmptyState itself always renders when called.
```

No internal null gate; no finding.

#### ANAT-D005 — Dialog: missing required `title` slot

**Severity default:** `error`

**Component type:** Dialog

**Source citation:** `APG/dialog-modal` — <https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/>

**Message template:**

> `Dialog definition is missing the required \`title\` slot. A Dialog that accepts no accessible-name affordance (no \`title\`, \`aria-label\`, or \`aria-labelledby\` prop) is the canonical APG violation — screen readers announce it as an unnamed modal on open.`

**Fix hint** (verbatim from the convention rule):

> Add an accessible-name affordance. Accept a `title` prop (string), an `aria-label` prop (string), or an `aria-labelledby` prop (id reference). A Dialog without an accessible name is the canonical APG violation — screen readers announce it as an unnamed modal on open.

**Positive example (finding emitted):**

```tsx
interface DialogProps {
  open: boolean;
  onOpenChange?: (next: boolean) => void;
  children?: React.ReactNode;
  // No title, aria-label, or aria-labelledby — title slot missing.
}

export const Dialog = ({ open, onOpenChange, children }: DialogProps) =>
  open ? (
    <div role="dialog">
      <button onClick={() => onOpenChange?.(false)}>×</button>
      {children}
    </div>
  ) : null;
```

Emits one `ANAT-D005` error finding at the Dialog definition.

**Negative example (no finding — `title` prop):**

```tsx
interface DialogProps {
  open: boolean;
  title: string;
  children?: React.ReactNode;
}

export const Dialog = ({ open, title, children }: DialogProps) =>
  open ? (
    <div role="dialog" aria-labelledby="dialog-title">
      <h2 id="dialog-title">{title}</h2>
      {children}
    </div>
  ) : null;
```

The `title: string` prop satisfies the `title` slot. No finding.

**Negative example (no finding — `aria-labelledby` prop):**

```tsx
interface DialogProps {
  open: boolean;
  'aria-labelledby': string;
  children?: React.ReactNode;
}

export const Dialog = (props: DialogProps) =>
  props.open ? (
    <div role="dialog" aria-labelledby={props['aria-labelledby']}>
      {props.children}
    </div>
  ) : null;
```

`aria-labelledby` is one of the three accepted accessible-name affordances. No finding.

**Schema notes:**

- The AST runner satisfies the `title` slot by detecting any of: a `title` prop, an `aria-label` prop, or an `aria-labelledby` prop on the parsed prop type. Names only — type compatibility (string vs. ReactNode) is not yet checked, matching the Phase 1 ANAT-D001 satisfiability stance and the ANAT-D004 (Input.label) three-satisfier shape.
- Authors who route the dialog title through a `Dialog.Title` compound child rather than a prop should expose the linkage via `aria-labelledby` to remain audit-visible. The audit deliberately does NOT inspect compound-child render trees for v1 — that analysis belongs to the reserved Tabs-style compound-component path.
- Coordinates with harness-accessibility deferral (Phase 1 step 2.6): when `design.audit.componentAnatomy.enabled = true`, harness-accessibility defers `A11Y-010` (`role="dialog"` without an accessible name) for Dialog call sites in favor of this definition-side finding. Dialog joins Button and Input as the third catalogued component to share the A11Y-010 deferral path — the deferral pattern ensures the same root cause is reported exactly once.
- Tier-2 Dialog slots (`description`, `close-action`, `footer`) and states (`open` / `closed`) are catalogued on the convention rule but not yet wired to a finding code. The D060-D069 Tier-2 sub-band is reserved for the recommended overlay states per the bucket allocation table below.

#### ANAT-D006 — Select: missing required `label` slot

**Severity default:** `error`

**Component type:** Select

**Source citation:** `APG/listbox` — <https://www.w3.org/WAI/ARIA/apg/patterns/listbox/>

**Message template:**

> `Select definition is missing the required \`label\` slot. A Select that accepts no labelling affordance (no \`label\`, \`aria-label\`, or \`aria-labelledby\` prop) is the canonical APG violation — assistive technology cannot announce the field's purpose.`

**Fix hint** (verbatim from the convention rule):

> Add a labelling affordance. Accept a `label` prop (string), an `aria-label` prop (string), or an `aria-labelledby` prop (id reference). A Select without any labelling affordance is the canonical APG violation — assistive technology cannot announce the field's purpose.

**Positive example (finding emitted):**

```tsx
interface SelectProps {
  value?: string;
  onChange?: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  // No label, aria-label, or aria-labelledby — label slot missing.
}

export const Select = ({ value, onChange, options }: SelectProps) => (
  <select value={value} onChange={(e) => onChange?.(e.target.value)}>
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);
```

Emits one `ANAT-D006` error finding at the Select definition.

**Positive example (finding emitted — `placeholder` only):**

```tsx
interface SelectProps {
  placeholder: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = ({ placeholder, value, options }: SelectProps) => (
  <select value={value}>
    <option value="">{placeholder}</option>
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);
```

`placeholder` is **not** a satisfier — APG explicitly warns that placeholder text disappears on selection and is not announced as the field's label. Still emits one `ANAT-D006` finding.

**Negative example (no finding — `label` prop):**

```tsx
interface SelectProps {
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = ({ label, value, options }: SelectProps) => (
  <label>
    {label}
    <select value={value}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </label>
);
```

The `label: string` prop satisfies the `label` slot. No finding.

**Negative example (no finding — `aria-labelledby` prop):**

```tsx
interface SelectProps {
  'aria-labelledby': string;
  value?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = (props: SelectProps) => (
  <select aria-labelledby={props['aria-labelledby']} value={props.value}>
    {props.options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);
```

`aria-labelledby` is one of the three accepted labelling affordances. No finding.

**Schema notes:**

- The AST runner satisfies the `label` slot by detecting any of: a `label` prop, an `aria-label` prop, or an `aria-labelledby` prop on the parsed prop type. Names only — type compatibility (string vs. ReactNode) is not yet checked, matching the Phase 1 ANAT-D001 / ANAT-D004 / ANAT-D005 satisfiability stance.
- `placeholder` is **deliberately excluded** from the satisfier list per APG `listbox` § "Labeling a Listbox" — placeholder text is announced by some screen readers as a value, not as the field's label, and disappears on selection. Authors who rely on placeholder text alone should add a separate `aria-label`.
- Coordinates with harness-accessibility deferral (Phase 1 step 2.6): when `design.audit.componentAnatomy.enabled = true`, harness-accessibility defers `A11Y-050` (`<select>` without an associated `<label>`) for Select call sites in favor of this definition-side finding. Select joins Input and Dialog as the fourth catalogued component to share the labelling-deferral path with `harness-accessibility` (the third to share the `A11Y-050` overlap specifically — Dialog uses `A11Y-010`).
- Tier-2 Select slots (`helper-text`, `error-text`) and recommended states (`focus`, `disabled`, `invalid`, `open`) are catalogued on the convention rule but not yet wired to a finding code. The D040-D049 Tier-2 form-field band is reserved for those when the runner ships recommended-slot findings.

#### ANAT-D007 — Switch: missing required `label` slot

**Severity default:** `error`

**Component type:** Switch

**Source citation:** `APG/switch` — <https://www.w3.org/WAI/ARIA/apg/patterns/switch/>

**Message template:**

> `Switch definition is missing the required \`label\` slot. A Switch that accepts no labelling affordance (no \`label\`, \`aria-label\`, or \`aria-labelledby\` prop) is the canonical APG violation — assistive technology cannot announce the control's purpose.`

**Fix hint** (verbatim from the convention rule):

> Add a labelling affordance. Accept a `label` prop (string), an `aria-label` prop (string), or an `aria-labelledby` prop (id reference). A Switch without any labelling affordance is the canonical APG violation — assistive technology cannot announce the control's purpose.

**Positive example (finding emitted):**

```tsx
interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (next: boolean) => void;
  // No label, aria-label, or aria-labelledby — label slot missing.
}

export const Switch = ({ checked, onCheckedChange }: SwitchProps) => (
  <button role="switch" aria-checked={checked} onClick={() => onCheckedChange?.(!checked)} />
);
```

Emits one `ANAT-D007` error finding at the Switch definition.

**Negative example (no finding — `label` prop):**

```tsx
interface SwitchProps {
  label: string;
  checked?: boolean;
}

export const Switch = ({ label, checked }: SwitchProps) => (
  <label>
    {label}
    <button role="switch" aria-checked={checked} />
  </label>
);
```

The `label: string` prop satisfies the `label` slot. No finding.

**Negative example (no finding — `aria-labelledby` prop):**

```tsx
interface SwitchProps {
  'aria-labelledby': string;
  checked?: boolean;
}

export const Switch = (props: SwitchProps) => (
  <button role="switch" aria-labelledby={props['aria-labelledby']} aria-checked={props.checked} />
);
```

`aria-labelledby` is one of the three accepted labelling affordances. No finding.

**Schema notes:**

- The AST runner satisfies the `label` slot by detecting any of: a `label` prop, an `aria-label` prop, or an `aria-labelledby` prop on the parsed prop type. Names only — type compatibility (string vs. ReactNode) is not yet checked, matching the Phase 1 ANAT-D001 satisfiability stance and the three-satisfier shape established by ANAT-D004 (Input.label), ANAT-D005 (Dialog.title), and ANAT-D006 (Select.label).
- Authors who route labelling through an external `<label htmlFor>` element should wire it via `aria-labelledby` to remain audit-visible. The audit deliberately does NOT inspect call sites for v1 — usage-side checks belong to the reserved `ANAT-U*` namespace (v2).
- Coordinates with harness-accessibility deferral (Phase 1 step 2.6): when `design.audit.componentAnatomy.enabled = true`, harness-accessibility defers `A11Y-010` (`role="switch"` without an accessible name) for Switch call sites in favor of this definition-side finding. Switch joins Button, Input, Dialog, and Select as a catalogued component sharing the A11Y deferral path — the deferral pattern ensures the same root cause is reported exactly once.
- Tier-2 Switch slots (`helper-text`, `error-text`) and recommended states (`checked`, `focus`, `disabled`) are catalogued on the convention rule but not yet wired to a finding code. The D040–D049 Tier-2 form-field sub-band and the D080–D089 Tier-2 pressed/active sub-band are reserved for those when the runner ships recommended-slot findings.

#### ANAT-D008–D009 — RESERVED (critical required-slot, form-field overflow)

These codes are RESERVED for Phase 2 catalog expansion. Input claimed `D004`, Dialog claimed `D005`, Select claimed `D006`, and Switch claimed `D007`; remaining critical form-field slots (e.g., Checkbox/Radio binary-control labelling) consume `D008`–`D009` in landing order.

> **To be defined during Phase 2 catalog expansion.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

#### ANAT-D022–D029 — RESERVED (critical required-slot)

These codes are RESERVED for Phase 2 catalog expansion. Convention authors assign them in landing order for the remaining catalog components (Card, Menu, Toast, Form, Accordion, Tooltip, Popover, Drawer, Slider, Checkbox, Radio, Avatar, Badge). Each landed component's critical findings claim the next contiguous codes in the D001–D029 band. If a single component requires more than 8 critical codes, overflow allocates into D008–D009 and D016–D019 before considering band-resize.

> **To be defined during Phase 2 catalog expansion.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

### Tier-2 recommended: recommended-state missing (D030–D099)

Tier-2 codes flag definitions that omit a part the convention marks as _recommended_ (not `required: true`) but conventionally expected (e.g., Button missing `hover` state, Tabs missing `disabled` state). Default severity `warn` at `standard` strictness.

**Bucket allocation within D030–D099:**

| Sub-band  | Component family                                                                    |
| --------- | ----------------------------------------------------------------------------------- |
| D030–D039 | Button (hover, disabled, loading recommended states)                                |
| D040–D049 | Input / Select / Form (label-suggestion, helper-text, error-text recommended slots) |
| D050–D059 | Tabs / Accordion / Menu (recommended secondary states)                              |
| D060–D069 | Modal / Dialog / Drawer / Popover (recommended overlay states)                      |
| D070–D079 | Toast / Tooltip / Snackbar (recommended dismiss/timing states)                      |
| D080–D089 | Slider / Switch / Checkbox / Radio (recommended pressed/active states)              |
| D090–D099 | Avatar / Badge / Card / Tooltip (recommended sizing / cosmetic state)               |

> **All codes in D030–D099 are RESERVED — to be defined during Phase 2 catalog expansion.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

### Tier-3 optional: variant / size / cosmetic missing (D100–D199)

Tier-3 codes flag definitions whose convention defines variants or sizes the component does not expose. These are the lowest-impact findings — surfacing them informs designers that the project's components are stylistically narrower than the convention library expects. Default severity `info` at `standard` strictness.

**Bucket allocation within D100–D199:**

| Sub-band  | Semantic                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| D100–D119 | Missing variants (`primary`, `secondary`, `ghost`, `danger`, etc.) across all component types                   |
| D120–D139 | Missing sizes (`sm`, `md`, `lg`, `xl`) across all component types                                               |
| D140–D159 | Missing cosmetic slots (icons, indicators, decorative children)                                                 |
| D160–D179 | Missing taxonomy variants (EmptyState `zero-data` / `no-results` / `error`, Toast `success` / `error` / `info`) |
| D180–D199 | Reserved overflow for high-density components (Form-family, Slider, etc.)                                       |

> **All codes in D100–D199 are RESERVED — to be defined during Phase 2 catalog expansion.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

---

## ANAT-P\* — Pattern-presence findings

### Tier-1 critical structural (P001–P019)

Tier-1 pattern codes flag structural patterns that reliably indicate a missing affordance. These are the codes most strongly differentiated from existing lint output (REFERENCES.md gap #4 — "no published tool produces this finding class"). Default severity `warn` at `standard` strictness.

#### ANAT-P001 — Data list rendered via `.map()` without empty-state guard

**Severity default:** `warn`

**Source citation:** `design-component-anatomy/empty-states` — <https://harness.dev/knowledge/design/empty-states>

**Message template** (from Phase 0 spec `patterns/anat-p001-map-without-empty.md`):

> `List rendered via .map() without an empty-state guard. When the source array is empty, this branch renders nothing — users see a blank region instead of an explanatory affordance. (file: {file}, line {line})`

**Fix hint** (verbatim from Phase 0 spec):

> Guard the .map() call with an empty-state branch. Examples:
>
> ```tsx
> {
>   items.length === 0 ? (
>     <EmptyState title="No results" />
>   ) : (
>     items.map((item) => <Row key={item.id} {...item} />)
>   );
> }
>
> // or:
> if (!items.length) return <EmptyState title="No results" />;
> return items.map((item) => <Row key={item.id} {...item} />);
> ```
>
> If the empty case is genuinely unreachable here (e.g., parent component guarantees non-empty input), add an `@anatomy-guarantee non-empty` JSDoc tag to suppress this finding for the file.

**Tree-sitter query** (informational — actual query lives in `catalog/patterns/ANAT-P001-map-without-empty.ts`):

```scheme
(call_expression
  function: (member_expression
    property: (property_identifier) @method
    (#eq? @method "map"))
  arguments: (arguments
    (arrow_function
      body: [
        (jsx_element)            @rendered
        (jsx_self_closing_element) @rendered
        (parenthesized_expression
          (jsx_element)          @rendered)
        (parenthesized_expression
          (jsx_self_closing_element) @rendered)
      ]))) @map-call
```

A postprocessing step walks ancestors of the matched `@map-call` looking for a ternary, logical-and, or early-return guard whose test matches the `.map()` receiver's `.length` property. If no guard is found, the finding is emitted.

**Positive example (finding emitted):**

```tsx
function Inbox({ messages }: { messages: Message[] }) {
  return (
    <ul>
      {messages.map((m) => (
        <li key={m.id}>{m.subject}</li>
      ))}
    </ul>
  );
}
```

The `.map()` is unguarded — when `messages` is empty, the `<ul>` renders empty with no explanatory affordance.

**Negative example (no finding — ternary guard):**

```tsx
function Inbox({ messages }: { messages: Message[] }) {
  return messages.length === 0 ? (
    <EmptyState title="Inbox zero" />
  ) : (
    <ul>
      {messages.map((m) => (
        <li key={m.id}>{m.subject}</li>
      ))}
    </ul>
  );
}
```

**Negative example (no finding — early return guard):**

```tsx
function Inbox({ messages }: { messages: Message[] }) {
  if (!messages.length) return <EmptyState title="Inbox zero" />;
  return (
    <ul>
      {messages.map((m) => (
        <li key={m.id}>{m.subject}</li>
      ))}
    </ul>
  );
}
```

**Schema notes:**

- Per Phase 0 review.md §ANAT-P001, this rule depends on a `postProcess` predicate that is not yet first-class in the `PatternRule` schema. Sprint 1 schema extension introduces `PatternRule.postProcess?: (matches, file) => matches` so the guard-walk logic is rule-owned.
- The `@anatomy-guarantee non-empty` suppression JSDoc tag is honored by the runner via a file-scope or function-scope precondition check.

#### ANAT-P002 — ANAT-P003, ANAT-P005 — ANAT-P019 — RESERVED (critical structural)

Codes P002, P003, P005–P019 are RESERVED for Phase 2 catalog expansion. The 9 additional patterns required by success criterion #8 will land sequentially during Phase 2 against this band. Probable assignments per the proposal:

| Likely code    | Probable pattern (not yet committed)                                                  |
| -------------- | ------------------------------------------------------------------------------------- |
| ANAT-P002      | Async fetch / mutation without loading-state affordance                               |
| ANAT-P003      | Error boundary missing around an async/suspense root                                  |
| ANAT-P005      | Form submission without disable-during-submit affordance                              |
| ANAT-P006      | Long list without virtualization signal                                               |
| ANAT-P007      | Image render without alt / width / height (anatomy-side complement to A11Y image-alt) |
| ANAT-P008      | Click handler on non-button element without keyboard handler                          |
| ANAT-P009      | Modal/Dialog without close affordance                                                 |
| ANAT-P010      | Toast / Snackbar without dismiss affordance                                           |
| ANAT-P011–P019 | Overflow reservation for catalog-expansion patterns not yet enumerated                |

> **All codes in P002–P003 and P005–P019 are RESERVED — to be defined during Phase 2 catalog expansion.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

### Tier-2 recommended (P020–P059)

Tier-2 pattern codes flag ambiguous patterns that frequently indicate a craft gap but require human judgment for confirmation. Default severity `info` at `standard` strictness (deliberately under-promoted relative to Tier-1).

#### ANAT-P004 — Conditional render without fallback affordance

**Severity default:** `info`

**Source citation:** `design-component-anatomy/conditional-content` — <https://harness.dev/knowledge/design/conditional-content>

**Message template** (from Phase 0 spec `patterns/anat-p004-conditional-render-without-fallback.md`):

> `Conditional render via {form} has no else-branch affordance. When the condition is false, this region collapses silently. If that is intentional, annotate with \`@anatomy-conditional intentional\`. (file: {file}, line {line})`
>
> where `{form}` is one of:
>
> - `` `condition && <JSX/>` `` (when the short-circuit arm matches)
> - `` `condition ? <JSX/> : null` `` (when the explicit-null ternary arm matches)

**Fix hint** (verbatim from Phase 0 spec):

> Replace the silent fallback with an explicit affordance, or annotate intentional silence. Examples:
>
> ```tsx
> // Add a fallback element:
> {
>   isLoading ? <Spinner /> : <ContentReady />;
> }
>
> // Promote to a guard with content fallback:
> {
>   user.permissions.canEdit ? <EditButton /> : <ReadOnlyHint />;
> }
>
> // Or annotate (suppresses the finding for the enclosing function):
> /** @anatomy-conditional intentional — admin-only badge */
> function AdminBadge({ user }) {
>   return <>{user.isAdmin && <ShieldIcon />}</>;
> }
> ```

**Tree-sitter query** (informational — actual query lives in `catalog/patterns/ANAT-P004-conditional-render-without-fallback.ts`):

```scheme
(jsx_expression
  [
    (binary_expression
      left: (_) @condition
      operator: "&&"
      right: [
        (jsx_element)            @rendered
        (jsx_self_closing_element) @rendered
      ]) @short-circuit
    (ternary_expression
      condition: (_) @condition
      consequence: [
        (jsx_element)            @rendered
        (jsx_self_closing_element) @rendered
      ]
      alternative: [
        (null)                   @null-branch
        (false)                  @null-branch
      ]) @ternary
  ]) @conditional-render
```

A postprocessing step suppresses matches where: (1) the rendered JSX is itself a known fallback affordance (`EmptyState`, `ErrorBoundary`, `Skeleton`, `Spinner`, `LoadingSpinner`, `Placeholder`, `ErrorBanner`, `Toast`); (2) at `strictness=strict`, the condition is a negation of an error/loading flag and the enclosing JSX renders a sibling affordance; (3) the enclosing function carries `@anatomy-conditional intentional` in JSDoc.

**Positive example (finding emitted):**

```tsx
function Toolbar({ user }: { user: User }) {
  return (
    <div>
      <ViewButton />
      {user.permissions.canEdit && <EditButton />}
    </div>
  );
}
```

**Positive example (finding emitted — explicit null):**

```tsx
function Page({ error }: { error: Error | null }) {
  return error ? <ErrorBanner error={error} /> : null;
}
```

**Negative example (no finding — both branches present):**

```tsx
function Status({ isLoading }: { isLoading: boolean }) {
  return isLoading ? <Spinner /> : <CheckIcon />;
}
```

**Negative example (no finding — fallback-shaped rendered component):**

```tsx
function Wrapper({ error }: { error: Error | null }) {
  return <>{error && <ErrorBoundary fallback={...} error={error} />}</>;
}
```

**Schema notes:**

- Per Phase 0 review.md §ANAT-P004, this rule depends on (a) the `postProcess` predicate (shared with ANAT-P001) and (b) a `knownFallbackComponents?: string[]` auxiliary field. Sprint 1 schema extension introduces `PatternRule.auxiliary?: Record<string, unknown>` (or the more typed `knownFallbackComponents?: string[]`) so each rule carries its tuneable data instead of relying on runner-side constants.
- `severityDefault: info` reflects the genuinely ambiguous nature of the pattern — many `&&`-renders are correct. Strict projects can promote to `warn` via the strictness matrix.

#### ANAT-P020 — ANAT-P059 — RESERVED (Tier-2 recommended)

> **All codes in P020–P059 are RESERVED — to be defined during Phase 2 catalog expansion.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

### Tier-3 informational (P060–P099)

Tier-3 pattern codes flag stylistic patterns worth surfacing but rarely worth blocking — useful for craft critique reports but not for `harness validate` gating. Default severity `info` at `standard` strictness (not promoted by strictness `strict`).

> **All codes in P060–P099 are RESERVED — to be defined during Phase 2 catalog expansion.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

---

## ANAT-U\* — Usage findings (v2 reservation)

The `ANAT-U*` namespace is reserved for **usage-side findings** — `<Input>` call site missing a `label` prop, `<Toast>` call site missing a `duration` prop, and similar. These findings overlap heavily with harness-accessibility's call-site checks and require the a11y deferral pattern (Decision #6) to be proven on definition-side findings before extension.

**v1 emits ZERO `ANAT-U*` findings.** The namespace exists in the type system (`AnatomyFindingCode = ANAT-D... | ANAT-P... | ANAT-U...`) so v2 can ship usage-side findings without a breaking-change to the type contract. The negative criterion #28 of the spec explicitly verifies that no `ANAT-U*` codes appear in any v1 output.

Allocation strategy at v2 ship time (informational only — not committed):

| Range       | Tier   | Likely semantic                                                 |
| ----------- | ------ | --------------------------------------------------------------- |
| `U001–U049` | Tier-1 | Critical missing call-site props (label, name, id, value)       |
| `U050–U099` | Tier-2 | Recommended call-site props (helper text, aria-describedby)     |
| `U100–U199` | Tier-3 | Optional call-site props (variant, size cosmetic at usage time) |

---

## Reserved-code authoring convention

When filling in a code marked `RESERVED — to be defined during Phase 2 catalog expansion`, follow this checklist:

1. **Claim the next free code in the appropriate Tier band.** Tier-1 D001–D029 first; Tier-2 D030–D099 next; Tier-3 D100–D199 last. For ANAT-P, P001–P019 (Tier-1), then P020–P059 (Tier-2), then P060–P099 (Tier-3).
2. **Author the catalog entry** in `packages/cli/src/skills/audit-component-anatomy/src/catalog/conventions/{component}.ts` or `catalog/patterns/ANAT-P{NNN}-{slug}.ts`.
3. **Pick `severityDefault`** per the Tier-band table — `error` for Tier-1 D, `warn` for Tier-2 D, `info` for Tier-3 D; `warn` for Tier-1 P, `info` for Tier-2 / Tier-3 P. Override only with a documented reason in the catalog entry's comment header.
4. **Cite the source** with one of the published prefixes (`APG/`, `OpenUI/`, `Radix/`, `design-component-anatomy/`). Adding a new prefix requires updating the [source citation prefixes](#source-citation-prefixes) table AND the schema validator.
5. **Author one positive fixture and one negative fixture** under `packages/cli/src/skills/audit-component-anatomy/tests/fixtures/{component-or-pattern}/`. Run the audit on both and confirm the finding shape matches expectation.
6. **Write the entry in this file** following the [entry format](#entry-format). Replace the `RESERVED` placeholder paragraph with the full entry. Keep entries in numerical order.
7. **Update the table of contents** at the top of this file to add the entry's anchor.
8. **For pattern entries (`ANAT-P*`)** include the tree-sitter query (in `scheme` code block, informational) and any `postProcess` / `auxiliary` configuration the rule carries.
9. **For convention entries (`ANAT-D*`)** include the AST-runner satisfiability rule — what makes the audit consider the slot/state present (prop type member, JSX child, ARIA attribute, class utility, etc.).
10. **Verify the false-positive rate** against the quality corpus before considering the entry "shipped" (success criterion #6 requires ≤ 5% false-positive rate by Sprint 3).

---

## Cross-references

- **Proposal:** [`docs/changes/design-pipeline/audit-component-anatomy/proposal.md`](./proposal.md) — Decisions #1–#9, Success Criteria, Implementation Order
- **Phase 0 schema spike artifacts:** [`docs/changes/design-pipeline/audit-component-anatomy/phase-0-schema-spike/`](./phase-0-schema-spike/) — the five paper specs that source the defined entries above (Button, Tabs, EmptyState conventions; ANAT-P001 and ANAT-P004 patterns)
- **Phase 0 schema-fit review:** [`docs/changes/design-pipeline/audit-component-anatomy/phase-0-schema-spike/review.md`](./phase-0-schema-spike/review.md) — documents the four recommended Sprint 1 schema extensions referenced throughout this file
- **Implementation plan:** [`docs/changes/design-pipeline/audit-component-anatomy/plans/2026-05-23-audit-component-anatomy-plan.md`](./plans/2026-05-23-audit-component-anatomy-plan.md)
- **Cross-skill deferral:** the harness-accessibility deferral (Phase 1 step 2.6) suppresses A11Y-010 and A11Y-050 for components in the anatomy catalog when `design.audit.componentAnatomy.enabled = true`. ADR-003 codifies the pattern.
- **Code namespace ADR:** ADR-002 ("Anatomy finding code namespace") establishes the stable `ANAT-D*` / `ANAT-P*` / `ANAT-U*` contract for DesignConstraintAdapter and downstream skills (#4 verifier, #5 orchestrator).
