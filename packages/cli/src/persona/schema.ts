import { z } from 'zod';

export const PersonaTriggerSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('on_pr'),
    conditions: z.object({ paths: z.array(z.string()).optional() }).optional(),
  }),
  z.object({
    event: z.literal('on_commit'),
    conditions: z.object({ branches: z.array(z.string()).optional() }).optional(),
  }),
  z.object({
    event: z.literal('scheduled'),
    cron: z.string(),
  }),
]);

export const PersonaConfigSchema = z.object({
  severity: z.enum(['error', 'warning']).default('error'),
  autoFix: z.boolean().default(false),
  timeout: z.number().default(300000),
});

export const PersonaOutputsSchema = z.object({
  'agents-md': z.boolean().default(true),
  'ci-workflow': z.boolean().default(true),
  'runtime-config': z.boolean().default(true),
});

export const PersonaSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  description: z.string(),
  role: z.string(),
  skills: z.array(z.string()),
  commands: z.array(z.string()),
  triggers: z.array(PersonaTriggerSchema),
  config: PersonaConfigSchema.default({}),
  outputs: PersonaOutputsSchema.default({}),
});

export type Persona = z.infer<typeof PersonaSchema>;
export type PersonaTrigger = z.infer<typeof PersonaTriggerSchema>;
export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;
