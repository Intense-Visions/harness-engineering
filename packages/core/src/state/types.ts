// packages/core/src/state/types.ts
import { z } from 'zod';

export const HarnessStateSchema = z.object({
  schemaVersion: z.literal(1),
  position: z.object({
    phase: z.string().optional(),
    task: z.string().optional(),
  }).default({}),
  decisions: z.array(z.object({
    date: z.string(),
    decision: z.string(),
    context: z.string(),
  })).default([]),
  blockers: z.array(z.object({
    id: z.string(),
    description: z.string(),
    status: z.enum(['open', 'resolved']),
  })).default([]),
  progress: z.record(z.enum(['pending', 'in_progress', 'complete'])).default({}),
  lastSession: z.object({
    date: z.string(),
    summary: z.string(),
  }).optional(),
});

export type HarnessState = z.infer<typeof HarnessStateSchema>;

export const DEFAULT_STATE: HarnessState = {
  schemaVersion: 1,
  position: {},
  decisions: [],
  blockers: [],
  progress: {},
};
