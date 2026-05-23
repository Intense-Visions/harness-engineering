# Convention spec — EmptyState (pattern-and-component hybrid)

> Phase 0 paper artifact. Stress-tests `ConventionRule` against a component that is also a usage pattern — `EmptyState` is both an authored component (with its own anatomy) and the *thing* referenced by pattern findings like ANAT-P001 (map-without-empty). This dual role exposes whether the schema can house both responsibilities cleanly.

## Intent

`EmptyState` is the canonical empty-data affordance: shown when a list, table, search result, or dashboard has nothing to render. As a component, it has its own anatomy (icon, headline, description, primary action, secondary action). As a *referenced* pattern, it is the named target of pattern rules — when ANAT-P001 fires, the fix hint usually reads "render `<EmptyState>` when the array is empty." The convention spec needs to be self-sufficient on the component side; the cross-reference from pattern rules is handled separately via the pattern catalog's `fixHint` text and does not need a schema linkage.

## ConventionRule

```yaml
componentType: EmptyState

slots:
  - name: icon
    required: false
    fixHint: "Optional decorative icon (`aria-hidden`). Conventional — Open UI proposal lists it as part of the canonical EmptyState anatomy."
  - name: headline
    required: true
    fixHint: "Required short message (one sentence) explaining the empty condition. Accept as `title` prop or as the first text child. Without a headline the component is not communicating its purpose."
  - name: description
    required: false
    fixHint: "Optional longer message giving context or next-step guidance. Accept as `description` prop or as additional text children."
  - name: primary-action
    required: false
    fixHint: "Optional CTA (e.g., 'Create your first project'). Accept as `action` prop or as a `<Button>` child slot. Strongly recommended when the empty state is recoverable."
  - name: secondary-action
    required: false
    fixHint: "Optional secondary CTA (e.g., 'Import from CSV'). Same prop/slot shape as `primary-action`."

states:
  - name: default
    required: true
    exclusive: false
    fixHint: "EmptyState renders one visual state. Required-by-default; flagged only if the component conditionally returns null on its own."

variants:
  - name: zero-data
    required: false
    fixHint: "Variant for 'no items have ever existed' (e.g., empty inbox on day one). Expose via `variant` prop. The headline/icon usually skew encouraging."
  - name: no-results
    required: false
    fixHint: "Variant for 'filter or search returned nothing' (data exists but is filtered out). Expose via `variant` prop. The action usually offers to clear filters."
  - name: error
    required: false
    fixHint: "Variant for 'failed to load.' Often a separate component, but EmptyState may absorb it; expose via `variant` prop and ensure the icon/headline communicate failure rather than emptiness."

sizes:
  - name: sm
    required: false
    fixHint: "Optional sizing token via `size` prop — used when EmptyState appears inside a small panel rather than as a full-page state."
  - name: md
    required: false
    fixHint: "Default size; usually implicit when `size` prop is absent."
  - name: lg
    required: false
    fixHint: "Full-page empty state; usually implicit when EmptyState is the only child of the route container."

source:
  ref: "OpenUI/empty-state"
  url: "https://open-ui.org/components/empty-state.research/"
```

## Notes on schema fit

- The component side of EmptyState fits the schema with no friction — `slots`, `states`, `variants`, `sizes` all apply naturally.
- The *pattern* side (EmptyState as the named fix for ANAT-P001/P004/etc.) is **not** modeled here. It lives in the corresponding `PatternRule.fixHint` text and in `finding-codes.md`. The schema correctly keeps these concerns separate: `ConventionRule` is about anatomy compliance of the EmptyState definition itself; `PatternRule` is about whether call sites that should render an EmptyState actually do. No cross-reference field is needed in the schema because the linkage is by component name (a string), which is durable.
- The three `variants` (zero-data / no-results / error) are a *taxonomy*, not a mutually-exclusive enum at runtime — a given EmptyState instance picks one. The schema does not require `exclusive` on variants (only states), which matches the intent.
- `source.ref = "OpenUI/empty-state"` is appropriate; APG does not catalog EmptyState (it is not an interactive ARIA pattern), and Open UI is the most authoritative public reference. Acceptable per Decision #5's source hierarchy.
