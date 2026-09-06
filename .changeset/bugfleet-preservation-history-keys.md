---
'@harness-engineering/core': patch
---

Scope the #1811 Assignment History field keys (`Feature`, `Action`, `Date`) to the `## Assignment History` section instead of declaring them preservable document-wide. A hand-authored `- **Date:** ...` bullet inside a feature block was reported as preservable while a `serializeRoadmap` rewrite really does drop it, letting the monolith store accept the destructive write the #839 guard exists to refuse.
