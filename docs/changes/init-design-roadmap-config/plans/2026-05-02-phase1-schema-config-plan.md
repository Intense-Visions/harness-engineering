# Plan: Phase 1 — Schema & Config (`design.enabled` + platforms refinement)

**Date:** 2026-05-02
**Spec:** `docs/changes/init-design-roadmap-config/proposal.md`
**Phase:** 1 of 5 (Schema & Config)
**Tasks:** 5
**Time:** ~19 min
**Integration Tier:** small
**Rigor:** standard
**Session:** `changes--init-design-roadmap-config--proposal`

---

## Goal

Extend `DesignConfigSchema` in `packages/cli/src/config/schema.ts` to expose a tri-state `design.enabled: boolean` field and enforce that `design.platforms` is non-empty when `enabled === true`, while remaining backward compatible with all existing `harness.config.json` shapes.

## Observable Truths (Acceptance Criteria, EARS-framed)

1. **Ubiquitous:** `DesignConfigSchema` shall expose `enabled` as an optional `boolean` with no default value (preserves the "absent" tri-state per proposal.md:96).
2. **Event-driven:** When `DesignConfigSchema` is parsed with `{ enabled: true, platforms: ['web'] }`, it shall succeed.
3. **Event-driven:** When `DesignConfigSchema` is parsed with `{ enabled: true, platforms: ['web', 'mobile'] }`, it shall succeed.
4. **Event-driven:** When `DesignConfigSchema` is parsed with `{ enabled: false }`, it shall succeed.
5. **Event-driven:** When `DesignConfigSchema` is parsed with `{}` (no `enabled`), it shall succeed (backward compatibility).
6. **Unwanted:** If `DesignConfigSchema` is parsed with `{ enabled: true }` (or `{ enabled: true, platforms: [] }`), it shall reject with a Zod issue whose message references `platforms`.
7. **Unwanted:** If `DesignConfigSchema` is parsed with `{ enabled: 'yes' }`, it shall reject (boolean strictness).
8. **Ubiquitous:** `HarnessConfigSchema` shall accept a `design` block populated with `enabled` + `platforms` alongside the existing fields.
9. **Ubiquitous:** `harness validate` shall pass against `harness.config.json` containing `{ design: { enabled: true, platforms: ['web'] } }`.
10. **Ubiquitous:** `harness validate` shall pass against `harness.config.json` containing no `design` block.
11. **Ubiquitous:** `harness validate` shall pass against `harness.config.json` containing the existing populated `design` shape (`strictness`/`platforms`/`tokenPath`/`aestheticIntent`) without `enabled`.
12. **Ubiquitous:** All tests in `packages/cli/tests/config/design-schema.test.ts` shall pass after the change (existing 13 + new ~13).
13. **Ubiquitous:** The `DesignConfig` TypeScript type exported from `schema.ts` shall include `enabled?: boolean`.

## Out of Scope (Phase 1)

- Init skill changes (`initialize-harness-project/SKILL.md`) — Phase 2 of the spec.
- `harness-design-system/SKILL.md` runtime read of `design.enabled` — Phase 3 of the spec.
- Documentation/catalog updates — Phase 4 of the spec.
- 6-path init verification — Phase 5 of the spec.

## Uncertainties

- **[ASSUMPTION]** `enabled` MUST NOT have a Zod `.default(...)`. The spec defines tri-state runtime: `true | false | absent` (proposal.md:96). A default would erase the absent state and break Decision D3.
- **[ASSUMPTION]** Existing `platforms: z.array(...).default([])` semantics stay. The new "non-empty when enabled=true" rule is enforced via `.superRefine`, not by changing `platforms`'s base shape. This avoids a structural break and keeps the `.default([])` for the `enabled=false` / absent paths.
- **[ASSUMPTION]** "Empty `design` config" in step 3 of the spec's Phase 1 covers two shapes: missing `design` block entirely AND `design: {}` literal. Both must validate. Tests cover both.
- **[DEFERRABLE]** Exact wording of the refinement error message — current draft is `"design.platforms must be a non-empty array of \"web\" | \"mobile\" when design.enabled is true"`. Adjustable during execution if reviewers prefer different phrasing.
- **[DEFERRABLE]** Whether a downstream JSON Schema artifact also needs regeneration. Search of the repo shows the canonical schema is Zod-only; no JSON Schema artifact appears to be generated. If one exists downstream, that is out of Phase 1 scope.

## File Map

```
MODIFY packages/cli/src/config/schema.ts
       Lines 119-128 — extend DesignConfigSchema with `enabled` field + .superRefine() block; expand JSDoc.

MODIFY packages/cli/tests/config/design-schema.test.ts
       Append ~10 new tests covering enabled tri-state, refinement, and HarnessConfigSchema integration.

MODIFY packages/cli/tests/config/loader.test.ts (Task 4 only — read first; may skip if duplicative)
       Optional integration test confirming loadConfig accepts design.enabled.
```

No new files. No deletions. No public API surface changes beyond adding an optional field.

## Skeleton

1. Test extensions for `enabled` (~2 tasks, ~7 min)
2. Schema implementation with refinement (~1 task, ~4 min)
3. HarnessConfigSchema integration tests (~1 task, ~3 min)
4. End-to-end validate verification (~1 task, ~4 min)

_Skeleton approved: implicit (task count 5 < 8 threshold; provided for clarity)._

## Tasks

### Task 1: Add failing tests for `enabled` field shape and tri-state semantics

**Depends on:** none
**Files:** `packages/cli/tests/config/design-schema.test.ts`
**Skills:** `ts-zod-integration` (reference)

1. Open `packages/cli/tests/config/design-schema.test.ts`.
2. Inside the existing `describe('DesignConfigSchema', () => { ... })` block, append the following tests at the end (just before its closing `});`):

   ```typescript
   it('accepts enabled: true with platforms specified', () => {
     const result = DesignConfigSchema.safeParse({
       enabled: true,
       platforms: ['web'],
     });
     expect(result.success).toBe(true);
   });

   it('accepts enabled: false without platforms', () => {
     const result = DesignConfigSchema.safeParse({ enabled: false });
     expect(result.success).toBe(true);
   });

   it('accepts config without enabled field (tri-state: absent)', () => {
     const result = DesignConfigSchema.parse({});
     expect(result.enabled).toBeUndefined();
   });

   it('preserves enabled: true on parse', () => {
     const result = DesignConfigSchema.parse({
       enabled: true,
       platforms: ['mobile'],
     });
     expect(result.enabled).toBe(true);
   });

   it('preserves enabled: false on parse', () => {
     const result = DesignConfigSchema.parse({ enabled: false });
     expect(result.enabled).toBe(false);
   });

   it('rejects non-boolean enabled value', () => {
     const result = DesignConfigSchema.safeParse({ enabled: 'yes' });
     expect(result.success).toBe(false);
   });
   ```

3. Run the failing tests:

   ```bash
   pnpm --filter @harness-engineering/cli test -- design-schema
   ```

   Observe: the `expect(result.enabled).toBe(true)`, `toBe(false)`, and `'rejects non-boolean enabled value'` assertions fail (Zod strips unknown keys silently and accepts `'yes'` because no `enabled` field exists yet on the schema).

4. Run: `harness validate`
5. Commit: `test(config): add failing tests for design.enabled tri-state semantics`

---

### Task 2: Add failing tests for `enabled=true` requires non-empty `platforms`

**Depends on:** Task 1
**Files:** `packages/cli/tests/config/design-schema.test.ts`
**Skills:** `ts-zod-integration` (reference)

1. Open `packages/cli/tests/config/design-schema.test.ts`.
2. Inside the same `describe('DesignConfigSchema', () => { ... })` block, after the tests added in Task 1, append:

   ```typescript
   it('rejects enabled: true without platforms', () => {
     const result = DesignConfigSchema.safeParse({ enabled: true });
     expect(result.success).toBe(false);
     if (!result.success) {
       const messages = result.error.issues.map((i) => i.message).join(' ');
       expect(messages.toLowerCase()).toContain('platforms');
     }
   });

   it('rejects enabled: true with empty platforms array', () => {
     const result = DesignConfigSchema.safeParse({
       enabled: true,
       platforms: [],
     });
     expect(result.success).toBe(false);
   });

   it('accepts enabled: true with both platforms', () => {
     const result = DesignConfigSchema.safeParse({
       enabled: true,
       platforms: ['web', 'mobile'],
     });
     expect(result.success).toBe(true);
   });

   it('accepts existing populated design config without enabled field (back-compat)', () => {
     const result = DesignConfigSchema.safeParse({
       strictness: 'standard',
       platforms: ['web', 'mobile'],
       tokenPath: 'design-system/tokens.json',
       aestheticIntent: 'design-system/DESIGN.md',
     });
     expect(result.success).toBe(true);
   });
   ```

3. Inside the existing `describe('HarnessConfigSchema with design block', () => { ... })` block (note: this describe uses an existing `baseConfig` constant — reuse it), append:

   ```typescript
   it('accepts design block with enabled: true and platforms', () => {
     const result = HarnessConfigSchema.safeParse({
       ...baseConfig,
       design: { enabled: true, platforms: ['web'] },
     });
     expect(result.success).toBe(true);
   });

   it('accepts design block with enabled: false', () => {
     const result = HarnessConfigSchema.safeParse({
       ...baseConfig,
       design: { enabled: false },
     });
     expect(result.success).toBe(true);
   });

   it('rejects design block with enabled: true and no platforms', () => {
     const result = HarnessConfigSchema.safeParse({
       ...baseConfig,
       design: { enabled: true },
     });
     expect(result.success).toBe(false);
   });
   ```

4. Run failing tests:

   ```bash
   pnpm --filter @harness-engineering/cli test -- design-schema
   ```

   Observe: the four refinement tests fail because no `.superRefine` exists yet — Zod accepts `{ enabled: true }` because `platforms` defaults to `[]` and there is no cross-field check.

5. Run: `harness validate`
6. Commit: `test(config): add failing tests for design.enabled requires platforms`

---

### Task 3: Implement `enabled` field and platforms refinement on `DesignConfigSchema`

**Depends on:** Task 2
**Files:** `packages/cli/src/config/schema.ts`
**Skills:** `ts-zod-integration` (apply)

1. Open `packages/cli/src/config/schema.ts`.
2. Locate `DesignConfigSchema` at lines 119-128 (the `/** Schema for design system and aesthetic consistency configuration. */` block). Replace its entire definition with:

   ```typescript
   /**
    * Schema for design system and aesthetic consistency configuration.
    *
    * `enabled` is tri-state at runtime: `true`, `false`, or absent.
    * - `true`  → fire `harness-design-system` skill (full discover/define/generate/validate)
    * - `false` → permanent decline (skill skips silently)
    * - absent  → fire gentle prompt asking the user to decide (existing default behavior)
    *
    * When `enabled === true`, `platforms` must be a non-empty array.
    */
   export const DesignConfigSchema = z
     .object({
       /**
        * Whether design-system tooling is enabled for this project. Set during init.
        * Tri-state semantics: omit the field to indicate "not configured."
        * Do NOT add a `.default(...)` — preserving "absent" is required by the spec.
        */
       enabled: z.boolean().optional(),
       /** Strictness of design system enforcement */
       strictness: z.enum(['strict', 'standard', 'permissive']).default('standard'),
       /** Supported target platforms */
       platforms: z.array(z.enum(['web', 'mobile'])).default([]),
       /** Path to design tokens (e.g. JSON or CSS) */
       tokenPath: z.string().optional(),
       /** Brief description of the intended aesthetic direction */
       aestheticIntent: z.string().optional(),
     })
     .superRefine((value, ctx) => {
       if (value.enabled === true && (!value.platforms || value.platforms.length === 0)) {
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['platforms'],
           message:
             'design.platforms must be a non-empty array of "web" | "mobile" when design.enabled is true',
         });
       }
     });
   ```

   Notes:
   - `enabled` MUST NOT have `.default(...)` — preserving "absent" tri-state is a hard requirement (proposal.md:96).
   - `.superRefine` (not `.refine`) is used so the issue can attach to `path: ['platforms']` for accurate error reporting.
   - The existing `DesignConfig` type export at line 381 (`z.infer<typeof DesignConfigSchema>`) automatically picks up the optional `enabled` field — Zod's type inference handles refinements transparently. No type export change needed.

3. Run all tests:

   ```bash
   pnpm --filter @harness-engineering/cli test -- design-schema
   ```

   Observe: all tests pass (13 pre-existing + 6 from Task 1 + 4 + 3 from Task 2 = 26).

4. Run typecheck:

   ```bash
   pnpm --filter @harness-engineering/cli typecheck
   ```

   Confirm no type errors.

5. Run: `harness validate`
6. Run: `harness check-deps`
7. Commit: `feat(config): add design.enabled with platforms refinement`

---

### Task 4: Add loader-level integration test for `design.enabled`

**Depends on:** Task 3
**Files:** `packages/cli/tests/config/loader.test.ts` (read first), possibly `packages/cli/tests/fixtures/...`
**Skills:** `ts-zod-integration` (reference)

`[checkpoint:human-verify]` — Read the existing `loader.test.ts` shape, identify whether it uses on-disk fixture files or inline JSON, and decide whether the new test adds value beyond Tasks 1-3 (which already cover schema-level integration). If duplicative, skip the test addition and mark this task complete with a note in handoff.

1. Read `packages/cli/tests/config/loader.test.ts` end-to-end.
2. **If the file uses on-disk fixtures** (e.g., `loadConfig(path)` against fixture files):
   - Add a fixture file with `{ "version": 1, "design": { "enabled": true, "platforms": ["web"] } }` under the existing fixtures directory.
   - Add a test asserting `loadConfig(fixturePath).ok === true` and `result.value.design?.enabled === true`.
3. **If the file uses inline parsing** (e.g., `loadConfig` reads from a constructed temp file):
   - Add an inline test that constructs a config with `design.enabled` and asserts the loader passes it through correctly.
4. **If duplication of Task 2's `HarnessConfigSchema` tests would be excessive** (loader.test.ts simply delegates to `HarnessConfigSchema.parse`):
   - Skip the test addition.
   - Document the decision under `concerns` in the handoff: "Skipped Task 4 — loader.test.ts coverage is purely schema-delegated and duplicating would add no signal beyond Task 2."
5. Run:

   ```bash
   pnpm --filter @harness-engineering/cli test -- loader
   ```

   Confirm baseline + any new test pass.

6. Run: `harness validate`
7. If a test was added: commit `test(config): verify loader accepts design.enabled at config root`. If skipped: no commit.

---

### Task 5: End-to-end `harness validate` smoke check across populated and empty `design` configs

**Depends on:** Task 4
**Files:** `packages/cli/tests/fixtures/valid-project/harness.config.json` (temporary, scratch only) — verification only
**Category:** integration

`[checkpoint:human-verify]` — After running the four `harness validate` invocations below, pause and show the user the exit codes and output for each, confirming that observable truths #9, #10, #11 pass and the negative variant fails as expected.

This task verifies observable truths #9-#11 against the running CLI binary, beyond schema unit tests.

1. Read the current `harness.config.json` at the monorepo root: `/Users/cwarner/Projects/harness-engineering/harness.config.json`. Note its current `design` block contents (or absence). DO NOT modify or commit changes to this file.

2. Run baseline:

   ```bash
   harness validate
   ```

   Confirm exit code 0 and `validation passed`.

3. Create a temporary scratch directory with three test config files (use `/tmp/harness-phase1-verify/` to avoid touching the repo working tree):

   ```bash
   mkdir -p /tmp/harness-phase1-verify/variant-a /tmp/harness-phase1-verify/variant-b /tmp/harness-phase1-verify/variant-c /tmp/harness-phase1-verify/variant-d
   ```

   Write each variant's `harness.config.json`:
   - **Variant A — enabled+platforms populated:**
     `/tmp/harness-phase1-verify/variant-a/harness.config.json` →
     ```json
     { "version": 1, "design": { "enabled": true, "platforms": ["web"] } }
     ```
   - **Variant B — explicit decline:**
     `/tmp/harness-phase1-verify/variant-b/harness.config.json` →
     ```json
     { "version": 1, "design": { "enabled": false } }
     ```
   - **Variant C — no design block:**
     `/tmp/harness-phase1-verify/variant-c/harness.config.json` →
     ```json
     { "version": 1 }
     ```
   - **Variant D (negative) — enabled=true with no platforms:**
     `/tmp/harness-phase1-verify/variant-d/harness.config.json` →
     ```json
     { "version": 1, "design": { "enabled": true } }
     ```

4. Run validate against each variant. The CLI flag is `--config-path` per `runValidate`'s `ValidateOptions.configPath`:

   ```bash
   harness validate --config-path /tmp/harness-phase1-verify/variant-a/harness.config.json
   harness validate --config-path /tmp/harness-phase1-verify/variant-b/harness.config.json
   harness validate --config-path /tmp/harness-phase1-verify/variant-c/harness.config.json
   harness validate --config-path /tmp/harness-phase1-verify/variant-d/harness.config.json
   ```

   Expect:
   - Variants A, B, C → exit 0, "validation passed".
   - Variant D → non-zero exit, error message referencing `platforms`.

   If validate refuses the variants for unrelated reasons (e.g. missing AGENTS.md in the scratch dir), copy a minimal AGENTS.md into each variant directory or run validate from the monorepo root and override only the config path. Document the resolution in the handoff `concerns` field.

5. Clean up:

   ```bash
   rm -rf /tmp/harness-phase1-verify
   ```

6. Run final: `harness validate` (against the unchanged repo root config). Confirm pass.
7. No commit needed unless intentional fixtures were added under `packages/cli/tests/fixtures/`. If so: commit `test(config): add fixtures verifying design.enabled config validation`.

---

## Verification Summary

After Task 5 completes:

- 13 new tests pass in `packages/cli/tests/config/design-schema.test.ts` (alongside the 13 pre-existing).
- `harness validate` passes against the four CLI variants exactly as predicted by the schema.
- `pnpm --filter @harness-engineering/cli typecheck` passes.
- `harness validate` and `harness check-deps` pass at the monorepo root.
- `harness.config.json` at the repo root is unchanged.
- Backward compatibility maintained: any pre-existing `design` block (without `enabled`) continues to validate.

## Handoff to Phase 2

Phase 2 of the spec ("Init Skill Updates") depends on this schema being live. After Phase 1 commits land, the init skill can write `design.enabled: true` and `design.platforms: ['web']` (or similar) to `harness.config.json` knowing the schema will accept it.

The `concerns` field in handoff.json will surface any unresolved decisions (e.g., refinement error wording, loader test skip) for Phase 2's planner to consider.

## Gates

- All tests in `packages/cli/tests/config/design-schema.test.ts` pass.
- Typecheck passes.
- `harness validate` and `harness check-deps` pass at repo root (unchanged config).
- Variants A/B/C of `harness validate` pass with exit 0; Variant D fails with `platforms` error.
- No `.default(...)` added to `enabled` (preserves tri-state).
- No structural change to `platforms` (`.default([])` retained; refinement is the constraint).
