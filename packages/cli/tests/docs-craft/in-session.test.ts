/**
 * In-session two-step flow for docs-craft (issue #1368 follow-up).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runDocsCraft, collectDocsCraftPrompts, finalizeDocsCraft } from '../../src/docs-craft';
import { InSessionLlmProvider } from '../../src/shared/craft/llm/provider';

describe('docs-craft in-session two-step flow', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-craft-insession-'));
    const full = path.join(tmpDir, 'docs/guides/intro.md');
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '# Intro\n\nThe system supports X, Y, and Z.\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inline entry throws a loud two-step guard under the in-session provider', async () => {
    await expect(
      runDocsCraft({ path: tmpDir, __testProvider: new InSessionLlmProvider() })
    ).rejects.toThrow(/two-step flow/);
  });

  it('collect returns a runId and non-empty prompts', async () => {
    const collected = await collectDocsCraftPrompts({ path: tmpDir });
    expect(collected.status).toBe('collected');
    expect(collected.runId).toBeTruthy();
    expect(collected.pendingPrompts.length).toBeGreaterThan(0);
  });

  it('round-trips collect → finalize into parsed findings', async () => {
    const collected = await collectDocsCraftPrompts({ path: tmpDir });
    const responses = collected.pendingPrompts.map((p, i) => ({
      promptId: p.promptId,
      raw:
        i === 0
          ? '```json\n{"tier":"polish","impact":"medium","confidence":"high","message":"add a runnable example"}\n```'
          : '```json\nnull\n```',
    }));
    const out = await finalizeDocsCraft({ path: tmpDir, runId: collected.runId, responses });
    expect(out.findings.length).toBeGreaterThanOrEqual(1);
    expect(out.summary.runId).toBe(collected.runId);
    expect(out.summary.llmCalls.provider).toBe('in-session');
    expect(out.findings[0]!.target.relative).toContain('intro.md');
  });

  it('finalize with a missing runId throws a clear error', async () => {
    await expect(
      finalizeDocsCraft({ path: tmpDir, runId: 'does-not-exist', responses: [] })
    ).rejects.toThrow(/no persisted run/);
  });
});
