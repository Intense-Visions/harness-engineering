---
'@harness-engineering/cli': minor
---

audit-component-anatomy: add EmptyState convention with `ANAT-D020` (missing required `headline` slot).

Phase 2 catalog expansion — third component after Button and Input. `EmptyState` joins the registry returned by `getCatalogTypes()`. Unlike Button/Input, EmptyState sources from Open UI rather than APG (it is not an interactive ARIA pattern). The convention runner emits `ANAT-D020` (severity `error` at standard strictness, `warn` at permissive) when an EmptyState definition's prop type exposes none of the three documented satisfiers: `title` prop, `headline` prop, or typed `children`. Other anatomy parts (icon, description, primary/secondary action slots, default state, the zero-data / no-results / error variants, and sizes) ship on the convention for catalog completeness but are not yet wired to finding codes — those bands (`ANAT-D021`–`ANAT-D029` Tier-1 overflow, `ANAT-D030+` Tier-2) are reserved for follow-up tasks. Adds 7 new integration tests covering each satisfier path, strictness=permissive softening + strictness=strict cap, and Button+Input+EmptyState three-way partition; 2 catalog-registry unit tests assert EmptyState's presence and Tier-1 slot shape.
