import { z } from 'zod';
import type { BackendDef, RoutingConfig } from '@harness-engineering/types';

/**
 * Reusable schema for the local/pi `model` field — either a non-empty
 * string or a non-empty array of non-empty strings (Spec 1 fallback list).
 *
 * The `errorMap` collapses Zod's default opaque "Invalid input" union
 * failure into an actionable message that names both accepted shapes.
 * Without this, e.g. `model: 0` produces `invalid_union` with two child
 * `invalid_type` issues whose messages don't mention what the user
 * should have written.
 */
const ModelSchema = z.union([z.string().min(1), z.array(z.string().min(1)).nonempty()], {
  errorMap: () => ({
    message: 'model must be a non-empty string or array of strings',
  }),
});

/**
 * Zod schema for `BackendDef` (Spec 2 — multi-backend routing).
 *
 * Discriminated union on `type`. Per-variant validation surfaces shape
 * mismatches (missing `model`, missing `endpoint`, etc.) at config-load
 * time rather than at orchestrator runtime.
 *
 * Used in Phase 3 by `validateWorkflowConfig`; in Phase 1 it is exported
 * for standalone unit testing.
 */
export const BackendDefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mock') }).strict(),
  z
    .object({
      type: z.literal('claude'),
      command: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('anthropic'),
      model: z.string().min(1),
      apiKey: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('openai'),
      model: z.string().min(1),
      apiKey: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('gemini'),
      model: z.string().min(1),
      apiKey: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('local'),
      endpoint: z.string().url(),
      model: ModelSchema,
      apiKey: z.string().optional(),
      timeoutMs: z.number().int().positive().optional(),
      probeIntervalMs: z.number().int().min(1000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('pi'),
      endpoint: z.string().url(),
      model: ModelSchema,
      apiKey: z.string().optional(),
      timeoutMs: z.number().int().positive().optional(),
      probeIntervalMs: z.number().int().min(1000).optional(),
    })
    .strict(),
]);

/**
 * Spec B Phase 0: a routing target is either a backend name (scalar
 * string) or a non-empty ordered fallback chain (string tuple). The
 * scalar form is byte-compatible with pre-Spec-B configs.
 */
export const RoutingValueSchema = z.union([
  z.string().min(1),
  z
    .array(z.string().min(1))
    .nonempty('fallback chain must contain at least one backend name')
    .readonly(),
]);

/**
 * Zod schema for `RoutingConfig`. `.strict()` rejects unknown keys at
 * every level (per Spec 2 D7: typos in routing keys are validation
 * errors, not silent default-fallthroughs).
 *
 * Spec B Phase 0: all scalar routing fields accept `RoutingValueSchema`
 * (scalar or non-empty chain). New optional `skills` and `modes` maps
 * accept the same.
 *
 * Spec B Phase 2: the `isolation` block (added to the TS interface in
 * Hermes Phase 5 but not previously in this Zod schema) is now included
 * here with each tier widened to `RoutingValueSchema`. This closes the
 * Phase 0 I2 review finding (TS-vs-Zod drift) and ensures isolation
 * chain entries are validated by the same cross-field check that
 * covers `skills` / `modes`.
 */
export const RoutingConfigSchema = z
  .object({
    default: RoutingValueSchema,
    'quick-fix': RoutingValueSchema.optional(),
    'guided-change': RoutingValueSchema.optional(),
    'full-exploration': RoutingValueSchema.optional(),
    diagnostic: RoutingValueSchema.optional(),
    intelligence: z
      .object({
        sel: RoutingValueSchema.optional(),
        pesl: RoutingValueSchema.optional(),
      })
      .strict()
      .optional(),
    // --- Spec B Phase 2: isolation block widened to RoutingValueSchema ---
    isolation: z
      .object({
        none: RoutingValueSchema.optional(),
        container: RoutingValueSchema.optional(),
        'remote-sandbox': RoutingValueSchema.optional(),
      })
      .strict()
      .optional(),
    // --- Spec B Phase 0: new optional maps (resolver wired in Phase 1) ---
    skills: z.record(z.string().min(1), RoutingValueSchema).optional(),
    modes: z.record(z.string().min(1), RoutingValueSchema).optional(),
  })
  .strict();

/**
 * split-routing D7: Zod schema for a workflow STEP (a stage in a declared
 * staged workflow). Mirrors the `WorkflowStep` interface (types/workflow.ts:11)
 * — `skill`/`produces` are required and non-empty; the rest are optional. The
 * `routingHint` complexity/risk are typed loosely (`z.any()`) here because the
 * deterministic-hint enums live in intelligence/types and the engine only reads
 * them structurally (execute-workflow.ts:143-146); tightening them is a future
 * follow-up, not a validation contract Phase 4 needs.
 */
export const WorkflowStepSchema = z
  .object({
    skill: z.string().min(1),
    produces: z.string().min(1),
    expects: z.string().min(1).optional(),
    gate: z.enum(['pass-required', 'advisory']).optional(),
    cognitiveMode: z.string().min(1).optional(),
    routingHint: z.object({ complexity: z.any().optional(), risk: z.any().optional() }).optional(),
  })
  .strict();

/**
 * split-routing D7/D13: Zod schema for a `StagedWorkflowDecl` (the operator's
 * declarative producer surface on `WorkflowConfig.workflows`).
 *
 * D13 nuance: `.min(1)` rejects a 0-stage decl AT THE SCHEMA (an empty workflow
 * is a config error). A 1-stage decl is schema-VALID — the `>= 2`-stage opt-in
 * gate lives in `workflowFor` (a 1-stage decl simply falls back to single
 * dispatch), NOT in the schema.
 */
export const StagedWorkflowDeclSchema = z
  .object({
    name: z.string().min(1),
    match: z
      .object({
        identifierPrefix: z.string().min(1).optional(),
        labels: z.array(z.string().min(1)).optional(),
      })
      .strict(),
    // D13: 0-stage is a validation error; 1-stage is valid (single-dispatch fallback).
    stages: z.array(WorkflowStepSchema).min(1, 'a workflow must declare at least 1 stage (D13)'),
    stageDeadlineMs: z.number().int().positive().optional(),
  })
  .strict()
  // 4b: a stage's `expects` must name a `produces` from an EARLIER stage — the
  // text channel can only thread outputs already captured on the shared worktree.
  // Catches label typos / mis-orderings at config-load instead of silently
  // threading nothing at runtime. Mirrors validateBackendsAndRouting: the issue
  // path points at the offending `stages[i].expects`.
  .superRefine((decl, ctx) => {
    const producedByEarlier = new Set<string>();
    decl.stages.forEach((stage, i) => {
      if (stage.expects !== undefined && !producedByEarlier.has(stage.expects)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stages', i, 'expects'],
          message: `stage '${stage.skill}' expects '${stage.expects}', which no earlier stage produces. Produced by earlier stages: [${[...producedByEarlier].join(', ')}].`,
        });
      }
      producedByEarlier.add(stage.produces);
    });
  });

/**
 * Cross-field validator: every value in `routing` must reference a key
 * that exists in `backends`. Run as a `superRefine` so the issue paths
 * land at the offending routing entry, not at the parent object.
 *
 * Phase 1 exposes this as a standalone helper. Phase 3 wires it into
 * the AgentConfig schema's `superRefine` block when Zod validation
 * replaces the hand-rolled `validateWorkflowConfig` checks.
 */
export function validateBackendsAndRouting(
  backends: Record<string, BackendDef> | undefined,
  routing: RoutingConfig | undefined,
  ctx: z.RefinementCtx
): void {
  if (!backends || !routing) return;
  const names = new Set(Object.keys(backends));
  const checkRef = (
    path: (string | number)[],
    value: import('@harness-engineering/types').RoutingValue | undefined
  ): void => {
    if (value === undefined) return;
    const entries = Array.isArray(value) ? value : [value as string];
    entries.forEach((name, idx) => {
      if (names.has(name)) return;
      // For chain entries, append the index so the error pinpoints the
      // offending entry (e.g. routing.skills.foo.1).
      const pathWithIdx = Array.isArray(value) ? [...path, idx] : path;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['routing', ...pathWithIdx],
        message: `routing.${pathWithIdx.join('.')} references unknown backend '${name}'. Defined: [${[...names].join(', ')}].`,
      });
    });
  };
  checkRef(['default'], routing.default);
  checkRef(['quick-fix'], routing['quick-fix']);
  checkRef(['guided-change'], routing['guided-change']);
  checkRef(['full-exploration'], routing['full-exploration']);
  checkRef(['diagnostic'], routing.diagnostic);
  checkRef(['intelligence', 'sel'], routing.intelligence?.sel);
  checkRef(['intelligence', 'pesl'], routing.intelligence?.pesl);
  // --- Spec B Phase 2: validate isolation tier chain entries (closes I2) ---
  checkRef(['isolation', 'none'], routing.isolation?.none);
  checkRef(['isolation', 'container'], routing.isolation?.container);
  checkRef(['isolation', 'remote-sandbox'], routing.isolation?.['remote-sandbox']);
  // --- Spec B Phase 0: validate skills + modes chain entries ---
  if (routing.skills) {
    for (const [skill, value] of Object.entries(routing.skills)) {
      checkRef(['skills', skill], value);
    }
  }
  if (routing.modes) {
    for (const [mode, value] of Object.entries(routing.modes)) {
      checkRef(['modes', mode], value);
    }
  }
}
