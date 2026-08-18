/**
 * In-session two-step flow for security-craft (issue #1368 follow-up).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  runSecurityCraft,
  collectSecurityCraftPrompts,
  finalizeSecurityCraft,
} from '../../src/security-craft';
import { InSessionLlmProvider } from '../../src/shared/craft/llm/provider';

const VULN = `import * as child_process from 'child_process';
export function run(req, res) {
  child_process.exec(req.body.cmd, () => res.json({}));
}
`;

describe('security-craft in-session two-step flow', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-craft-insession-'));
    const full = path.join(tmpDir, 'packages/api/src/run.ts');
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, VULN);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inline entry throws a loud two-step guard under the in-session provider', async () => {
    await expect(
      runSecurityCraft({ path: tmpDir, __testProvider: new InSessionLlmProvider() })
    ).rejects.toThrow(/two-step flow/);
  });

  it('collect returns a runId and non-empty prompts', async () => {
    const collected = await collectSecurityCraftPrompts({ path: tmpDir });
    expect(collected.status).toBe('collected');
    expect(collected.runId).toBeTruthy();
    expect(collected.pendingPrompts.length).toBeGreaterThan(0);
  });

  it('round-trips collect → finalize into parsed findings', async () => {
    const collected = await collectSecurityCraftPrompts({ path: tmpDir });
    const responses = collected.pendingPrompts.map((p, i) => ({
      promptId: p.promptId,
      raw:
        i === 0
          ? '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"validate the command input"}\n```'
          : '```json\nnull\n```',
    }));
    const out = await finalizeSecurityCraft({ path: tmpDir, runId: collected.runId, responses });
    expect(out.findings.length).toBeGreaterThanOrEqual(1);
    expect(out.summary.runId).toBe(collected.runId);
    expect(out.summary.llmCalls.provider).toBe('in-session');
    expect(out.summary.counts.signalsDetected).toBeGreaterThan(0);
  });

  it('finalize with a missing runId throws a clear error', async () => {
    await expect(
      finalizeSecurityCraft({ path: tmpDir, runId: 'does-not-exist', responses: [] })
    ).rejects.toThrow(/no persisted run/);
  });
});
