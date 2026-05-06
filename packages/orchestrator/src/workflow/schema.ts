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
 * Zod schema for `RoutingConfig`. `.strict()` rejects unknown keys at
 * every level (per Spec 2 D7: typos in routing keys are validation
 * errors, not silent default-fallthroughs).
 */
export const RoutingConfigSchema = z
  .object({
    default: z.string().min(1),
    'quick-fix': z.string().optional(),
    'guided-change': z.string().optional(),
    'full-exploration': z.string().optional(),
    diagnostic: z.string().optional(),
    intelligence: z
      .object({
        sel: z.string().optional(),
        pesl: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

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
  const checkRef = (path: (string | number)[], name: string | undefined): void => {
    if (name !== undefined && !names.has(name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['routing', ...path],
        message: `routing.${path.join('.')} references unknown backend '${name}'. Defined: [${[...names].join(', ')}].`,
      });
    }
  };
  checkRef(['default'], routing.default);
  checkRef(['quick-fix'], routing['quick-fix']);
  checkRef(['guided-change'], routing['guided-change']);
  checkRef(['full-exploration'], routing['full-exploration']);
  checkRef(['diagnostic'], routing.diagnostic);
  checkRef(['intelligence', 'sel'], routing.intelligence?.sel);
  checkRef(['intelligence', 'pesl'], routing.intelligence?.pesl);
}
