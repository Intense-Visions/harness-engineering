---
'@harness-engineering/cli': patch
---

Add per-skill `capabilities:` declarations to skill.yaml (#558).

Skills now declare a capability envelope — `{ tools, network, filesystem }` —
derived mechanically from the existing `tools:` list. `harness skill validate`
enforces it: every harness-authored skill must declare `capabilities`, and any
declared envelope must stay consistent with the skill's `tools:` (drift, e.g.
adding `WebFetch` without `network: true`, fails validation). All 89
harness-authored skills are seeded. This ships the declaration + validation
layer; runtime bounds-enforcement is a follow-up.
