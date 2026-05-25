import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock design-craft to avoid spinning up LLM provider
vi.mock('../../../src/mcp/tools/design-craft', () => ({
  runDesignCraft: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      findings: [],
      scores: [],
      summary: {
        phaseRun: ['critique'],
        mode: 'fast',
        durationMs: 0,
        llmCalls: { provider: 'mock', model: 'mock', count: 0, costUsd: 0 },
        catalog: { rubricsApplied: [], patternsApplied: [], exemplarsCited: [] },
        preconditions: {
          aestheticIntentDeclared: false,
          designMdExists: false,
          tokensExist: false,
        },
        deferralsToHarnessDesign: 0,
        runId: 'mock-run',
      },
    },
  }),
}));

import { runFill } from '../../../src/design-pipeline/phases/fill';
import { newContext } from '../../../src/design-pipeline/context';

describe('runFill', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-fill-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('bootstraps DESIGN.md when absent', async () => {
    const ctx = newContext();
    await runFill({ projectRoot: tmpDir, context: ctx, mode: 'fast' });
    expect(ctx.bootstrapped.designMd).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, 'design-system', 'DESIGN.md'), 'utf-8');
    expect(content).toContain('## Component Registry');
    expect(content).toContain('## Brand Rules');
    expect(content).toContain('TODO');
  });

  it('bootstraps tokens.json when absent', async () => {
    const ctx = newContext();
    await runFill({ projectRoot: tmpDir, context: ctx, mode: 'fast' });
    expect(ctx.bootstrapped.tokensJson).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, 'design-system', 'tokens.json'), 'utf-8');
    expect(JSON.parse(content)).toHaveProperty('$description');
  });

  it('appends Component Registry stub when DESIGN.md exists without it', async () => {
    fs.mkdirSync(path.join(tmpDir, 'design-system'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'design-system', 'DESIGN.md'),
      `# Design\n\n## Aesthetic Direction\nfoo\n`
    );
    const ctx = newContext();
    ctx.inputs.designMdExists = true;
    ctx.inputs.componentRegistryExists = false;
    ctx.inputs.brandRulesExist = false;
    await runFill({ projectRoot: tmpDir, context: ctx, mode: 'fast' });
    expect(ctx.bootstrapped.componentRegistry).toBe(true);
    expect(ctx.bootstrapped.brandRules).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, 'design-system', 'DESIGN.md'), 'utf-8');
    expect(content).toContain('## Component Registry');
    expect(content).toContain('## Brand Rules');
  });

  it('does not re-bootstrap when inputs already present', async () => {
    fs.mkdirSync(path.join(tmpDir, 'design-system'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'design-system', 'tokens.json'), '{ "real": "tokens" }');
    fs.writeFileSync(
      path.join(tmpDir, 'design-system', 'DESIGN.md'),
      `# Design\n\n## Component Registry\nfoo\n\n## Brand Rules\nbar\n`
    );
    const ctx = newContext();
    ctx.inputs.designMdExists = true;
    ctx.inputs.tokensJsonExists = true;
    ctx.inputs.componentRegistryExists = true;
    ctx.inputs.brandRulesExist = true;
    await runFill({ projectRoot: tmpDir, context: ctx, mode: 'fast' });
    expect(ctx.bootstrapped.designMd).toBe(false);
    expect(ctx.bootstrapped.tokensJson).toBe(false);
    expect(ctx.bootstrapped.componentRegistry).toBe(false);
    expect(ctx.bootstrapped.brandRules).toBe(false);
    // tokens.json unmodified
    const tok = fs.readFileSync(path.join(tmpDir, 'design-system', 'tokens.json'), 'utf-8');
    expect(tok).toBe('{ "real": "tokens" }');
  });

  it('invokes design-craft critique and pushes findings to craftFindings', async () => {
    const ctx = newContext();
    await runFill({ projectRoot: tmpDir, context: ctx, mode: 'fast' });
    expect(ctx.verifiersRun).toContain('design-craft-critique');
    expect(ctx.craftFindings).toEqual([]);
    expect(ctx.craftSuggestions).toBe(0);
  });
});
