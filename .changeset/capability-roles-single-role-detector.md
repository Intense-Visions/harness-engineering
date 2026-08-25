---
'@harness-engineering/cli': minor
---

Enforce capability-seam roles with a structured field + single-role detector (#1425).

Adds an optional `capabilityRoles` field to `skill.yaml` frontmatter —
`{ definition: string; providers: string[]; consumers: string[] }` — so a skill can
promote its Service-Definition / Provider / Consumer roles from prose (shipped in
#1418) to machine-checkable data. A new detector in `harness skill validate` flags any
skill whose `capabilityRoles` is _declared_ but fills only ONE of the three roles (or
none) — accidental single-implementation lock-in dressed up as an extension point.

The field is optional: skills that omit it abstain (no finding), so the ~789 existing
skills are unaffected — no forced retrofit. Two or three filled roles pass; the
mechanical floor fires only on the unambiguous single-role red flag and the empty
declaration. Field names mirror the `harness-skill-authoring` Phase 1C prose. The core
detection is a pure exported `capabilityRoleErrors()` colocated with the existing
capability-envelope checker.
