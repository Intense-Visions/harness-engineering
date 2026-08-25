# Spec: Enforce capability-seam roles — structured field + single-role detector

Issue: Intense-Visions/harness-engineering#1425 (follow-up to #1397 / #1418)
Slug: capability-roles-detector

## Background

Commit `f833d2556` (Closes #1397) shipped the **authoring-guidance** half of the
Service-Definition / Provider / Consumer capability-seam model: a `## Capability
Roles` prose checklist in the `create_skill` scaffold and a prose gate in
`harness-skill-authoring`. That is prose only — nothing machine-checked verifies
that a declared capability actually fills all three roles.

`harness-skill-authoring` SKILL.md (Phase 1C) defines the three roles:

1. **Service Definition** — what the capability DEFINES (the contract).
2. **Provider(s)** — who PROVIDES it (≥1 concrete implementation).
3. **Consumer(s)** — who CONSUMES it (≥1 caller depending on the definition).

The single-role red flag: a capability with only ONE role filled is accidental
single-implementation lock-in dressed up as an extension point.

## Goal

Provide the ENFORCEMENT half:

1. A **structured, optional** `capabilityRoles` field on `skill.yaml` frontmatter so
   a skill can promote its capability-seam roles from prose to machine-checkable data.
2. A **single-role detector** — a mechanical, CI-gateable check that flags any skill
   whose `capabilityRoles` is _declared_ but has only ONE of the three roles filled.
   Skills that declare no `capabilityRoles` are **not** flagged (clean abstention).

## Non-goals

- No forced retrofit of the ~789 existing skills. The field is optional; undeclared =
  not flagged. (Deliberately NOT a blanket retrofit — see #1275 over-build ladder.)
- No runtime bounds-enforcement.

## Field shape

`capabilityRoles` (optional) on `skill.yaml`:

```yaml
capabilityRoles:
  definition: string # the Service Definition — the contract this capability names
  providers: [string, ...] # who PROVIDES it (≥1 for a real seam)
  consumers: [string, ...] # who CONSUMES it (≥1 for a real seam)
```

Field names align verbatim with the `harness-skill-authoring` Phase 1C prose
(Service Definition / Provider / Consumer → `definition` / `providers` / `consumers`).

A role is considered **filled** when:

- `definition` is a non-empty (trimmed) string, and
- `providers` / `consumers` each contain ≥1 non-empty (trimmed) string.

## Detector semantics (single-role red flag)

Given a declared `capabilityRoles`, count how many of the three roles are filled:

- **0 filled** — the field is declared but empty. This is a malformed declaration,
  not a half-wired seam: report it as an error ("declared but names no role").
- **exactly 1 filled** — the single-role red flag: report it as an error naming which
  lone role is filled and which two are missing (accidental single-implementation
  lock-in).
- **2 or 3 filled** — pass. (A partially-wired seam with 2 roles is a work-in-progress,
  not accidental lock-in; the prose gate covers the "name all three" aspiration. The
  mechanical floor only fires on the unambiguous single-role red flag and the empty
  declaration.)

The detector abstains (emits nothing) when `capabilityRoles` is absent.

## Where it lives

- **Field + pure detector:** `packages/cli/src/skill/schema.ts`, colocated with the
  existing `SkillCapabilitiesSchema` / `capabilityDriftErrors` so the schema and its
  checker share one source of truth. New export: `capabilityRoleErrors(roles)`.
- **Wiring:** `packages/cli/src/commands/skill/validate.ts` — `validateSkillEntry`
  already parses `skill.yaml` via `SkillMetadataSchema` and runs `validateCapabilities`.
  Add a sibling `validateCapabilityRoles` call. This is the accountable skill-validation
  gate (`harness skill validate`) that `harness-skill-authoring` mandates ("no skill
  ships without validation passing"), mechanical and CI-gateable.

Registration is MINIMAL and ADDITIVE (one new function call in `validateSkillEntry`),
so it cannot collide with the concurrent #1404 `harness validate` check-registry change.

## Acceptance criteria

- AC1: `skill.yaml` may declare an optional `capabilityRoles` object; a skill without
  it still validates (existing ~789 skills unaffected). Verified: `harness skill
validate` passes on this repo unchanged.
- AC2: A skill declaring `capabilityRoles` with exactly one role filled fails `harness
skill validate` with a message naming the lone filled role and the two missing roles.
- AC3: A skill declaring `capabilityRoles` with two or three roles filled passes.
- AC4: A skill declaring an empty `capabilityRoles` (no roles) fails with a
  "names no role" error.
- AC5: A skill that omits `capabilityRoles` produces no roles finding (abstention).
- AC6: `capabilityRoleErrors` is a pure exported function with unit tests covering the
  0 / 1 / 2 / 3-role and whitespace-only cases.
