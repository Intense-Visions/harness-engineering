---
'@harness-engineering/eslint-plugin': patch
---

Add explicit type annotations to the `plugin`, `configs`, and `rules` exports so their inferred types are nameable via the direct `@typescript-eslint/utils` dependency rather than a hoisted `.pnpm` path (fixes TS2742 in the DTS build). Behavior-preserving.
