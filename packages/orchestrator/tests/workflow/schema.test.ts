import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  BackendDefSchema,
  RoutingConfigSchema,
  validateBackendsAndRouting,
  StagedWorkflowDeclSchema,
  WorkflowStepSchema,
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

  it('OT16: produces actionable error message for non-string-non-array model', () => {
    const result = BackendDefSchema.safeParse({
      type: 'local',
      endpoint: 'http://localhost:1234/v1',
      model: 0,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    // The union errorMap collapses opaque "Invalid input" into a message
    // naming both accepted shapes.
    const messages = result.error.issues.map((i) => i.message).join('\n');
    expect(messages).toContain('non-empty string or array of strings');
  });

  it('OT1: accepts a valid ollama backend and honors optional fields', () => {
    const result = BackendDefSchema.safeParse({
      type: 'ollama',
      endpoint: 'http://127.0.0.1:11434/v1',
      model: ['qwen3-agent:32b', 'qwen3:8b'],
      apiKey: 'ollama',
      timeoutMs: 600000,
      maxTurnsPerRun: 50,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an ollama backend with numCtx/maxContextTokens/numPredict/keepAlive and rejects a negative numCtx', () => {
    const ok = BackendDefSchema.safeParse({
      type: 'ollama',
      endpoint: 'http://127.0.0.1:11434/v1',
      model: 'qwen3-agent:32b',
      numCtx: 8192,
      maxContextTokens: 32768,
      numPredict: 512,
      keepAlive: '10m',
    });
    expect(ok.success).toBe(true);
    const bad = BackendDefSchema.safeParse({
      type: 'ollama',
      endpoint: 'http://127.0.0.1:11434/v1',
      model: 'qwen3-agent:32b',
      numCtx: -1,
    });
    expect(bad.success).toBe(false);
  });

  it('rejects an ollama backend with an unknown field (strict)', () => {
    const result = BackendDefSchema.safeParse({
      type: 'ollama',
      endpoint: 'http://127.0.0.1:11434/v1',
      model: 'qwen3-agent:32b',
      bogusField: true,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const codes = result.error.issues.map((i) => i.code);
    expect(codes).toContain('unrecognized_keys');
  });

  it("accepts an ollama backend with mcpServers and rejects a typo'd field", () => {
    const ok = BackendDefSchema.safeParse({
      type: 'ollama',
      endpoint: 'http://127.0.0.1:11434/v1',
      model: 'm',
      mcpServers: [{ name: 'context7', command: 'npx', args: ['-y', '@upstash/context7-mcp'] }],
    });
    expect(ok.success).toBe(true);
    const bad = BackendDefSchema.safeParse({
      type: 'ollama',
      endpoint: 'http://127.0.0.1:11434/v1',
      model: 'm',
      mcpServers: [{ name: 'x', command: 'y', bogus: true }],
    });
    expect(bad.success).toBe(false);
  });

  it('OT16: same actionable message applies to pi variant', () => {
    const result = BackendDefSchema.safeParse({
      type: 'pi',
      endpoint: 'http://localhost:1234/v1',
      model: null,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message).join('\n');
    expect(messages).toContain('non-empty string or array of strings');
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

describe('StagedWorkflowDecl schema (D7/D13)', () => {
  const oneStep = { skill: 'review', produces: 'review-notes' };
  const twoSteps = [
    { skill: 'review', produces: 'review-notes' },
    { skill: 'implement', produces: 'patch', expects: 'review-notes', gate: 'pass-required' },
  ];

  it('D13: rejects a 0-stage decl with a message naming "at least 1 stage"', () => {
    const result = StagedWorkflowDeclSchema.safeParse({
      name: 'empty',
      match: { identifierPrefix: 'REV-' },
      stages: [],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message).join('\n');
    expect(messages).toContain('at least 1 stage');
  });

  it('D13: accepts a 1-stage decl (schema-valid; single-dispatch fallback is workflowFor)', () => {
    const result = StagedWorkflowDeclSchema.safeParse({
      name: 'single',
      match: { identifierPrefix: 'REV-' },
      stages: [oneStep],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid 2-stage decl matched by identifierPrefix', () => {
    const result = StagedWorkflowDeclSchema.safeParse({
      name: 'review-then-implement',
      match: { identifierPrefix: 'REV-' },
      stages: twoSteps,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid decl matched by labels + a stageDeadlineMs override', () => {
    const result = StagedWorkflowDeclSchema.safeParse({
      name: 'labelled',
      match: { labels: ['staged'] },
      stages: twoSteps,
      stageDeadlineMs: 90_000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a step missing `skill`', () => {
    const result = StagedWorkflowDeclSchema.safeParse({
      name: 'bad-step',
      match: { identifierPrefix: 'REV-' },
      stages: [{ produces: 'x' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown top-level decl key (strict)', () => {
    const result = StagedWorkflowDeclSchema.safeParse({
      name: 'typo',
      match: { identifierPrefix: 'REV-' },
      stages: twoSteps,
      bogus: true,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const codes = result.error.issues.map((i) => i.code);
    expect(codes).toContain('unrecognized_keys');
  });

  it('WorkflowStepSchema requires a non-empty skill + produces', () => {
    expect(WorkflowStepSchema.safeParse({ skill: 's', produces: 'p' }).success).toBe(true);
    expect(WorkflowStepSchema.safeParse({ skill: '', produces: 'p' }).success).toBe(false);
    expect(WorkflowStepSchema.safeParse({ skill: 's' }).success).toBe(false);
  });
});
