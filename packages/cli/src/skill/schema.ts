import { z } from 'zod';

const SkillPhaseSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().default(true),
});

const SkillCliSchema = z.object({
  command: z.string(),
  args: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        required: z.boolean().default(false),
      })
    )
    .default([]),
});

const SkillMcpSchema = z.object({
  tool: z.string(),
  input: z.record(z.string()),
});

const SkillStateSchema = z.object({
  persistent: z.boolean().default(false),
  files: z.array(z.string()).default([]),
});

const ALLOWED_TRIGGERS = [
  'manual',
  'on_pr',
  'on_commit',
  'on_new_feature',
  'on_bug_fix',
  'on_refactor',
  'on_project_init',
  'on_review',
  'on_milestone',
  'on_task_complete',
  'on_doc_check',
] as const;

const ALLOWED_PLATFORMS = ['claude-code', 'gemini-cli', 'codex', 'cursor'] as const;

export const ALLOWED_COGNITIVE_MODES = [
  'adversarial-reviewer',
  'constructive-architect',
  'meticulous-implementer',
  'diagnostic-investigator',
  'advisory-guide',
  'meticulous-verifier',
] as const;

const SkillCursorSchema = z.object({
  globs: z.array(z.string()).optional(),
  alwaysApply: z.boolean().default(false),
});

const SkillCodexSchema = z.object({
  instructions_override: z.string().optional(),
});

export const SkillContextBudgetSchema = z.object({
  max_tokens: z.number().int().min(100).max(50000).default(4000),
  priority: z.number().int().min(1).max(5).default(3),
});

/** Filesystem-access levels a skill may declare, from least to most authority. */
export const FILESYSTEM_LEVELS = ['none', 'read', 'read-write'] as const;
export type FilesystemLevel = (typeof FILESYSTEM_LEVELS)[number];

// Tool → capability classification. Kept here (not in the check) so both the
// derivation used to seed skill.yaml and the consistency check that guards it
// read from a single source of truth.
const FS_WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash']);
const FS_READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);
const NETWORK_TOOLS = new Set(['WebFetch', 'WebSearch']);

/**
 * A skill's declared capability envelope — the tool/network/filesystem surface
 * it is allowed to touch. Declaration + validation layer only; runtime
 * bounds-enforcement (an orchestrator actually blocking a skill that exceeds
 * this) is a follow-up. `tools` mirrors the skill's `tools:` list so the
 * envelope is self-contained for a future enforcer that never re-reads the
 * skill body.
 */
export const SkillCapabilitiesSchema = z.object({
  tools: z.array(z.string()).default([]),
  network: z.boolean(),
  filesystem: z.enum(FILESYSTEM_LEVELS),
});
export type SkillCapabilities = z.infer<typeof SkillCapabilitiesSchema>;

/**
 * Mechanically derive the capability envelope from a skill's `tools:` list.
 *
 * - `filesystem` is `read-write` when any mutating tool (Write/Edit/Bash/…) is
 *   present, `read` when only read-only tools (Read/Glob/Grep) are, else `none`.
 *   Bash counts as read-write: a shell can create and delete files.
 * - `network` is true when a network tool (WebFetch/WebSearch) is present.
 * - `tools` is the declared list verbatim.
 *
 * This is the seed used to populate `capabilities:` and the reference the
 * consistency check compares against, so the two never drift.
 */
export function deriveCapabilities(tools: readonly string[]): SkillCapabilities {
  const filesystem: FilesystemLevel = tools.some((t) => FS_WRITE_TOOLS.has(t))
    ? 'read-write'
    : tools.some((t) => FS_READ_TOOLS.has(t))
      ? 'read'
      : 'none';
  return {
    tools: [...tools],
    network: tools.some((t) => NETWORK_TOOLS.has(t)),
    filesystem,
  };
}

/**
 * Compare a declared capability envelope against what its `tools:` list implies
 * and return one message per inconsistency (empty when consistent). This is the
 * teeth: a skill that adds `WebFetch` to `tools` but not `network: true`, or
 * lists tools its capabilities omit, fails validation.
 */
export function capabilityDriftErrors(
  tools: readonly string[],
  declared: SkillCapabilities
): string[] {
  const derived = deriveCapabilities(tools);
  const errors: string[] = [];

  const declaredTools = new Set(declared.tools);
  const skillTools = new Set(tools);
  const mismatched =
    declaredTools.size !== skillTools.size || [...skillTools].some((t) => !declaredTools.has(t));
  if (mismatched) {
    errors.push(
      `capabilities.tools [${[...declaredTools].sort().join(', ')}] must match the skill's tools [${[...skillTools].sort().join(', ')}]`
    );
  }
  if (declared.network !== derived.network) {
    errors.push(`capabilities.network must be ${derived.network} (derived from tools)`);
  }
  if (declared.filesystem !== derived.filesystem) {
    errors.push(`capabilities.filesystem must be "${derived.filesystem}" (derived from tools)`);
  }
  return errors;
}

/**
 * A skill's capability-seam roles (#1425) — the Service Definition it names, the
 * Provider(s) that implement it, and the Consumer(s) that depend on it. Optional:
 * a skill declares this only when it defines a real extension point. The single-role
 * detector below flags a declaration that fills only one of the three roles
 * (accidental single-implementation lock-in). Field names mirror the
 * harness-skill-authoring Phase 1C prose (Service Definition / Provider / Consumer).
 */
export const SkillCapabilityRolesSchema = z.object({
  definition: z.string().default(''),
  providers: z.array(z.string()).default([]),
  consumers: z.array(z.string()).default([]),
});
export type SkillCapabilityRoles = z.infer<typeof SkillCapabilityRolesSchema>;

/**
 * Single-role detector (#1425). Given a declared capabilityRoles, return one message
 * per problem (empty when the seam is adequately wired). A role is "filled" when the
 * Service Definition is a non-empty string and each of providers/consumers holds at
 * least one non-empty entry. Zero filled roles is a malformed declaration; exactly one
 * filled role is the single-role red flag — a capability swappable in name only. Two or
 * three filled roles pass (a partially wired seam is work-in-progress, not lock-in).
 * The caller only invokes this when the field is present, so absence abstains upstream.
 */
export function capabilityRoleErrors(roles: SkillCapabilityRoles): string[] {
  const hasDefinition = roles.definition.trim().length > 0;
  const hasProviders = roles.providers.some((p) => p.trim().length > 0);
  const hasConsumers = roles.consumers.some((c) => c.trim().length > 0);
  const filled: string[] = [];
  if (hasDefinition) filled.push('definition');
  if (hasProviders) filled.push('providers');
  if (hasConsumers) filled.push('consumers');

  if (filled.length === 0) {
    return [
      'capabilityRoles is declared but names no role — give it a Service Definition, at least one Provider, and at least one Consumer, or drop the field',
    ];
  }
  if (filled.length === 1) {
    const present = filled[0];
    const missing = (['definition', 'providers', 'consumers'] as const).filter(
      (r) => r !== present
    );
    return [
      `capabilityRoles declares only the "${present}" role; a capability with one role filled is accidental single-implementation lock-in, not a real seam — name the missing "${missing[0]}" and "${missing[1]}" roles or drop the field`,
    ];
  }
  return [];
}

export const SkillAddressSchema = z.object({
  signal: z.string(),
  hard: z.boolean().optional(),
  metric: z.string().optional(),
  threshold: z.number().optional(),
  weight: z.number().min(0).max(1).optional(),
});

export const SkillMetadataSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Name must be lowercase with hyphens'),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format'),
    description: z.string(),
    cognitive_mode: z
      .string()
      .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'Cognitive mode must be kebab-case')
      .optional(),
    triggers: z.array(z.enum(ALLOWED_TRIGGERS)),
    platforms: z.array(z.enum(ALLOWED_PLATFORMS)),
    tools: z.array(z.string()),
    cli: SkillCliSchema.optional(),
    mcp: SkillMcpSchema.optional(),
    type: z.enum(['rigid', 'flexible', 'knowledge']),
    paths: z.array(z.string()).default([]),
    related_skills: z.array(z.string()).default([]),
    metadata: z
      .object({
        author: z.string().optional(),
        version: z.string().optional(),
        upstream: z.string().optional(),
      })
      .passthrough()
      .default({}),
    phases: z.array(SkillPhaseSchema).optional(),
    state: SkillStateSchema.default({}),
    depends_on: z.array(z.string()).default([]),
    repository: z.string().url().optional(),
    tier: z.number().int().min(1).max(3).optional(),
    // Curation tier for the user-facing catalog surface (distinct from `tier`,
    // which controls slash-command/catalog *loading*). 0 = load-bearing gear a
    // senior engineer holds in their head, 1 = library / on-demand reference
    // (the default when omitted), 2 = deprecated / retire candidate.
    catalog_tier: z.number().int().min(0).max(2).optional(),
    internal: z.boolean().default(false),
    keywords: z.array(z.string()).default([]),
    stack_signals: z.array(z.string()).default([]),
    cursor: SkillCursorSchema.optional(),
    codex: SkillCodexSchema.optional(),
    command_name: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/, 'Command name must be lowercase with hyphens')
      .optional(),
    command_namespace: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/, 'Command namespace must be lowercase with hyphens')
      .optional(),
    addresses: z.array(SkillAddressSchema).default([]),
    context_budget: SkillContextBudgetSchema.optional(),
    capabilities: SkillCapabilitiesSchema.optional(),
    // A bare `capabilityRoles:` key (no value) parses to null in YAML; treat that
    // as an empty declaration ({}) so it routes through the friendly single-role
    // detector ("names no role") rather than failing with an opaque zod
    // invalid_type. An omitted key stays undefined and abstains as before.
    capabilityRoles: z.preprocess(
      (v) => (v === null ? {} : v),
      SkillCapabilityRolesSchema.optional()
    ),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'knowledge') {
      if (data.tools && data.tools.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Knowledge skills must not declare tools',
          path: ['tools'],
        });
      }
      if (data.phases && data.phases.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Knowledge skills must not declare phases',
          path: ['phases'],
        });
      }
      if (data.state?.persistent === true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Knowledge skills must not set state.persistent to true',
          path: ['state', 'persistent'],
        });
      }
    }
  });

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
export type SkillPhase = z.infer<typeof SkillPhaseSchema>;
export type SkillCli = z.infer<typeof SkillCliSchema>;
export type SkillState = z.infer<typeof SkillStateSchema>;
export type SkillCursor = z.infer<typeof SkillCursorSchema>;
export type SkillCodex = z.infer<typeof SkillCodexSchema>;
export type SkillAddress = z.infer<typeof SkillAddressSchema>;

export type SkillContextBudgetParsed = z.infer<typeof SkillContextBudgetSchema>;

export { ALLOWED_TRIGGERS, ALLOWED_PLATFORMS };
