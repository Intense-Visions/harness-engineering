import { z } from 'zod';

const SkillPhaseSchema = z.object({
  name: z.string(),
  description: z.string(),
});

const SkillCliSchema = z.object({
  command: z.string(),
  args: z.array(z.object({
    name: z.string(),
    description: z.string(),
    required: z.boolean().default(false),
  })).default([]),
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
  'manual', 'on_pr', 'on_commit', 'on_new_feature',
  'on_bug_fix', 'on_refactor', 'on_project_init', 'on_review',
] as const;

const ALLOWED_PLATFORMS = ['claude-code', 'gemini-cli'] as const;

export const SkillMetadataSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Name must be lowercase with hyphens'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format'),
  description: z.string(),
  triggers: z.array(z.enum(ALLOWED_TRIGGERS)),
  platforms: z.array(z.enum(ALLOWED_PLATFORMS)),
  tools: z.array(z.string()),
  cli: SkillCliSchema.optional(),
  mcp: SkillMcpSchema.optional(),
  type: z.enum(['rigid', 'flexible']),
  phases: z.array(SkillPhaseSchema).optional(),
  state: SkillStateSchema.default({}),
  depends_on: z.array(z.string()).default([]),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
export type SkillPhase = z.infer<typeof SkillPhaseSchema>;
export type SkillCli = z.infer<typeof SkillCliSchema>;
export type SkillState = z.infer<typeof SkillStateSchema>;

export { ALLOWED_TRIGGERS, ALLOWED_PLATFORMS };
