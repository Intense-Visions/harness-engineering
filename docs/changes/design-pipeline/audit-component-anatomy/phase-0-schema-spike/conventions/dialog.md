# Convention spec — Dialog (modal overlay)

> Phase 0 paper artifact (filed during Phase 2 catalog expansion). Stress-tests `ConventionRule` against the canonical modal-overlay component whose Tier-1 critical requirement is an accessible name — the most-cited a11y violation in published dialog audits. Sourced from the ARIA APG `dialog (modal)` pattern and Radix Primitives `Dialog`.

## Intent

A `Dialog` is a modal overlay that interrupts the underlying view, traps focus, and requires an accessible name so assistive technology can announce it on open. The APG mandate is unambiguous: every dialog `MUST` have an accessible name, supplied via `aria-labelledby` (pointing at a visible heading) or `aria-label` when no visible label is available. In component libraries this maps to a `title` prop (the most ergonomic surface) backed by one of the ARIA attributes at the DOM layer.

This convention treats the accessible name as a Tier-1 required `slot` (`name: 'title'`) with the same three-satisfier shape used by `Input.label` (ANAT-D004): `title`, `aria-label`, or `aria-labelledby`. The component-side audit catches the failure mode "Dialog definition exposes no labelling affordance" — the canonical violation that breaks screen-reader announcement on open.

## ConventionRule

```yaml
componentType: Dialog

slots:
  - name: title
    required: true
    fixHint: 'Add an accessible-name affordance. Accept a `title` prop (string), an `aria-label` prop (string), or an `aria-labelledby` prop (id reference). A Dialog without an accessible name is the canonical APG violation — screen readers announce it as an unnamed modal on open.'
  - name: description
    required: false
    fixHint: 'Optional `description` / `aria-describedby` surface for the supporting copy below the title. When present, wire to the dialog via `aria-describedby`.'
  - name: close-action
    required: false
    fixHint: 'Optional explicit close affordance (`Dialog.Close`, `closeButton`, or a passed-in callback). Strongly recommended — APG requires Escape close anyway, but a visible button is the ergonomic default.'
  - name: footer
    required: false
    fixHint: 'Optional action region for primary/secondary CTAs. Accept as `footer` prop or as a `Dialog.Footer` child slot. APG does not mandate footer placement, but the Tier-2 anatomy entry tracks it for catalog completeness.'

states:
  - name: open
    required: true
    exclusive: true
    fixHint: 'A Dialog must expose an `open` / `isOpen` controlled state (boolean) — APG requires the modal lifecycle to be observable by the consumer. Exclusive with `closed` at runtime (a dialog cannot be both open and closed on the same render).'
  - name: closed
    required: false
    exclusive: true
    fixHint: 'Implicit closed state when `open` is false. Usually does not need its own prop — the runner verifies the conditional render branch exists.'

variants:
  - name: alert
    required: false
    fixHint: 'Variant for confirmation / destructive prompts. APG `alertdialog` pattern: expose via a `variant` or `role="alertdialog"` switch. The alert variant constrains the footer to a destructive CTA + cancel pair.'
  - name: standard
    required: false
    fixHint: 'Default variant. Usually implicit when `variant` prop is absent.'

sizes:
  - name: sm
    required: false
    fixHint: 'Optional sizing token via `size` prop — used for compact confirmation dialogs.'
  - name: md
    required: false
    fixHint: 'Default size; usually implicit when `size` prop is absent.'
  - name: lg
    required: false
    fixHint: 'Optional sizing token via `size` prop — used for full-page form dialogs.'

source:
  ref: 'APG/dialog-modal'
  url: 'https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/'
```

## Notes on schema fit

- The Dialog convention is a clean fit. The four orthogonal axes (slots / states / variants / sizes) absorb the APG vocabulary verbatim. The Tier-1 slot (`title`) mirrors `Input.label` exactly — same satisfiers, same three-satisfier check, same a11y deferral profile (paired with A11Y-010 / A11Y-050 once the deferral wiring grows to cover Dialog).
- `states.open` carries `exclusive: true` in the per-instance scope (a render cannot be both open and closed) — this matches the original `exclusive` semantic without the per-sibling-set overloading that Tabs introduced (review.md §Tabs).
- The `alert` variant aligns with APG's `alertdialog` pattern but is exposed via a `variant` prop rather than a separate componentType. The convention deliberately treats `alertdialog` as a Dialog _variant_ rather than a sibling component — projects that ship a dedicated `AlertDialog` export will get nominal type matching once `AlertDialog` is registered separately (out of scope for this convention).
- `source.ref = "APG/dialog-modal"` adopts an existing prefix (`APG/`) — no new vocabulary needed. Acceptable per the published source-ref prefix table in `finding-codes.md`.
- Dialog is also the canonical _referenced_ pattern for several ANAT-P\* findings (e.g. "destructive action without confirmation" once that pattern lands). Like EmptyState, the cross-reference travels via component-name string in pattern fixHints — no schema linkage needed.
