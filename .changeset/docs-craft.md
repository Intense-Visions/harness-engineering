---
'@harness-engineering/cli': minor
---

Add `docs-craft` — an LLM-judgment ceiling skill for documentation quality, the
structural twin of `design-craft` and the counterpart to the rule-based doc
floor (detect-doc-drift / check-docs / docs-pipeline). It critiques whether a
doc teaches, whether its order matches the reader's mental model, whether
examples earn their place, whether the prose is alive, whether an API/reference
doc predicts the response shape, whether a stranger walks away with the same
understanding, and whether the doc is scannable — 7 seed rubrics emitting 3-axis
findings (tier × impact × confidence), a curated exemplar set (Stripe / Vercel /
MDN / Linear / Tailwind), kind-aware rubric filtering, and hard exclusion of
sibling-owned trees (knowledge-craft, spec-craft). Ships the `harness docs-craft`
CLI, the `docs_craft` MCP tool, and the cross-cutting `critiqueDocFile` API.
