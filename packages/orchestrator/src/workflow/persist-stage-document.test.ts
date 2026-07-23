import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { persistStageDocumentFactory } from './orchestrator-context';
import type { Issue } from '@harness-engineering/types';
import type { WorkflowStep } from '@harness-engineering/types';

const logger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Parameters<typeof persistStageDocumentFactory>[2];

const issue = { id: 'i1', identifier: 'e2e-222-prefer-execfile-rule' } as unknown as Issue;

const step = (produces: string): WorkflowStep => ({ skill: 'harness-x', produces }) as WorkflowStep;
const run = (produces: string, output?: string) => ({
  index: 0,
  step: step(produces),
  outcome: 'pass' as const,
  ...(output !== undefined ? { output } : {}),
});

let ws: string;
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-doc-'));
});
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }));

describe('persistStageDocumentFactory', () => {
  it('writes a spec stage output to docs/changes/<slug>/proposal.md', async () => {
    const persist = persistStageDocumentFactory(ws, issue, logger);
    await persist(step('spec'), run('spec', '# Spec\n\nThe design.'));
    const p = path.join(ws, 'docs', 'changes', 'e2e-222-prefer-execfile-rule', 'proposal.md');
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, 'utf8')).toContain('The design.');
  });

  it('writes a plan stage output under plans/', async () => {
    const persist = persistStageDocumentFactory(ws, issue, logger);
    await persist(step('plan'), run('plan', '# Plan\n\n1. do it'));
    const p = path.join(
      ws,
      'docs',
      'changes',
      'e2e-222-prefer-execfile-rule',
      'plans',
      'e2e-222-prefer-execfile-rule-plan.md'
    );
    expect(fs.existsSync(p)).toBe(true);
  });

  it('is a no-op for a non-document stage (impl)', async () => {
    const persist = persistStageDocumentFactory(ws, issue, logger);
    await persist(step('impl'), run('impl', 'some code output'));
    expect(fs.existsSync(path.join(ws, 'docs', 'changes'))).toBe(false);
  });

  it('is a no-op for empty/whitespace output', async () => {
    const persist = persistStageDocumentFactory(ws, issue, logger);
    await persist(step('spec'), run('spec', '   \n  '));
    expect(fs.existsSync(path.join(ws, 'docs', 'changes'))).toBe(false);
  });

  it('does NOT clobber a doc the model already wrote (non-empty file preserved)', async () => {
    const persist = persistStageDocumentFactory(ws, issue, logger);
    const p = path.join(ws, 'docs', 'changes', 'e2e-222-prefer-execfile-rule', 'proposal.md');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'MODEL-AUTHORED SPEC');
    await persist(step('spec'), run('spec', 'fallback output'));
    expect(fs.readFileSync(p, 'utf8')).toBe('MODEL-AUTHORED SPEC');
  });

  it('fills a missing/empty file when the model left it blank', async () => {
    const persist = persistStageDocumentFactory(ws, issue, logger);
    const p = path.join(ws, 'docs', 'changes', 'e2e-222-prefer-execfile-rule', 'proposal.md');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '   '); // model created an empty stub
    await persist(step('spec'), run('spec', 'real captured spec'));
    expect(fs.readFileSync(p, 'utf8')).toContain('real captured spec');
  });
});
