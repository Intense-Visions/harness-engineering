import { z } from 'zod';
import type {
  BackendDef,
  RoutingConfig,
  BackendCapabilities,
  RoutingPolicy,
  RoadmapConfig,
  RoadmapAutoTriageConfig,
  McpServerSpec,
} from '@harness-engineering/types';

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
 * MCP server allowlist entry for the ollama backend. `.strict()` so a typo'd
 * field fails at config-load (mirrors BackendCapabilities). Absent ⇒ built-ins only.
 */
const McpServerSpecSchema = z
  .object({
    name: z.string().min(1),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    cwd: z.string().min(1).optional(),
    tools: z.array(z.string()).optional(),
  })
  .strict();

// --- AMR (Adaptive Model Routing) shared enums ---
const CAPABILITY_TIER = z.enum(['fast', 'standard', 'strong']);
const COMPLEXITY_LEVEL = z.enum(['trivial', 'simple', 'moderate', 'complex']);
const PRIVACY_CLASS = z.enum(['on-device', 'pooled-isolated', 'byo-endpoint', 'shared-cloud']);

/**
 * AMR: a backend's capability profile (`BackendCapabilities`). With it, AMR can
 * compare backends and select a capability tier per dispatch; without it the
 * backend is invisible to tier selection (identity/default routing only).
 * `.strict()` so a mistyped or misspelled field fails at config-load
 * rather than being silently dropped. This is the config-file surface the AMR
 * types + engine expected but the schema never exposed.
 */
export const BackendCapabilitiesSchema = z
  .object({
    tier: CAPABILITY_TIER,
    costPer1kTokens: z.number().nonnegative(),
    privacyClass: PRIVACY_CLASS,
    contextWindow: z.number().int().positive(),
    vision: z.boolean().optional(),
    toolUse: z.boolean().optional(),
  })
  .strict();

/**
 * AMR: the canonical `RoutingPolicy` schema — the SINGLE source of validation for
 * the config-file loader (`agent.routing.policy`) AND the `PUT /api/v1/routing/policy`
 * endpoint (which imports this rather than defining its own, so the two can never
 * drift again — the previous route-local copy had a 3-value `privacyFloor` enum,
 * missing `pooled-isolated`). NOT `.strict()`: it tolerates forward-compatible
 * extra fields a control plane (Shuttle) may push. An empty `{}` restores default-off.
 * ASYMMETRY: unlike the strict `capabilities` block, a typo'd policy field in a
 * config file (a misspelled policy key) is silently ignored, not rejected —
 * the forward-compat cost of sharing one schema with the Shuttle wire.
 */
export const RoutingPolicySchema = z.object({
  complexityTierMatrix: z.record(COMPLEXITY_LEVEL, CAPABILITY_TIER).optional(),
  skillTierOverrides: z.record(z.string(), CAPABILITY_TIER).optional(),
  privacyFloor: PRIVACY_CLASS.optional(),
  budget: z
    .object({
      capUsd: z.number(),
      degradeAtPct: z.number().optional(),
      onBudgetExhausted: z.enum(['degrade', 'pause', 'human']),
    })
    .optional(),
  sensitivePaths: z.array(z.string()).optional(),
  escalationThreshold: z.number().optional(),
  // string[], NOT the finite BackendDef['type'] union: an unknown provider must
  // fail CLOSED at tier selection, not reject the whole policy (Shuttle wire).
  allowedProviders: z.array(z.string()).optional(),
  acceptanceEval: z
    .object({
      enabled: z.boolean(),
      model: z.string().optional(),
    })
    .optional(),
});

// Drift guard: the schema output must be assignable to the canonical type, so a
// wrong field TYPE (e.g. `costPer1kTokens: string`) stops compiling. Field-PRESENCE
// (the bug this fixes — the schema not exposing `capabilities`/`policy` at all) is
// pinned by the config round-trip test in schema.amr-config.test.ts.
const _capsGuard = (c: BackendCapabilities): z.infer<typeof BackendCapabilitiesSchema> => c;
const _policyGuard = (p: RoutingPolicy): z.infer<typeof RoutingPolicySchema> => p;
const _mcpGuard = (s: McpServerSpec): z.infer<typeof McpServerSpecSchema> => s;
void _capsGuard;
void _policyGuard;
void _mcpGuard;

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
  z
    .object({ type: z.literal('mock'), capabilities: BackendCapabilitiesSchema.optional() })
    .strict(),
  z
    .object({
      type: z.literal('claude'),
      command: z.string().optional(),
      capabilities: BackendCapabilitiesSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('anthropic'),
      model: z.string().min(1),
      apiKey: z.string().optional(),
      capabilities: BackendCapabilitiesSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('openai'),
      model: z.string().min(1),
      apiKey: z.string().optional(),
      capabilities: BackendCapabilitiesSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('gemini'),
      model: z.string().min(1),
      apiKey: z.string().optional(),
      capabilities: BackendCapabilitiesSchema.optional(),
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
      capabilities: BackendCapabilitiesSchema.optional(),
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
      capabilities: BackendCapabilitiesSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('ollama'),
      endpoint: z.string().url(),
      model: ModelSchema,
      apiKey: z.string().optional(),
      timeoutMs: z.number().int().positive().optional(),
      maxTurnsPerRun: z.number().int().positive().optional(),
      disableReasoning: z.boolean().optional(),
      numCtx: z.number().int().positive().optional(),
      maxContextTokens: z.number().int().positive().optional(),
      numPredict: z.number().int().positive().optional(),
      keepAlive: z.string().optional(),
      // Sampling controls (native /api/chat `options`). Unset ⇒ Ollama model
      // default (~temp 0.8). Precise agentic coding benefits from lower/tighter
      // sampling — Qwen guidance for thinking-mode coding is temp 0.6 / top_p 0.95 / top_k 20.
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      topK: z.number().int().positive().optional(),
      mcpServers: z.array(McpServerSpecSchema).optional(),
      capabilities: BackendCapabilitiesSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('codex'),
      // The local model Codex drives via `--oss --local-provider`.
      model: ModelSchema,
      localProvider: z.enum(['ollama', 'lmstudio']).optional(),
      command: z.string().optional(),
      timeoutMs: z.number().int().positive().optional(),
      reasoningEffort: z.enum(['none', 'low', 'medium', 'high']).optional(),
      mcpServers: z.array(McpServerSpecSchema).optional(),
      capabilities: BackendCapabilitiesSchema.optional(),
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
    // --- AMR: opt-in adaptive-routing policy. Its PRESENCE flips the orchestrator
    // from identity/default dispatch to complexity-aware tier routing (default-off
    // when absent). Previously accepted by the runtime PUT endpoint only. ---
    policy: RoutingPolicySchema.optional(),
    // local-backend-full-workflow Phase 3 (D5/SC6): routes the LOCAL outcome-eval
    // gate to the primary backend when 'primary'. .strict() below means this MUST
    // be declared here or a config with workflowGates is silently rejected.
    workflowGates: z.enum(['local', 'primary']).optional(),
    // staged-verify-gate-convergence D3: bound on consecutive staged-settle gate
    // failures for a LOCAL unit before escalating to needs-human (default 5 via the
    // module constant when absent). .strict() above means this MUST be declared here
    // or a config that sets it is silently rejected (the AMR config-surface lesson).
    maxLocalStageRetries: z.number().int().positive().optional(),
  })
  .strict();

// --- Roadmap Auto-Triage (Phase 0, Contract 2): default-off config surface ---

const CONFIDENCE = z.enum(['low', 'medium', 'high']);
// The stored/typed ratchet-stage domain is 1–4, but v1 CAPS the reachable stages at 2
// (SC4): auto-execute + required human-verify is the ceiling; sampled-verify (3) and
// fully-autonomous merge (4) are deferred post-v1. Configuring a deferred stage is a
// config error, not a silent clamp — reject it at load with a legible message so an
// operator can't accidentally opt into autonomy the retrospective can't yet gate.
const V1_MAX_RATCHET_STAGE = 2;
const RATCHET_STAGE = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
  .refine((s) => s <= V1_MAX_RATCHET_STAGE, {
    message: `ratchetStage ${'>'} ${V1_MAX_RATCHET_STAGE} is deferred post-v1 (stages 3–4 not yet supported); use 1 or 2`,
  });

/**
 * The whole `roadmap.autoTriage` surface, wired here so config validation ACCEPTS it
 * (a type-only add would be silently rejected — the AMR config-surface lesson). `.strict()`
 * so a typo'd field fails at config-load rather than being silently dropped. Every field
 * beyond the master switch is a documented, tunable seed; the seam stays inert until
 * `enabled` is true. An absent block (or `enabled: false`) ⇒ byte-identical roadmap
 * behavior (SC-S1).
 */
export const RoadmapAutoTriageSchema = z
  .object({
    enabled: z.boolean(),
    schedule: z.string().min(1).optional(),
    ratchetStage: RATCHET_STAGE,
    thresholds: z
      .object({
        dispatchConfidence: CONFIDENCE,
        boundedScopeMax: z.number(),
        brainstormConfidence: z.number(),
        exceededByBands: z.number(),
        ratchetAdvanceRate: z.number(),
        ratchetMinSample: z.number(),
      })
      .strict(),
    depthBudget: z
      .object({
        trivial: z.number(),
        simple: z.number(),
      })
      .strict(),
  })
  .strict();

/** The `roadmap` config namespace. `.strict()` — currently only `autoTriage`. */
export const RoadmapConfigSchema = z
  .object({
    autoTriage: RoadmapAutoTriageSchema.optional(),
  })
  .strict();

// Drift guard: the schema output must be assignable to the canonical types, so a wrong
// field TYPE stops compiling. Field-PRESENCE (the AMR trap) is pinned by the config
// round-trip test in schema.roadmap-triage.test.ts.
const _roadmapGuard = (r: RoadmapConfig): z.infer<typeof RoadmapConfigSchema> => r;
const _autoTriageGuard = (t: RoadmapAutoTriageConfig): z.infer<typeof RoadmapAutoTriageSchema> => t;
void _roadmapGuard;
void _autoTriageGuard;

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
    // Reuse this stage's output across gate-block re-dispatches (resume-from-failed-stage).
    checkpoint: z.boolean().optional(),
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
    // staged-verify-gate-convergence D2: optional acceptance command run in the
    // workspace at settle (exit 0 ⇒ pass). Must be added HERE (a type-only add is
    // silently rejected by the .strict() schema — the AMR config-surface lesson).
    acceptance: z.string().min(1).optional(),
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
