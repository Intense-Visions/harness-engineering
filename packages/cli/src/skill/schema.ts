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

export const SkillMetadataSchema = z.object({
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
  type: z.enum(['rigid', 'flexible']),
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
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
export type SkillPhase = z.infer<typeof SkillPhaseSchema>;
export type SkillCli = z.infer<typeof SkillCliSchema>;
export type SkillState = z.infer<typeof SkillStateSchema>;
export type SkillCursor = z.infer<typeof SkillCursorSchema>;
export type SkillCodex = z.infer<typeof SkillCodexSchema>;

export { ALLOWED_TRIGGERS, ALLOWED_PLATFORMS };
