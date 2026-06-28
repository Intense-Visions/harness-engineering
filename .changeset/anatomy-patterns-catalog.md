---
'@harness-engineering/cli': patch
---

Expand the audit-anatomy ANAT-P\* catalog from 2 to the proposal's target of 10 composition patterns, and refactor the catalog onto a shared `presencePattern` factory (trigger present AND no mitigating affordance in file → one `warn` finding). New patterns:

- **P003 fetch-without-error** — async load with no error state.
- **P004 conditional-render-without-fallback** — `{data && <…>}` with no else/empty branch.
- **P005 form-without-submit-feedback** — submit with no pending/success/error signal.
- **P006 modal-without-dismiss** — `Modal`/`Dialog`/`Drawer` with no `onClose`/`onDismiss`/`onOpenChange`.
- **P007 async-action-without-pending** — async handler with no disabled/pending state.
- **P008 list-without-key** — `.map(...)` rendering elements with no `key`.
- **P009 router-without-not-found** — route table with no catch-all/404.
- **P010 destructive-action-without-confirm** — delete/remove with no confirmation step.

(P001 map-without-empty and P002 fetch-without-loading are unchanged.) Patterns deliberately avoid pure-accessibility checks (deferred to v2 per Decision #2) and stay conservative source-heuristics to keep false positives low. `full` mode runs all 10; `fast` mode is unchanged.
