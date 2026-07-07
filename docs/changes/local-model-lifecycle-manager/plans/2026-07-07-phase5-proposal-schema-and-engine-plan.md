# Plan: Phase 5 — Proposal Schema Generalization + Model Proposal Engine (LMLM)

**Date:** 2026-07-07 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (§ Phase 5, § Soundness Reconciliation 2026-07-07 D11) | **Tasks:** 20 | **Time:** ~78 min | **Integration Tier:** large (MATERIALIZE)

> **Milestone boundary:** Task 11 (N3 gate) is a hard checkpoint. **5a (Tasks 1–11) must fully land and go green before any 5b task (12–18) starts.** 5b builds on the generalized schema; starting it early against the closed schema wastes work.

---

## Goal

Generalize the closed `SkillProposalSchema` into a discriminated `ProposalSchema` (`kind: 'skill' | 'model'`) with transparent read-migration of legacy records (5a), then ship the model-proposal lifecycle — justification renderer, diff engine, approve/reject handlers, stale-target handling, and `harness models` CLI subcommands — reusing the hermes-phase-4 review queue (5b).

## Observable Truths (Acceptance Criteria)

1. **[MODIFIED schema]** `packages/types/src/proposals.ts` exports `ProposalSchema` = `z.discriminatedUnion('kind', [skill, model])`. The skill variant carries `kind: 'skill'` + `skillKind: 'new-skill' | 'refinement'`; the model variant carries `kind: 'model'` + a `model` content object.
2. **[read-migration]** A legacy on-disk record `{ kind: 'new-skill', … }` (no outer `kind`, no `skillKind`) parsed through `getProposal` returns `{ kind: 'skill', skillKind: 'new-skill', … }`. Proven by a new golden round-trip test.
3. **[N3]** `packages/types/tests/proposals.test.ts` passes **unchanged** (guaranteed by the `preprocess` migration + the retained `ProposalKindSchema` alias). Every other pre-existing proposal test passes after mechanical `kind`→`skillKind` assertion renames only — no behavior, count, or flow change. Verified at Task 11.
4. **[F6]** `diffPoolAgainstRanking()` emits **at most one** proposal per pool entry that has a viable swap-in beating it by ≥ `proposalThreshold`. Unit-tested.
5. **[F7]** A `(target.ollamaName, replaces?.ollamaName)` pair present in the rejected-history input is **not** re-emitted by the engine. Unit-tested.
6. **[F11]** Approving a model proposal whose installer returns `{ status: 'error', code: 'failed_target_missing' }` transitions the proposal to status `failed_target_missing`, emits a `local-models:proposal` bus event, and **leaves pool state unchanged**. Handler-tested.
7. **[CLI]** `harness models proposals` lists pending model proposals; `harness models reject <id>` records a rejection decision (feeding F7 dedup); `harness models approve <id>` drives the kind-aware approve route into `onApprove`.
8. **[build]** `pnpm turbo run build --filter=@harness-engineering/dashboard...` is green; `pnpm --filter <pkg> typecheck` is clean for types, core, orchestrator, cli, dashboard, local-models.
9. **[MATERIALIZE]** ADR `docs/knowledge/decisions/0058-generalize-skill-proposal-into-discriminated-proposal.md` exists; knowledge doc records the `Model Proposal` business concept.

## Uncertainties

- **[ASSUMPTION — confirm at sign-off] N3 "tests unchanged" scope.** Option A **renames** the discriminator field (`kind`→`skillKind` + new outer `kind`), so consumer tests that assert `expect(p.kind).toBe('new-skill')` (store.test:53,144; skill-proposal.test:68,116) and object fixtures that set `kind:'new-skill'` (events/gate/promote/cli tests) **cannot** be literally byte-unchanged. This plan interprets N3 as: (a) the **types schema test passes verbatim** via the `preprocess` legacy-accepting migration + `ProposalKindSchema` alias; (b) the **runtime skill-proposal flow is unaffected**; (c) consumer tests receive **mechanical field-rename edits only** (fixtures `kind:'new-skill'` → `kind:'skill', skillKind:'new-skill'`; assertions `.kind` → `.skillKind`) with no change to test count or behavior; (d) **event/summary payloads keep a `kind` field whose value is the `skillKind`** (`emitProposal*` sets `kind: proposal.skillKind`), so envelope/event/CLI-summary assertions (`kind:'new-skill'`) stay unchanged. If the operator requires strictly zero consumer-test edits, Option A is infeasible and the schema shape must be revisited — that would be BLOCKING.
- **[RESOLVED] CLI does not need the `@harness-engineering/local-models` workspace dep.** The model-proposal **content schema lives in `packages/types`** (re-exported via `@harness-engineering/core`, which the CLI already imports proposal types from). `harness models proposals` lists via the core store; `approve/reject` go over HTTP. No pool/installer types are touched in the CLI. (Phase 4 deliberately left CLI without the edge; this plan keeps it that way.)
- **[RESOLVED] No new workspace deps at all.** 5a touches only existing dep edges (types→core→orchestrator/cli/dashboard). 5b: `local-models` already depends on `@harness-engineering/types`; `orchestrator` already depends on `@harness-engineering/local-models` (Phase 4). **No `pnpm install` needed** — only `turbo build` in dependency order before typecheck/tests.
- **[ASSUMPTION] Engine/handler layering.** The pure diff **engine** and **justification** renderer live in `packages/local-models/src/proposals/` (spec package layout; independently testable, no orchestrator deps). The lifecycle **handlers** (`onApprove`/`onReject`, installer + PoolManager + bus wiring) and the **renderer registration** live in `packages/orchestrator/src/proposals/` (owns the queue, installer wiring, event bus). If review prefers handlers in local-models, Task 15/16 move but keep the same signatures.
- **[DEFERRABLE] Full HTTP route suite + WS wiring is Phase 7.** 5b extends the **existing** `/api/v1/proposals/:id/{approve,reject}` route to be kind-aware (skill→promote, model→model-handler) so approve is exercisable end-to-end. The dedicated `/api/v1/local-models/*` routes and real WS fan-out remain Phase 7. The 5b handler emits the `local-models:proposal` event on the bus (testable); WS delivery is Phase 7.
- **[DEFERRABLE] Scheduler timer is Phase 6.** 5b provides `diffPoolAgainstRanking()` (the function the Phase 6 scheduler calls). F6's "24h after start" wrapper is Phase 6; 5b proves the ≤1-per-entry emission logic by unit test.

## File Map

### Phase 5a — schema refactor

- MODIFY `packages/types/src/proposals.ts` (generalize; add model variant + migration)
- MODIFY `packages/types/tests/proposals.test.ts` (ADD migration + model-schema tests; existing cases untouched)
- MODIFY `packages/types/src/index.ts` (export new symbols; retain aliases)
- MODIFY `packages/core/src/proposals/store.ts` + `packages/core/src/proposals/index.ts` (re-export `Proposal`/model types)
- MODIFY `packages/core/tests/proposals/store.test.ts`
- MODIFY `packages/orchestrator/src/proposals/gate.ts` + `.../tests/proposals/gate.test.ts`
- MODIFY `packages/orchestrator/src/proposals/promote.ts` + `.../tests/proposals/promote.test.ts`
- MODIFY `packages/orchestrator/src/proposals/events.ts` + `.../tests/proposals/events.test.ts`
- MODIFY `packages/orchestrator/src/server/routes/v1/proposals.ts` + `.../v1/proposals.test.ts`
- MODIFY `packages/cli/src/commands/proposals.ts` + `packages/cli/src/mcp/tools/skill-proposal.ts` + their tests
- MODIFY `packages/dashboard/src/client/pages/Proposals.tsx`

### Phase 5b — model proposal lifecycle

- CREATE `packages/local-models/src/proposals/justification.ts` (+ test)
- CREATE `packages/local-models/src/proposals/engine.ts` (+ test)
- CREATE `packages/local-models/src/proposals/index.ts`; MODIFY `packages/local-models/src/index.ts`
- CREATE `packages/orchestrator/src/proposals/model-handlers.ts` (+ test)
- CREATE `packages/orchestrator/src/proposals/model-renderer.ts`; MODIFY `packages/orchestrator/src/proposals/index.ts`; MODIFY `packages/orchestrator/src/server/routes/v1/proposals.ts` (kind-aware approve/reject)
- MODIFY `packages/cli/src/commands/models.ts` (+ test)

### Integration (MATERIALIZE)

- CREATE `docs/knowledge/decisions/0058-generalize-skill-proposal-into-discriminated-proposal.md`
- MODIFY `docs/knowledge/orchestrator/local-model-lifecycle.md` (or CREATE — Model Proposal concept) + note in AGENTS.md proposal section

## Skeleton

**5a — schema refactor (11 tasks, ~44 min)**

1. Blast-radius confirmation (verification) (~4 min)
2. `types/proposals.ts` generalized schema + migration + tests (~6 min)
3. `types/index.ts` exports (~2 min)
4. `core/store.ts` migration + tests (~5 min)
5. `orchestrator/proposals/gate.ts` migration + tests (~4 min)
6. `orchestrator/proposals/promote.ts` migration + tests (~4 min)
7. `orchestrator/proposals/events.ts` migration + tests (~3 min)
8. `orchestrator/server/routes/v1/proposals.ts` migration + tests (~4 min)
9. `cli` proposals command + emit MCP tool migration + tests (~4 min)
10. `dashboard/Proposals.tsx` migration (~3 min)
11. **[checkpoint:human-verify]** N3 gate (~5 min)

**5b — model lifecycle (7 tasks, ~26 min)**

12. `local-models/proposals/justification.ts` + test (~4 min)
13. `local-models/proposals/engine.ts` + test (F6/F7) (~6 min)
14. `local-models` proposals barrel + index export (~2 min)
15. `orchestrator/proposals/model-handlers.ts` (F11) + test (~5 min)
16. `orchestrator` model renderer + kind-aware approve/reject route + test (~5 min)
17. `cli models` proposals/approve/reject subcommands + test (~4 min)
18. **[checkpoint:human-verify]** F6+F7+F11+N3 gate (~4 min)

**Integration (2 tasks, ~8 min)**

19. ADR 0058 (schema generalization) (~4 min)
20. Knowledge concept doc (Model Proposal) + AGENTS.md note (~4 min)

_Skeleton approved: implicit — task structure is operator-prescribed in the Phase 5 directive (5a discovery→refactor→migrate→gate; 5b justification→engine→schema/handlers→CLI→stale-target). Confirm at plan sign-off._

---

## Standing conventions for every task

- **Build order before typecheck/tests:** after editing an upstream package, run
  `pnpm turbo run build --filter=@harness-engineering/<pkg>...` (the trailing `...` builds dependents). No `pnpm install` — no new workspace deps.
- **Run a single test file:** `pnpm --filter @harness-engineering/<pkg> exec vitest run <relpath>`.
- **`harness validate`** is the final step of every task. **Baseline caveat (from Phase 4 handoff):** the tree currently reports ~391 pre-existing issues (roadmap rows without specs/plans; dashboard/graph design-token warnings) unrelated to this work. Treat as baseline; the gate is **no NEW issue referencing a Phase 5 file**.
- **Commit** at the end of each task with the given message. TDD order: write/adjust test → run (observe fail) → implement → run (observe pass) → validate → commit.

---

## Phase 5a — Schema refactor

### Task 1: Confirm blast radius (verification only)

**Depends on:** none | **Files:** none (produces the consumer inventory) | **Category:** discovery

1. Run and confirm each path exists and still imports the proposal symbols:
   ```bash
   grep -rl "SkillProposalSchema\|ProposalKindSchema\|SkillProposal\b\|ProposalContentSchema\|EmitSkillProposalInput" packages --include="*.ts" | grep -vE "node_modules|dist"
   grep -rn "\.kind\b" packages/core/src/proposals packages/orchestrator/src/proposals packages/orchestrator/src/server/routes/v1/proposals.ts packages/cli/src/commands/proposals.ts packages/cli/src/mcp/tools/skill-proposal.ts packages/dashboard/src/client/pages/Proposals.tsx packages/orchestrator/src/notifications/envelope.ts
   ```
2. Confirm the authoritative consumer set (each migrated in Tasks 4–10):
   - **SOURCE (read `.kind`/`kind` field, must move to `skillKind` or narrow on outer `kind`):** `packages/core/src/proposals/store.ts`; `packages/orchestrator/src/proposals/{gate.ts,promote.ts,events.ts}`; `packages/orchestrator/src/server/routes/v1/proposals.ts`; `packages/cli/src/commands/proposals.ts`; `packages/dashboard/src/client/pages/Proposals.tsx`.
   - **SOURCE (emit input; `kind` = skill-kind, stays via `ProposalKindSchema` alias, no runtime change):** `packages/cli/src/mcp/tools/skill-proposal.ts`.
   - **ENVELOPE consumer (reads event `data.kind`; unchanged because event payload keeps `kind = skillKind`):** `packages/orchestrator/src/notifications/envelope.ts` — **do NOT edit**; Task 7 preserves its contract.
   - **TESTS with `.kind` assertions / fixtures (mechanical edits only):** `packages/types/tests/proposals.test.ts` (unchanged — verified), `packages/core/tests/proposals/store.test.ts` (`.kind`→`.skillKind` at lines ~53,144; immutable-guard patch), `packages/orchestrator/tests/proposals/{gate,promote,events}.test.ts` (fixtures → new shape; events assert `kind:'new-skill'` stays), `packages/cli/tests/{commands/proposals,mcp/tools/skill-proposal}.test.ts`, `packages/orchestrator/src/server/routes/v1/proposals.test.ts`.
3. No file change, no commit. Record the inventory in the execution session notes and proceed.

### Task 2: Generalize `packages/types/src/proposals.ts`

**Depends on:** Task 1 | **Files:** `packages/types/src/proposals.ts`, `packages/types/tests/proposals.test.ts`
**Skills:** `ts-zod-integration` (apply), `ts-type-guards` (reference)

1. In `proposals.test.ts`, **ADD** (do not modify existing cases) a new describe block:

   ```ts
   import {
     ProposalSchema,
     ProposalTypeSchema,
     SkillKindSchema,
     migrateProposalRecord,
     ModelProposalContentSchema,
   } from '../src/proposals';

   describe('read-migration (legacy → discriminated)', () => {
     it('migrates a legacy top-level kind into { kind:"skill", skillKind }', () => {
       const migrated = migrateProposalRecord({ ...VALID_NEW_SKILL }) as Record<string, unknown>;
       expect(migrated['kind']).toBe('skill');
       expect(migrated['skillKind']).toBe('new-skill');
       expect(ProposalSchema.safeParse(VALID_NEW_SKILL).success).toBe(true); // legacy round-trips
     });
     it('leaves an already-generalized skill record untouched', () => {
       const modern = { ...VALID_REFINEMENT, kind: 'skill', skillKind: 'refinement' as const };
       expect(ProposalSchema.safeParse(modern).success).toBe(true);
     });
     it('accepts a model proposal via the union', () => {
       const model = {
         id: 'proposal_m1',
         createdAt: '2026-07-07T00:00:00.000Z',
         kind: 'model' as const,
         proposedBy: 'orchestrator:lmlm',
         status: 'open' as const,
         source: { justification: 'A newer model beats the current pool member by a wide margin.' },
         model: {
           action: 'swap' as const,
           target: { hfRepoId: 'Qwen/Qwen3-32B-GGUF', ollamaName: 'qwen3:32b' },
           replaces: { ollamaName: 'qwen2.5:32b' },
           scoreDelta: 7.4,
           justification: {
             summary: 's',
             benchmarkBasis: ['LiveBench 78 vs 71'],
             hardwareFit: '27GB',
             evidence: 'direct',
             freshness: '2026-05-21',
           },
           diskImpactGb: 3.2,
         },
       };
       expect(ProposalSchema.safeParse(model).success).toBe(true);
       expect(ModelProposalContentSchema.safeParse(model.model).success).toBe(true);
     });
   });
   describe('ProposalTypeSchema', () => {
     it('is the outer discriminator', () => {
       expect(ProposalTypeSchema.safeParse('skill').success).toBe(true);
       expect(ProposalTypeSchema.safeParse('model').success).toBe(true);
       expect(ProposalTypeSchema.safeParse('new-skill').success).toBe(false);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/types exec vitest run tests/proposals.test.ts` — observe failures (symbols undefined).
3. Rewrite `proposals.ts`. Keep `SkillProvenanceSchema`, `ProposalStatusSchema`, `ProposalGateFinding/Gate/Decision`, `ProposalContentSchema`, `ProposalSourceSchema`, `EmitSkillProposalInputSchema`, `EditProposalInputSchema` as-is. Replace the `ProposalKindSchema` + `SkillProposalSchema` region with:

   ```ts
   // Skill-change enum (renamed from ProposalKindSchema). Alias retained below.
   export const SkillKindSchema = z.enum(['new-skill', 'refinement']);
   export type SkillKind = z.infer<typeof SkillKindSchema>;

   /** @deprecated back-compat alias; identical to SkillKindSchema. */
   export const ProposalKindSchema = SkillKindSchema;
   export type ProposalKind = SkillKind;

   // Outer discriminator.
   export const ProposalTypeSchema = z.enum(['skill', 'model']);
   export type ProposalType = z.infer<typeof ProposalTypeSchema>;

   // ── Skill variant (plain object; cross-field refine applied at the union) ──
   const SkillProposalObject = z.object({
     kind: z.literal('skill'),
     skillKind: SkillKindSchema,
     id: z.string().min(1),
     createdAt: z.string().datetime(),
     targetSkill: z.string().optional(),
     proposedBy: z.string().min(1),
     source: ProposalSourceSchema,
     content: ProposalContentSchema,
     status: ProposalStatusSchema,
     gate: ProposalGateSchema.optional(),
     decision: ProposalDecisionSchema.optional(),
   });

   function skillProposalRefine(
     val: z.infer<typeof SkillProposalObject>,
     ctx: z.RefinementCtx
   ): void {
     if (val.skillKind === 'new-skill') {
       if (!val.content.skillYaml || !val.content.skillMd)
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['content'],
           message: 'new-skill proposals require skillYaml and skillMd',
         });
       if (val.targetSkill)
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['targetSkill'],
           message: 'targetSkill is forbidden on new-skill proposals',
         });
       if (val.content.diff)
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['content', 'diff'],
           message: 'diff is forbidden on new-skill proposals',
         });
     } else {
       if (!val.targetSkill)
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['targetSkill'],
           message: 'refinement proposals require targetSkill',
         });
       if (!val.content.diff)
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['content', 'diff'],
           message: 'refinement proposals require a unified diff',
         });
       if (val.content.skillYaml || val.content.skillMd)
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['content'],
           message: 'skillYaml/skillMd are forbidden on refinement proposals (use diff)',
         });
     }
   }

   // ── Model variant ──
   export const ModelProposalActionSchema = z.enum(['add', 'swap', 'evict']);
   export type ModelProposalAction = z.infer<typeof ModelProposalActionSchema>;

   /** Status enum for model proposals: base lifecycle + stale-target terminal (D13/F11). */
   export const ModelProposalStatusSchema = z.enum([
     'open',
     'gate-running',
     'gate-failed',
     'approved',
     'rejected',
     'failed_target_missing',
   ]);
   export type ModelProposalStatus = z.infer<typeof ModelProposalStatusSchema>;

   export const ModelProposalContentSchema = z
     .object({
       action: ModelProposalActionSchema,
       target: z.object({ hfRepoId: z.string().min(1), ollamaName: z.string().min(1) }),
       replaces: z.object({ ollamaName: z.string().min(1) }).optional(),
       scoreDelta: z.number(),
       justification: z.object({
         summary: z.string(),
         benchmarkBasis: z.array(z.string()),
         hardwareFit: z.string(),
         evidence: z.string(),
         freshness: z.string(),
       }),
       diskImpactGb: z.number(),
     })
     .strict();
   export type ModelProposalContent = z.infer<typeof ModelProposalContentSchema>;

   const ModelProposalObject = z.object({
     kind: z.literal('model'),
     id: z.string().min(1),
     createdAt: z.string().datetime(),
     proposedBy: z.string().min(1),
     source: ProposalSourceSchema,
     model: ModelProposalContentSchema,
     status: ModelProposalStatusSchema,
     decision: ProposalDecisionSchema.optional(),
   });

   export type SkillProposal = z.infer<typeof SkillProposalObject>;
   export type ModelProposalRecord = z.infer<typeof ModelProposalObject>;

   // ── Read-migration: legacy records lack the outer `kind`; the old `kind`
   //    held the skill-change value. Map to { kind:'skill', skillKind:<old> }. ──
   export function migrateProposalRecord(raw: unknown): unknown {
     if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
       const r = raw as Record<string, unknown>;
       if (r['kind'] === 'new-skill' || r['kind'] === 'refinement') {
         const { kind, ...rest } = r;
         return { ...rest, kind: 'skill', skillKind: kind };
       }
     }
     return raw;
   }

   const ProposalObjectUnion = z.discriminatedUnion('kind', [
     SkillProposalObject,
     ModelProposalObject,
   ]);
   export type Proposal = z.infer<typeof ProposalObjectUnion>;

   /** Full proposal schema. Accepts legacy + generalized records; runs skill cross-field checks. */
   export const ProposalSchema = z.preprocess(
     migrateProposalRecord,
     ProposalObjectUnion.superRefine((val, ctx) => {
       if (val.kind === 'skill') skillProposalRefine(val, ctx);
     })
   );

   /** Skill-only schema (retained name). Accepts legacy + generalized skill records. */
   export const SkillProposalSchema = z.preprocess(
     migrateProposalRecord,
     SkillProposalObject.superRefine(skillProposalRefine)
   );
   ```

   Leave `EmitSkillProposalInputSchema` using `kind: ProposalKindSchema` (now the alias) — the emit path stays skill-only and unchanged.

4. Run the test file — observe pass (including the untouched legacy cases).
5. `pnpm turbo run build --filter=@harness-engineering/types` && `pnpm --filter @harness-engineering/types typecheck`.
6. `harness validate`.
7. Commit: `feat(types): generalize SkillProposalSchema into discriminated ProposalSchema (D11)`

### Task 3: Export new proposal symbols from `types/src/index.ts`

**Depends on:** Task 2 | **Files:** `packages/types/src/index.ts`

1. In the value-export block from `./proposals`, add: `ProposalSchema`, `ProposalTypeSchema`, `SkillKindSchema`, `ModelProposalActionSchema`, `ModelProposalStatusSchema`, `ModelProposalContentSchema`, `migrateProposalRecord`. Keep `SkillProposalSchema`, `ProposalKindSchema`, `EmitSkillProposalInputSchema`, `EditProposalInputSchema`.
2. In the `export type { … } from './proposals'` block, add: `Proposal`, `ProposalType`, `SkillKind`, `ModelProposalAction`, `ModelProposalStatus`, `ModelProposalContent`, `ModelProposalRecord`. Keep `ProposalKind`, `SkillProposal`.
3. `pnpm turbo run build --filter=@harness-engineering/types` && `pnpm --filter @harness-engineering/types typecheck`.
4. `harness validate`.
5. Commit: `feat(types): export generalized Proposal + model-proposal symbols`

### Task 4: Migrate `core/proposals/store.ts` to the union type

**Depends on:** Task 3 | **Files:** `packages/core/src/proposals/store.ts`, `packages/core/src/proposals/index.ts`, `packages/core/tests/proposals/store.test.ts`
**Skills:** `ts-type-guards` (reference)

1. Adjust `store.test.ts` (mechanical): change `expect(p.kind).toBe('new-skill')` → `expect(p.skillKind).toBe('new-skill')` (line ~53); in the immutable-guard test change the `@ts-expect-error kind: 'refinement'` patch to `skillKind: 'refinement'` and `expect(updated.kind).toBe('new-skill')` → `expect(updated.skillKind).toBe('new-skill')` (line ~144). Fixtures that build records with `kind:'new-skill'` for `createProposal` inputs stay (they are `EmitSkillProposalInput`, whose `kind` is still the skill-kind alias).
2. Edit `store.ts`:
   - Imports: `import { ProposalSchema, SkillProposalSchema, EmitSkillProposalInputSchema, type Proposal, type SkillProposal, type EmitSkillProposalInput, type ProposalStatus, type ProposalType } from '@harness-engineering/types';`
   - `createProposal` (still skill-only): build the generalized shape —
     ```ts
     const proposal = SkillProposalSchema.parse({
       id,
       createdAt: new Date().toISOString(),
       kind: 'skill',
       skillKind: validated.kind,
       targetSkill: validated.targetSkill,
       proposedBy: validated.proposedBy,
       source: {
         sessionId: validated.sessionId,
         taskId: validated.taskId,
         justification: validated.justification,
       },
       content: validated.content,
       status: 'open',
     }) as SkillProposal;
     ```
     Change the clash check `p.kind === 'refinement'` → `p.skillKind === 'refinement'` and guard the list with a skill narrow: `existing.filter((p): p is SkillProposal => p.kind === 'skill')`.
   - `getProposal`: return `Promise<Proposal | null>`; parse via `ProposalSchema.safeParse(JSON.parse(raw))`.
   - `listProposals`: return `Promise<Proposal[]>`; add `kind?: ProposalType` to `ListProposalsOptions` and filter `if (opts.kind && proposal.kind !== opts.kind) continue;`.
   - `updateProposal`: return `Promise<Proposal>`; parse via `ProposalSchema`; pin immutables per-kind:
     ```ts
     const base = {
       ...current,
       ...patch,
       id: current.id,
       createdAt: current.createdAt,
       kind: current.kind,
     };
     const next = ProposalSchema.parse(
       current.kind === 'skill'
         ? { ...base, skillKind: (current as SkillProposal).skillKind }
         : base
     ) as Proposal;
     ```
3. In `core/src/proposals/index.ts`, re-export the new types so downstream keeps importing from core: add `Proposal`, `ModelProposalRecord`, `ModelProposalContent`, `SkillKind`, `ProposalType` to the type re-export (and value `ProposalSchema` if index re-exports values).
4. `pnpm --filter @harness-engineering/core exec vitest run tests/proposals/store.test.ts` — observe pass.
5. `pnpm turbo run build --filter=@harness-engineering/core` && `pnpm --filter @harness-engineering/core typecheck`.
6. `harness validate`.
7. Commit: `refactor(core): proposal store returns discriminated Proposal union`

### Task 5: Migrate `orchestrator/proposals/gate.ts`

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/proposals/gate.ts`, `packages/orchestrator/tests/proposals/gate.test.ts`

1. In `gate.test.ts`, change fixtures `kind: 'new-skill' as const` / `kind: 'refinement' as const` → `kind: 'skill' as const, skillKind: 'new-skill'` (resp. `'refinement'`).
2. In `gate.ts`:
   - Import `type Proposal, type SkillProposal` from `@harness-engineering/core`.
   - `runGate`: after `getProposal`, guard `if (proposal.kind !== 'skill') throw new GateRunError(\`gate applies to skill proposals only (got ${proposal.kind})\`);`then narrow to`SkillProposal`.
   - `deriveFindings(proposal: SkillProposal)`: change `proposal.kind === 'new-skill'` → `proposal.skillKind === 'new-skill'` and the `else if (proposal.kind === 'refinement')` → `else if (proposal.skillKind === 'refinement')`.
   - `GateResult.status` typed `SkillProposal['status']` stays valid.
3. `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/proposals/gate.test.ts` — pass.
4. `pnpm turbo run build --filter=@harness-engineering/orchestrator` && `pnpm --filter @harness-engineering/orchestrator typecheck` (may run after Task 8; ok to defer full typecheck, but build+file test must pass).
5. `harness validate`.
6. Commit: `refactor(orchestrator): gate narrows to skill proposals via skillKind`

### Task 6: Migrate `orchestrator/proposals/promote.ts`

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/proposals/promote.ts`, `packages/orchestrator/tests/proposals/promote.test.ts`

1. In `promote.test.ts`, migrate fixtures to `kind:'skill', skillKind:'new-skill'|'refinement'` shape as in Task 5.
2. In `promote.ts`:
   - `assertGateReady(proposal: SkillProposal)` unchanged logic.
   - `promote`: after `getProposal`, `if (proposal.kind !== 'skill') throw new PromotionError('only skill proposals are promotable to the catalog');` narrow to `SkillProposal`.
   - Change `proposal.kind === 'new-skill'` → `proposal.skillKind === 'new-skill'` in the branch selecting `promoteNewSkill` vs `promoteRefinement`.
3. `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/proposals/promote.test.ts` — pass.
4. `harness validate`.
5. Commit: `refactor(orchestrator): promote narrows to skill proposals via skillKind`

### Task 7: Migrate `orchestrator/proposals/events.ts` (preserve envelope contract)

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/proposals/events.ts`, `packages/orchestrator/tests/proposals/events.test.ts`

1. In `events.test.ts`, migrate the `buildProposal` fixture default to `kind: 'skill', skillKind: 'new-skill'`, and the refinement override to `{ kind: 'skill', skillKind: 'refinement', targetSkill: 'existing-skill', … }`. **Leave assertions `kind: 'new-skill'` unchanged** — the event payload keeps `kind = skillKind`.
2. In `events.ts`:
   - Import `type SkillProposal, type SkillKind` from `@harness-engineering/core`.
   - Change the three data interfaces' `kind: SkillProposal['kind']` → `kind: SkillKind` (so the event's `kind` remains `'new-skill' | 'refinement'`).
   - In each emitter, set `kind: proposal.skillKind` (was `proposal.kind`). Signatures keep `proposal: SkillProposal`.
   - **Do not touch** `packages/orchestrator/src/notifications/envelope.ts` — its `kind?: 'new-skill' | 'refinement'` contract is satisfied unchanged.
3. `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/proposals/events.test.ts` — pass. Also run `src/notifications/envelope.test.ts` to confirm the envelope is unaffected.
4. `harness validate`.
5. Commit: `refactor(orchestrator): proposal events carry skillKind under stable event field`

### Task 8: Migrate `orchestrator/server/routes/v1/proposals.ts`

**Depends on:** Task 4, Task 5, Task 6, Task 7 | **Files:** `packages/orchestrator/src/server/routes/v1/proposals.ts`, `packages/orchestrator/src/server/routes/v1/proposals.test.ts`

1. In `proposals.test.ts`, migrate any inline proposal fixture (line ~54 `kind: 'new-skill'`) to `kind:'skill', skillKind:'new-skill'`.
2. In `proposals.ts`:
   - Import `type Proposal, type SkillProposal` from `@harness-engineering/types`.
   - `handleReject`: type the result `const updated: Proposal = …`; guard the event emit `if (updated.kind === 'skill') emitProposalRejected(deps.bus, updated);`.
   - `handleApprove`: after `getProposal`, `if (proposal && proposal.kind === 'skill') emitProposalApproved(deps.bus, proposal);` (leave the `promote` call; `promote` already guards non-skill).
   - `handleEdit`: after fetching `existing`, guard `if (existing.kind !== 'skill') { sendJSON(res, 422, { error: 'edit applies to skill proposals only' }); return; }` then use `existing.content` as before.
   - Note: kind-aware model approve/reject dispatch is added in **Task 16** (5b); this task only makes the skill path union-safe.
3. `pnpm --filter @harness-engineering/orchestrator exec vitest run src/server/routes/v1/proposals.test.ts` — pass.
4. `pnpm turbo run build --filter=@harness-engineering/orchestrator` && `pnpm --filter @harness-engineering/orchestrator typecheck` — clean.
5. `harness validate`.
6. Commit: `refactor(orchestrator): v1 proposals route handles discriminated union (skill path)`

### Task 9: Migrate CLI proposals command + emit MCP tool

**Depends on:** Task 4 | **Files:** `packages/cli/src/commands/proposals.ts`, `packages/cli/src/mcp/tools/skill-proposal.ts`, `packages/cli/tests/commands/proposals.test.ts`, `packages/cli/tests/mcp/tools/skill-proposal.test.ts`

1. Tests: in `proposals.test.ts` keep the `toMatchObject({ kind: 'new-skill' })` assertion (summary keeps a `kind` field = skillKind); migrate any object fixture that is a stored proposal to the new shape. In `skill-proposal.test.ts` change `expect(stored.kind).toBe('new-skill')` → `expect(stored.skillKind).toBe('new-skill')` (lines ~68,116); the emit input `kind: 'new-skill'` stays.
2. `commands/proposals.ts`:
   - Import `type Proposal, type SkillProposal` from `@harness-engineering/core`.
   - `summarizeProposal(p: Proposal)`: return `kind` = `p.kind === 'skill' ? p.skillKind : p.kind` (keeps `'new-skill'` for skill rows), plus `name: p.kind === 'skill' ? p.content.name : p.model.target.ollamaName`, `targetSkill: p.kind === 'skill' ? p.targetSkill : undefined`, and gate fields guarded by `p.kind === 'skill'`.
   - `runProposalsShow`/`runProposalsList` return the union; keep `harness proposals` scoped to skill by passing `{ kind: 'skill' }` to `listProposals` (so the skill queue view is unchanged).
3. `skill-proposal.ts` (MCP tool): **no runtime change** — it emits `kind: input.kind` into `createProposal` whose `EmitSkillProposalInput.kind` is the retained alias. Confirm typecheck only.
4. `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/proposals.test.ts tests/mcp/tools/skill-proposal.test.ts` — pass.
5. `pnpm turbo run build --filter=@harness-engineering/cli` && `pnpm --filter @harness-engineering/cli typecheck` — clean.
6. `harness validate`.
7. Commit: `refactor(cli): proposals command consumes discriminated Proposal union`

### Task 10: Migrate dashboard `Proposals.tsx`

**Depends on:** Task 4 | **Files:** `packages/dashboard/src/client/pages/Proposals.tsx`

1. Import `type Proposal, type SkillProposal` from `@harness-engineering/types`.
2. `Proposals()` fetch result is `Proposal[]`; filter to skill for this panel: `setProposals(((await res.json()) as Proposal[]).filter((p): p is SkillProposal => p.kind === 'skill'))`. Type `proposals` state as `SkillProposal[]`.
3. In `ProposalCard`, replace every `proposal.kind === 'new-skill'` / `=== 'refinement'` with `proposal.skillKind === …` (occurrences at the edit-content init, header glyph, SKILL.md-vs-diff label, yaml block, saveEdit).
4. Run dashboard component tests: `pnpm --filter @harness-engineering/dashboard exec vitest run` (Proposals-related suites) — pass.
5. `pnpm turbo run build --filter=@harness-engineering/dashboard` && `pnpm --filter @harness-engineering/dashboard typecheck` — clean.
6. `harness validate`.
7. Commit: `refactor(dashboard): skill proposals panel narrows discriminated union`

### Task 11: N3 gate — full suite green + legacy round-trip proof [checkpoint:human-verify]

**Depends on:** Task 2–Task 10 | **Files:** none (verification) + optional golden fixture

1. Run the **entire pre-existing proposal test surface**:
   ```bash
   pnpm --filter @harness-engineering/types exec vitest run tests/proposals.test.ts
   pnpm --filter @harness-engineering/core exec vitest run tests/proposals
   pnpm --filter @harness-engineering/orchestrator exec vitest run tests/proposals src/server/routes/v1/proposals.test.ts src/notifications/envelope.test.ts
   pnpm --filter @harness-engineering/cli exec vitest run tests/commands/proposals.test.ts tests/mcp/tools/skill-proposal.test.ts
   pnpm --filter @harness-engineering/dashboard exec vitest run
   ```
   All green. Confirm `types/tests/proposals.test.ts` diff is **empty** (byte-unchanged) — the N3 anchor.
2. Confirm a legacy on-disk record round-trips: write `{ "id":"proposal_legacy","createdAt":"2026-05-01T00:00:00.000Z","kind":"new-skill","proposedBy":"x","source":{"justification":"20+ character justification string here."},"content":{"name":"legacy-skill","description":"A twenty-plus character description string.","skillYaml":"name: legacy-skill\n","skillMd":"# Legacy\n"},"status":"open" }` into a temp `.harness/proposals/` dir and assert `getProposal` returns `kind:'skill', skillKind:'new-skill'`. (If not already covered by the store test, add this as a golden case in `core/tests/proposals/store.test.ts` and commit it.)
3. **[checkpoint:human-verify]** Present to the operator: (a) the N3-anchor test is byte-unchanged and green; (b) the list of consumer tests that received mechanical `.kind`→`.skillKind` edits; (c) confirm the ASSUMPTION interpretation of N3 (see Uncertainties) is acceptable. **Do not proceed to 5b until confirmed.**
4. `harness validate`.
5. Commit (only if the golden case was added): `test(core): golden legacy-record read-migration round-trip (N3)`

---

## Phase 5b — Model proposal lifecycle

> Starts only after Task 11 is confirmed green and the N3 interpretation is signed off.

### Task 12: `local-models/proposals/justification.ts`

**Depends on:** Task 11 | **Files:** `packages/local-models/src/proposals/justification.ts`, `packages/local-models/src/proposals/justification.test.ts`

1. Write `justification.test.ts`:
   ```ts
   import { describe, it, expect } from 'vitest';
   import { buildJustification } from './justification.js';
   import type { RankedModel } from '../ranker/types.js';
   const target = {
     hfRepoId: 'Qwen/Qwen3-32B-GGUF',
     ollamaName: 'qwen3:32b',
     estimatedVramGb: 27,
     score: 82,
     evidence: 'direct',
     benchmarkSnapshot: '2026-05-21',
     fitsHardware: true,
   } as unknown as RankedModel;
   describe('buildJustification', () => {
     it('renders a swap rationale with benchmark basis + hardware fit', () => {
       const j = buildJustification({ target, currentScore: 71.4, vramGb: 32 });
       expect(j.summary).toMatch(/qwen3:32b/);
       expect(j.benchmarkBasis[0]).toMatch(/82.*71\.4|71\.4.*82/);
       expect(j.hardwareFit).toMatch(/27.*32/);
       expect(j.evidence).toBe('direct');
       expect(j.freshness).toMatch(/2026-05-21/);
     });
   });
   ```
2. Run — fail. Implement `buildJustification(args: { target: RankedModel; currentScore?: number; vramGb: number }): ModelProposalContent['justification']` importing `type { ModelProposalContent } from '@harness-engineering/types'`. Return `{ summary, benchmarkBasis, hardwareFit: \`${target.estimatedVramGb}GB VRAM est; you have ${vramGb}GB\`, evidence: String(target.evidence), freshness: \`Benchmark snapshot ${target.benchmarkSnapshot}\` }`.
3. Run — pass.
4. `pnpm turbo run build --filter=@harness-engineering/local-models` && `pnpm --filter @harness-engineering/local-models typecheck`.
5. `harness validate`.
6. Commit: `feat(local-models): render model-proposal justification from RankedModel`

### Task 13: `local-models/proposals/engine.ts` (F6, F7)

**Depends on:** Task 12 | **Files:** `packages/local-models/src/proposals/engine.ts`, `packages/local-models/src/proposals/engine.test.ts`
**Skills:** `ts-type-guards` (reference)

1. Write `engine.test.ts` covering:
   - **F6:** a pool with 2 entries and a ranking where each entry has a viable beat → **exactly one** proposal per entry (≤1 per pool entry); ties/below-threshold → none.
   - Threshold: candidate beating by `< proposalThreshold` → no proposal.
   - **F7:** a `(target.ollamaName, replaces.ollamaName)` pair present in `rejected` input → not emitted; same pair in `pending` → not re-emitted.
   - `fitsHardware === false` candidates are never proposed.
2. Run — fail. Implement:

   ```ts
   import type { PoolState, PoolEntry } from '../pool/types.js';
   import type { RankedModel } from '../ranker/types.js';
   import type { ModelProposalContent } from '@harness-engineering/types';
   import { buildJustification } from './justification.js';

   export interface DiffInput {
     pool: PoolState;
     ranked: RankedModel[];
     proposalThreshold: number;
     vramGb: number;
     pending?: ReadonlyArray<{ target: string; replaces?: string }>;
     rejected?: ReadonlyArray<{ target: string; replaces?: string }>;
   }
   export function diffPoolAgainstRanking(input: DiffInput): ModelProposalContent[] {
     /* … */
   }
   ```

   Logic: build a `Set` of pool `ollamaName`s. For each pool entry (sorted deterministically), scan `ranked` (fits hardware, not already pooled) for the highest-score candidate whose `score - entry.currentScore >= proposalThreshold`; take the single best → candidate swap. Build the pair key `(candidate.ollamaName, entry.ollamaName)`; skip if in `pending` or `rejected`. Emit one `ModelProposalContent` with `action:'swap'`, `target`, `replaces:{ ollamaName: entry.ollamaName }`, `scoreDelta`, `diskImpactGb` (estimate or 0 placeholder — real disk math is Phase 3/6), `justification: buildJustification({ target: candidate, currentScore: entry.currentScore, vramGb })`. **At most one per entry** (F6).

3. Run — pass.
4. Build + typecheck local-models.
5. `harness validate`.
6. Commit: `feat(local-models): pool-vs-ranking diff engine with pending/rejected dedup (F6,F7)`

### Task 14: `local-models` proposals barrel + package export

**Depends on:** Task 13 | **Files:** `packages/local-models/src/proposals/index.ts`, `packages/local-models/src/index.ts`

1. Create `proposals/index.ts`:
   ```ts
   export { buildJustification } from './justification.js';
   export { diffPoolAgainstRanking } from './engine.js';
   export type { DiffInput } from './engine.js';
   ```
2. In `src/index.ts`, add `export * from './proposals/index.js';` after the other module re-exports.
3. Build + typecheck local-models; confirm the barrel smoke test (if present) still passes: `pnpm --filter @harness-engineering/local-models exec vitest run`.
4. `harness validate`.
5. Commit: `feat(local-models): export proposals engine from package barrel`

### Task 15: `orchestrator/proposals/model-handlers.ts` (F11 stale-target)

**Depends on:** Task 14 | **Files:** `packages/orchestrator/src/proposals/model-handlers.ts`, `packages/orchestrator/tests/proposals/model-handlers.test.ts`
**Skills:** `gof-chain-of-responsibility` (reference)

1. Write `model-handlers.test.ts` with fakes (fake `InstallAdapter`, fake `PoolManager` exposing `snapshot()`/`install()`/`evict()`, fake store update fn, `EventEmitter` bus):
   - **F11:** installer returns `{ status:'error', code:'failed_target_missing' }` → `onApproveModelProposal` sets proposal `status:'failed_target_missing'`, emits `local-models:proposal` on the bus, **PoolManager.install NOT applied / snapshot unchanged**, returns a failed result.
   - Success path: installer `{ status:'success' }` → pool updated (install/evict per `action`), `local-models:pool` emitted, status → `approved`.
   - Budget/allowlist rejection surfaces a structured error, pool unchanged.
   - `onRejectModelProposal` → status `rejected` + decision recorded (so the engine's `rejected` input picks it up — F7 linkage).
2. Run — fail. Implement `onApproveModelProposal(deps, proposal: ModelProposalRecord)` and `onRejectModelProposal(deps, proposal, reason)` where `deps` carries `{ installer, pool: PoolManager, updateProposal, bus }`. Map installer `failed_target_missing` → `updateProposal(id, { status: 'failed_target_missing' })` + `bus.emit('local-models:proposal', …)`; leave pool untouched (D13). On success apply `pool.install`/`pool.evict` by `proposal.model.action`, emit `local-models:pool`, set `approved`.
3. Run — pass.
4. Build + typecheck orchestrator.
5. `harness validate`.
6. Commit: `feat(orchestrator): model-proposal approve/reject handlers with stale-target cancellation (D13,F11)`

### Task 16: Register model renderer + kind-aware approve/reject route

**Depends on:** Task 15 | **Files:** `packages/orchestrator/src/proposals/model-renderer.ts`, `packages/orchestrator/src/proposals/index.ts`, `packages/orchestrator/src/server/routes/v1/proposals.ts`, `packages/orchestrator/src/server/routes/v1/proposals.test.ts`
**Skills:** `gof-visitor-pattern` (reference)

1. Create `model-renderer.ts`: `renderModelProposal(p: ModelProposalRecord): { title: string; body: string }` turning `p.model.justification` into the queue display format (mirrors the skill renderer's shape used by notifications/dashboard).
2. Export renderer + handlers from `proposals/index.ts`.
3. Extend `routes/v1/proposals.ts` approve/reject dispatch to be kind-aware: in `handleApprove`, after fetching, `if (proposal.kind === 'model') { await onApproveModelProposal(modelDeps, proposal); … return; }` else keep the skill `promote` path. Same for `handleReject`. Wire `modelDeps` (installer + PoolManager + bus) through `Deps` (optional; when absent, model approve returns `501 model handlers not configured`).
4. Add route tests: approving a `kind:'model'` proposal whose fake installer 404s → response reflects `failed_target_missing`, pool snapshot unchanged; rejecting records the decision.
5. Run the route test file — pass. Also re-run skill route tests (unchanged behavior).
6. Build + typecheck orchestrator.
7. `harness validate`.
8. Commit: `feat(orchestrator): kind-aware proposal approve/reject dispatch + model renderer`

### Task 17: CLI `harness models {proposals,approve,reject}`

**Depends on:** Task 16 | **Files:** `packages/cli/src/commands/models.ts`, `packages/cli/tests/commands/models.test.ts`

1. Write/extend `models.test.ts`: `runModelsProposals()` lists via core store filtered `{ kind: 'model' }`; `runModelsReject(id, reason)` calls core `updateProposal` → `status:'rejected'` + decision (F7 feeder); `runModelsApprove(id)` POSTs `/api/v1/proposals/:id/approve` (assert URL + bearer handling, mirroring the existing skill approve). Confirm **no** `@harness-engineering/local-models` import is added.
2. Run — fail. Implement three subcommands under the existing `createModelsCommand()` group (alongside `probe`): `proposals` (list JSON), `approve <id>` (HTTP, requires `HARNESS_ADMIN_TOKEN`), `reject <id> --reason <text>` (core store). Import `listProposals`, `updateProposal` and `type Proposal` from `@harness-engineering/core`.
3. Run — pass.
4. `pnpm turbo run build --filter=@harness-engineering/cli` && `pnpm --filter @harness-engineering/cli typecheck`. Regenerate command registry only if required: `pnpm --filter @harness-engineering/cli exec vitest run` (registry snapshot) — the subcommands live under the already-registered `models` group, so `_registry.ts` needs no new entry.
5. `harness validate`.
6. Commit: `feat(cli): add models proposals/approve/reject subcommands`

### Task 18: 5b gate — F6 + F7 + F11 + N3 [checkpoint:human-verify]

**Depends on:** Task 12–Task 17 | **Files:** none (verification)

1. Run the model-lifecycle suites: `pnpm --filter @harness-engineering/local-models exec vitest run src/proposals` and `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/proposals src/server/routes/v1/proposals.test.ts`.
2. Re-run the full N3 surface from Task 11 to confirm 5b did not regress the skill flow.
3. **[checkpoint:human-verify]** Present: F6 (≤1 per entry) test output, F7 (rejected/pending dedup) test output, F11 (stale-target: status set, pool unchanged, event emitted) test output, and N3 still green. Confirm before integration tasks.
4. `harness validate`. No commit (verification).

---

## Integration (MATERIALIZE tier)

### Task 19: ADR 0058 — schema generalization

**Depends on:** Task 11 | **Files:** `docs/knowledge/decisions/0058-generalize-skill-proposal-into-discriminated-proposal.md` | **Category:** integration

1. Author the ADR (this is spec ADR-NNNN+4). Sections: Context (closed `kind: new-skill|refinement` forced LMLM to duplicate queue infra); Decision (outer `kind: 'skill'|'model'`; rename to `skillKind`; discriminated union over a content union; read-migration defaulting legacy records to `{kind:'skill', skillKind}`); Consequences (backward-compatible reads; unlocks future kinds config/plan-refinement; consumers narrow on outer `kind`); Alternatives rejected (flat widened enum). Cross-link D11 and this plan.
2. `harness validate` (+ `harness check-docs` if available).
3. Commit: `docs(decisions): ADR-0058 generalize SkillProposalSchema into discriminated ProposalSchema`

### Task 20: Knowledge concept — Model Proposal + AGENTS.md note

**Depends on:** Task 18 | **Files:** `docs/knowledge/orchestrator/local-model-lifecycle.md` (CREATE or append the Model Proposal section), `AGENTS.md` | **Category:** integration

1. Document the `business_concept: Model Proposal` — orchestrator-generated add/swap/evict suggestion routed through the hermes-phase-4 queue; lifecycle (diff → propose → approve → install → resolver pickup); stale-target (D13) and dedup (F7) semantics. Note the `ModelProposal flows through SkillProposalQueue` reuse edge.
2. Add a one-line note under the orchestrator/proposals section of `AGENTS.md` that the proposal queue now carries `kind: 'skill' | 'model'`.
3. `harness validate`.
4. Commit: `docs(knowledge): document Model Proposal concept + generalized queue`

---

## Sequencing / Dependency Notes

- **5a critical path:** 1 → 2 → 3 → 4 → {5,6,7,9,10 parallelizable — disjoint files, all depend on 4} → 8 (depends on 5,6,7) → 11.
  - Tasks 5, 6, 7, 9, 10 touch disjoint files and share no state beyond the Task-4 core contract; they can run in parallel waves. Task 8 must follow 5/6/7 (it emits their events). Task 11 gates everything.
- **5b critical path:** 12 → 13 → 14 → 15 → 16 → 17 → 18. Mostly serial (each builds on the prior module).
- **Integration:** 19 may run any time after Task 11; 20 after Task 18.
- **Hard boundary:** no 5b task starts before Task 11 is confirmed (operator sign-off on N3).

## Known-failure check

`.harness/failures.md` is absent (no recorded failures to cross-check). Phase 4 handoff concerns carried forward: (a) `harness validate` is tree-wide red on ~391 pre-existing issues — treat as baseline; (b) `getStatus().configured` reference-sharing nuance is unrelated to Phase 5; (c) heavy pre-commit/pre-push hooks (plugin regen, coverage, format:check) — commit per task, keep staged paths scoped.
