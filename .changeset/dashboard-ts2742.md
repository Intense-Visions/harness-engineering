---
'@harness-engineering/dashboard': patch
---

Add an explicit `Hono` type annotation to the exported `app` so its inferred type is nameable via the direct `hono` dependency rather than a hoisted `.pnpm` path (fixes TS2742 in the whole-tree typecheck). Behavior-preserving.
