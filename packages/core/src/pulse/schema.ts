import { z } from 'zod';
import type { PulseConfig } from '@harness-engineering/types';

const LOOKBACK_PATTERN = /^\d+(h|d|w)$/;

export const PulseDbSourceSchema = z.object({
  enabled: z.boolean(),
  connectionEnv: z.string().optional(),
});

export const PulseSourcesSchema = z.object({
  analytics: z.string().nullable(),
  tracing: z.string().nullable(),
  payments: z.string().nullable(),
  db: PulseDbSourceSchema,
});

export const PulseConfigSchema = z.object({
  enabled: z.boolean(),
  lookbackDefault: z.string().regex(LOOKBACK_PATTERN, 'lookback must be like "24h", "7d", or "1w"'),
  primaryEvent: z.string(),
  valueEvent: z.string(),
  completionEvents: z.array(z.string()),
  qualityScoring: z.boolean(),
  qualityDimension: z.string().nullable(),
  sources: PulseSourcesSchema,
  metricSourceOverrides: z.record(z.string(), z.string()),
  pendingMetrics: z.array(z.string()),
  excludedMetrics: z.array(z.string()),
}) satisfies z.ZodType<PulseConfig>;
