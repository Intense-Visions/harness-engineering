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

export { ALLOWED_TRIGGERS, ALLOWED_PLATFORMS };
