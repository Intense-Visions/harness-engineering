import { z } from 'zod';

export const TriggerContextSchema = z
  .enum(['always', 'on_pr', 'on_commit', 'on_review', 'scheduled', 'manual', 'on_plan_approved'])
  .default('always');

export type TriggerContext = z.infer<typeof TriggerContextSchema>;

export const CommandStepSchema = z.object({
  command: z.string(),
  when: TriggerContextSchema,
});

export const SkillStepSchema = z.object({
  skill: z.string(),
  when: TriggerContextSchema,
  output: z.enum(['inline', 'artifact', 'auto']).default('auto'),
});

export const StepSchema = z.union([CommandStepSchema, SkillStepSchema]);

export type CommandStep = z.infer<typeof CommandStepSchema>;
export type SkillStep = z.infer<typeof SkillStepSchema>;
export type Step = z.infer<typeof StepSchema>;

export const PersonaTriggerSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('on_pr'),
    conditions: z
      .object({
        paths: z.array(z.string()).optional(),
        min_files: z.number().optional(),
      })
      .optional(),
  }),
  z.object({
    event: z.literal('on_commit'),
    conditions: z.object({ branches: z.array(z.string()).optional() }).optional(),
  }),
  z.object({
    event: z.literal('scheduled'),
    cron: z.string(),
  }),
  z.object({
    event: z.literal('manual'),
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

// V1 schema (backward compat)
const PersonaSchemaV1 = z.object({
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

// V2 schema (with steps)
const PersonaSchemaV2 = z.object({
  version: z.literal(2),
  name: z.string(),
  description: z.string(),
  role: z.string(),
  skills: z.array(z.string()),
  steps: z.array(StepSchema),
  triggers: z.array(PersonaTriggerSchema),
  config: PersonaConfigSchema.default({}),
  outputs: PersonaOutputsSchema.default({}),
});

export const PersonaSchema = z.union([PersonaSchemaV1, PersonaSchemaV2]);

// Normalized type always has steps (v1 gets normalized in loader)
export interface Persona {
  version: 1 | 2;
  name: string;
  description: string;
  role: string;
  skills: string[];
  steps: Step[];
  commands?: string[];
  triggers: z.infer<typeof PersonaTriggerSchema>[];
  config: z.infer<typeof PersonaConfigSchema>;
  outputs: z.infer<typeof PersonaOutputsSchema>;
}

export type PersonaTrigger = z.infer<typeof PersonaTriggerSchema>;
export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;
