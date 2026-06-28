---
'@harness-engineering/cli': patch
---

Implement the audit-anatomy source-of-truth override layers (follow-up to the component-type resolvers). The `resolveAnatomyRules` resolver previously stubbed Layers 1 and 2 to `null`, so anatomy rules always came from the built-in catalog with no project/author override path:

- **Layer 1 — JSDoc `@anatomy-*`**: a file's leading doc block can declare its own anatomy via `@anatomy-slot content required`, `@anatomy-state disabled exclusive`, `@anatomy-variant primary|secondary|ghost`, `@anatomy-size sm|md|lg` (`parsers/anatomy-tags.ts`), producing a `ConventionRule` that overrides the catalog default.
- **Layer 2 — DESIGN.md `## Component Anatomy Overrides`**: a tolerant parser (`parsers/design-overrides.ts`) reads per-component override blocks from the nearest DESIGN.md (list or inline `variants: a, b` styles, `(required)`/`(exclusive)` flags), memoized per DESIGN.md path.

Resolution order is JSDoc → DESIGN.md → built-in catalog. Components with neither an `@anatomy-*` declaration nor a DESIGN.md override are unchanged (catalog default).
