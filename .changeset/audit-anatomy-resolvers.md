---
'@harness-engineering/cli': patch
---

Implement the component-type resolver's two explicit-declaration layers for `audit_anatomy`, which were stubbed (`return null` "pending the JSDoc/DESIGN.md parser task") so only the export-name heuristic resolved component types:

- **Layer 1 — JSDoc `@component-type`**: a new dependency-free JSDoc reader (`parsers/jsdoc.ts`) extracts the file's leading doc block (skipping a `use client` banner) and reads the authoritative `@component-type <Type>` self-declaration.
- **Layer 2 — DESIGN.md `## Component Registry`**: a new parser (`parsers/design-registry.ts`) finds the nearest `DESIGN.md` up the tree and parses its `| Type | File |` registry table, mapping the audited file to its declared type (parsed registries are memoized per DESIGN.md path).

Resolution order is JSDoc → registry → export-name → silent skip (Decision #3). The JSDoc reader also exposes `readJsDocTag` for the repeated `@anatomy-*` tags, groundwork for the anatomy-override and ANAT-P\* pattern layers (still pending). No behavior change for files that rely on the export-name layer.
