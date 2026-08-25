# Plan: Enforce capability-seam roles — structured field + single-role detector

Issue: Intense-Visions/harness-engineering#1425
Slug: capability-roles-detector
Base: origin/main
Spec: docs/changes/capability-roles-detector/specs/spec.md

## Task breakdown

### T1 — Schema field + pure detector (`packages/cli/src/skill/schema.ts`)

- Add `SkillCapabilityRolesSchema = z.object({ definition, providers, consumers })`
  with `definition: z.string().default('')`, `providers: z.array(z.string()).default([])`,
  `consumers: z.array(z.string()).default([])`. Export the inferred type
  `SkillCapabilityRoles`.
- Add `capabilityRoles: SkillCapabilityRolesSchema.optional()` to `SkillMetadataSchema`.
- Add and export a pure `capabilityRoleErrors(roles: SkillCapabilityRoles): string[]`:
  - Count filled roles (definition = non-empty trimmed string; providers/consumers =
    ≥1 non-empty trimmed entry).
  - 0 filled → one error: "capabilityRoles is declared but names no role (define a
    Service Definition, ≥1 Provider, and ≥1 Consumer, or drop the field)".
  - exactly 1 filled → one error naming the lone role and the two missing:
    "capabilityRoles declares only the <role> role (…); a capability with one role
    filled is accidental single-implementation lock-in — name the missing <a> and
    <b> roles or drop the field".
  - 2 or 3 filled → no error.

### T2 — Wire into `harness skill validate` (`packages/cli/src/commands/skill/validate.ts`)

- Add `validateCapabilityRoles(name, meta, errors)` mirroring `validateCapabilities`:
  when `meta.capabilityRoles` is present, push `capabilityRoleErrors(...)` prefixed
  `${name}/skill.yaml: `. Absent → no-op (abstain).
- Call it in `validateSkillEntry` right after `validateCapabilities`.
- Import `capabilityRoleErrors` + `SkillCapabilityRoles` type from `../../skill/schema`.

### T3 — Tests

- `packages/cli/tests/skill/schema.test.ts` (or existing schema test): unit-test
  `capabilityRoleErrors` across 0 / 1(each of the three) / 2 / 3-role and
  whitespace-only cases; assert the optional field parses and omission is valid.
- `packages/cli/tests/commands/skill-validate.*` (or the existing skill validate test):
  integration-test that a fixture skill with a single-role declaration fails
  `runSkillValidation` and a two-role / omitted one passes.

### T4 — Build + gates

- `pnpm --filter @harness-engineering/cli build` then run cli tests.
- No new `@harness-engineering/core` export → `scripts/generate-core-barrel.mjs`
  allowlist untouched.
- Run `pnpm run generate-docs` if any CLI command surface changed (it does not —
  no new command/flag), else skip.
- Run `harness skill validate` on this repo (must stay green — field is optional).
- Changeset for `@harness-engineering/cli`.

## Risk / overlap

- #1404 concurrently adds a `harness validate` check. This change touches only
  `skill/validate.ts` + `skill/schema.ts` (the `harness skill validate` path) and adds
  a single additive function call — no shared check-registry edit — so a merge conflict
  is trivial-to-nil.
