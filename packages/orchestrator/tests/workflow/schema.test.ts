import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  BackendDefSchema,
  RoutingConfigSchema,
  validateBackendsAndRouting,
} from '../../src/workflow/schema';
import type { BackendDef } from '@harness-engineering/types';

describe('BackendDefSchema', () => {
  it('OT1: accepts a valid claude backend', () => {
    const result = BackendDefSchema.safeParse({ type: 'claude', command: 'claude' });
    expect(result.success).toBe(true);
  });

  it('OT1: accepts a valid pi backend with array model', () => {
    const result = BackendDefSchema.safeParse({
      type: 'pi',
      endpoint: 'http://localhost:1234/v1',
      model: ['a', 'b'],
    });
    expect(result.success).toBe(true);
  });

  it('OT2: rejects pi backend missing endpoint and model', () => {
    const result = BackendDefSchema.safeParse({ type: 'pi' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('endpoint');
    expect(paths).toContain('model');
  });

  it('OT3: rejects unknown discriminator value with valid types listed', () => {
    const result = BackendDefSchema.safeParse({ type: 'unknown' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues[0]!;
    expect(issue.code).toBe('invalid_union_discriminator');
    // Zod's invalid_union_discriminator includes the valid options:
    const message = JSON.stringify(issue);
    expect(message).toContain('mock');
    expect(message).toContain('claude');
    expect(message).toContain('anthropic');
    expect(message).toContain('openai');
    expect(message).toContain('gemini');
    expect(message).toContain('local');
    expect(message).toContain('pi');
  });

  it('OT8: rejects empty model array on local backend', () => {
    const result = BackendDefSchema.safeParse({
      type: 'local',
      endpoint: 'http://localhost:1234/v1',
      model: [],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const codes = result.error.issues.map((i) => i.code);
    // The string|array union fails both branches; one of them is "too_small".
    expect(codes).toContain('too_small');
  });
});

describe('RoutingConfigSchema', () => {
  it('OT4: rejects routing without default', () => {
    const result = RoutingConfigSchema.safeParse({ 'quick-fix': 'local' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('default');
  });

  it('OT6: rejects unknown top-level routing key (typo: quickfix)', () => {
    const result = RoutingConfigSchema.safeParse({
      default: 'cloud',
      quickfix: 'local',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const codes = result.error.issues.map((i) => i.code);
    expect(codes).toContain('unrecognized_keys');
    const message = JSON.stringify(result.error.issues);
    expect(message).toContain('quickfix');
  });

  it('OT7: rejects unknown intelligence-layer key', () => {
    const result = RoutingConfigSchema.safeParse({
      default: 'cloud',
      intelligence: { foo: 'local' },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const codes = result.error.issues.map((i) => i.code);
    expect(codes).toContain('unrecognized_keys');
    const message = JSON.stringify(result.error.issues);
    expect(message).toContain('foo');
  });

  it('OT15: schema is composable as optional (Phase 3 contract)', () => {
    // Phase 1 contract: RoutingConfigSchema is opt-in. SC15 ("must have
    // backends or legacy backend") is enforced in Phase 3 when the schema
    // is wired into validateWorkflowConfig. See plan Uncertainties.
    const result = RoutingConfigSchema.optional().safeParse(undefined);
    expect(result.success).toBe(true);
  });
});

describe('validateBackendsAndRouting (cross-field superRefine helper)', () => {
  // Helper: build a parent schema that runs validateBackendsAndRouting
  // and surfaces issues, mirroring what Phase 3 will do.
  const ParentSchema = z
    .object({
      backends: z.record(BackendDefSchema).optional(),
      routing: RoutingConfigSchema.optional(),
    })
    .superRefine((cfg, ctx) =>
      validateBackendsAndRouting(
        cfg.backends as Record<string, BackendDef> | undefined,
        cfg.routing,
        ctx
      )
    );

  it('OT5: cross-field error names missing backend and lists defined names', () => {
    const result = ParentSchema.safeParse({
      backends: { cloud: { type: 'claude' } },
      routing: { default: 'nonexistent' },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const customIssue = result.error.issues.find((i) => i.code === 'custom');
    expect(customIssue).toBeDefined();
    expect(customIssue!.path).toEqual(['routing', 'default']);
    expect(customIssue!.message).toContain("'nonexistent'");
    expect(customIssue!.message).toContain('cloud');
  });

  it('OT5: cross-field validator passes when all routing values reference defined backends', () => {
    const result = ParentSchema.safeParse({
      backends: {
        cloud: { type: 'claude' },
        local: {
          type: 'pi',
          endpoint: 'http://localhost:1234/v1',
          model: ['a'],
        },
      },
      routing: {
        default: 'cloud',
        'quick-fix': 'local',
        intelligence: { sel: 'local' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('cross-field validator runs only when both backends and routing are present', () => {
    // No backends: cross-field is a no-op.
    const a = ParentSchema.safeParse({ routing: { default: 'cloud' } });
    expect(a.success).toBe(true);
    // No routing: cross-field is a no-op.
    const b = ParentSchema.safeParse({
      backends: { cloud: { type: 'claude' } },
    });
    expect(b.success).toBe(true);
  });
});
