import { z } from 'zod';
import { skipDirGlobs } from '@harness-engineering/graph';
import type { SecurityConfig, SecuritySeverity, RuleOverride } from './types';
import { DEFAULT_SECURITY_CONFIG } from './types';

const RuleOverrideSchema = z.enum(['off', 'error', 'warning', 'info']);

export const SecurityConfigSchema = z.object({
  enabled: z.boolean().default(true),
  strict: z.boolean().default(false),
  rules: z.record(z.string(), RuleOverrideSchema).optional().default({}),
  exclude: z
    .array(z.string())
    .optional()
    .default([...skipDirGlobs(), '**/*.test.ts', '**/fixtures/**']),
  external: z
    .object({
      semgrep: z
        .object({
          enabled: z.union([z.literal('auto'), z.boolean()]).default('auto'),
          rulesets: z.array(z.string()).optional(),
        })
        .optional(),
      gitleaks: z
        .object({
          enabled: z.union([z.literal('auto'), z.boolean()]).default('auto'),
        })
        .optional(),
    })
    .optional(),
});

export function parseSecurityConfig(input: unknown): SecurityConfig {
  if (input === undefined || input === null) {
    return { ...DEFAULT_SECURITY_CONFIG };
  }
  const result = SecurityConfigSchema.safeParse(input);
  if (result.success) {
    return result.data as SecurityConfig;
  }
  return { ...DEFAULT_SECURITY_CONFIG };
}

export function resolveRuleSeverity(
  ruleId: string,
  defaultSeverity: SecuritySeverity,
  overrides: Record<string, RuleOverride>,
  strict: boolean
): RuleOverride {
  // Check exact match first
  if (overrides[ruleId] !== undefined) {
    return overrides[ruleId];
  }

  // Check wildcard matches (e.g. "SEC-INJ-*")
  for (const [pattern, override] of Object.entries(overrides)) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (ruleId.startsWith(prefix)) {
        return override;
      }
    }
  }

  // Apply strict mode: promote warnings/info to error
  if (strict && (defaultSeverity === 'warning' || defaultSeverity === 'info')) {
    return 'error';
  }

  return defaultSeverity;
}
