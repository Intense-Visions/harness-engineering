// agents/skills/tests/schema.ts
import { z } from 'zod';

export const SkillMetadataSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Name must be lowercase with hyphens'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format'),
  description: z.string().min(10).max(200),
  platform: z.enum(['claude-code', 'gemini-cli']),
  triggers: z.array(z.enum(['manual', 'on_pr', 'on_commit'])),
  tools: z.array(z.string()),
  cli_command: z.string().optional(),
  category: z.enum(['enforcement', 'workflow', 'entropy', 'setup']),
  depends_on: z.array(z.string()).default([]),
  includes: z.array(z.string()).default([]),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
