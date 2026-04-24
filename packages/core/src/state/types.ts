// packages/core/src/state/types.ts
import { z } from 'zod';

export const FailureEntrySchema = z.object({
  date: z.string(),
  skill: z.string(),
  type: z.string(),
  description: z.string(),
});

export type FailureEntry = z.infer<typeof FailureEntrySchema>;

export const HandoffSchema = z.object({
  timestamp: z.string(),
  fromSkill: z.string(),
  phase: z.string(),
  summary: z.string(),
  completed: z.array(z.string()).default([]),
  pending: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  decisions: z
    .array(
      z.object({
        what: z.string(),
        why: z.string(),
      })
    )
    .default([]),
  blockers: z.array(z.string()).default([]),
  contextKeywords: z.array(z.string()).default([]),
  recommendedSkills: z
    .object({
      apply: z.array(z.string()),
      reference: z.array(z.string()),
      consider: z.array(z.string()),
      skillsPath: z.string(),
    })
    .optional(),
});

export type Handoff = z.infer<typeof HandoffSchema>;

export const GateCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  command: z.string(),
  output: z.string().optional(),
  duration: z.number().optional(),
});

export const GateResultSchema = z.object({
  passed: z.boolean(),
  checks: z.array(GateCheckSchema),
});

export type GateResult = z.infer<typeof GateResultSchema>;

export const GateConfigSchema = z.object({
  checks: z
    .array(
      z.object({
        name: z.string(),
        command: z.string(),
      })
    )
    .optional(),
  trace: z.boolean().optional(),
});

export type GateConfig = z.infer<typeof GateConfigSchema>;

export const HarnessStateSchema = z.object({
  schemaVersion: z.literal(1),
  position: z
    .object({
      phase: z.string().optional(),
      task: z.string().optional(),
    })
    .default({}),
  decisions: z
    .array(
      z.object({
        date: z.string(),
        decision: z.string(),
        context: z.string(),
      })
    )
    .default([]),
  blockers: z
    .array(
      z.object({
        id: z.string(),
        description: z.string(),
        status: z.enum(['open', 'resolved']),
      })
    )
    .default([]),
  progress: z.record(z.enum(['pending', 'in_progress', 'complete'])).default({}),
  lastSession: z
    .object({
      date: z.string(),
      summary: z.string(),
      lastSkill: z.string().optional(),
      pendingTasks: z.array(z.string()).optional(),
    })
    .optional(),
});

export type HarnessState = z.infer<typeof HarnessStateSchema>;

export const DEFAULT_STATE: HarnessState = {
  schemaVersion: 1,
  position: {},
  decisions: [],
  blockers: [],
  progress: {},
};
