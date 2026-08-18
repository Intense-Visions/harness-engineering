/**
 * In-session two-step flow for knowledge-craft (issue #1368 follow-up).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  runKnowledgeCraft,
  collectKnowledgeCraftPrompts,
  finalizeKnowledgeCraft,
} from '../../src/knowledge-craft';
import { InSessionLlmProvider } from '../../src/shared/craft/llm/provider';

describe('knowledge-craft in-session two-step flow', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-craft-insession-'));
    const full = path.join(tmpDir, 'docs/knowledge/auth/email-validator.md');
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(
      full,
      '# Email Validator\n\nThe user service validates emails via the EmailValidator class.\n'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inline entry throws a loud two-step guard under the in-session provider', async () => {
    await expect(
      runKnowledgeCraft({ path: tmpDir, __testProvider: new InSessionLlmProvider() })
    ).rejects.toThrow(/two-step flow/);
  });

  it('collect returns a runId and non-empty prompts', async () => {
    const collected = await collectKnowledgeCraftPrompts({ path: tmpDir });
    expect(collected.status).toBe('collected');
    expect(collected.runId).toBeTruthy();
    expect(collected.pendingPrompts.length).toBeGreaterThan(0);
  });

  it('round-trips collect → finalize into parsed findings', async () => {
    const collected = await collectKnowledgeCraftPrompts({ path: tmpDir });
    const responses = collected.pendingPrompts.map((p, i) => ({
      promptId: p.promptId,
      raw:
        i === 0
          ? '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"state the load-bearing fact"}\n```'
          : '```json\nnull\n```',
    }));
    const out = await finalizeKnowledgeCraft({ path: tmpDir, runId: collected.runId, responses });
    expect(out.findings.length).toBeGreaterThanOrEqual(1);
    expect(out.summary.runId).toBe(collected.runId);
    expect(out.summary.llmCalls.provider).toBe('in-session');
    expect(out.findings[0]!.target.relative).toContain('email-validator.md');
  });

  it('finalize with a missing runId throws a clear error', async () => {
    await expect(
      finalizeKnowledgeCraft({ path: tmpDir, runId: 'does-not-exist', responses: [] })
    ).rejects.toThrow(/no persisted run/);
  });
});
