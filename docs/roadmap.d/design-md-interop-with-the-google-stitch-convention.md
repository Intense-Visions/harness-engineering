---
slug: "design-md-interop-with-the-google-stitch-convention"
milestone: "Intake"
order: 37
---

### DESIGN.md interop with the Google Stitch convention

- **Status:** planned
- **Spec:** —
- **Summary:** Add import/export interop between harness's design system and the Google Stitch `DESIGN.md` convention, so teams arriving with an existing DESIGN.md can adopt harness without rewriting it. Two independent sources have standardized on the Stitch format: `VoltAgent/awesome-design-md` (107.5k, MIT) ships 73 files in it, and `pbakaus/impeccable` (57.4k, Apache-2.0) both consumes it and generates it via `/impeccable document`. Concrete divergence to resolve: harness places the file at `design-system/DESIGN.md` paired with `tokens.json`, while the Stitch convention is a plain-markdown file at project root. Scope deliberately as boundary interop, NOT format replacement — harness's format carries the machine-checkable half (`tokens.json`, the `$extensions.harness.brand.forbidden_contexts` schema that `audit-brand-compliance` reads for BRAND-T001) that a plain-markdown standard has nowhere to put, and dropping that would discard the constraints-as-code thesis. Serves the Multi-client portability track. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 3.50).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1277
