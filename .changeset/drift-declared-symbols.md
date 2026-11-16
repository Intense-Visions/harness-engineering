---
'@harness-engineering/core': patch
---

fix(entropy): doc-drift no longer reports existing type aliases, interfaces, enums, or file-local declarations as RENAMED/NOT_FOUND. The api-signature check now resolves doc references against every top-level declaration (not only value exports), and strips the `type` modifier and `as` alias from code-block import specifiers (#2078).
