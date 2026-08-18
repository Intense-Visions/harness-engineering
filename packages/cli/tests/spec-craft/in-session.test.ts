/**
 * In-session two-step flow for spec-craft (issue #1368 follow-up).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runSpecCraft, collectSpecCraftPrompts, finalizeSpecCraft } from '../../src/spec-craft';
import { InSessionLlmProvider } from '../../src/shared/craft/llm/provider';

const PROPOSAL = `# Feature X

## Decisions

Vague decision that does not explain the trade-offs considered.
`;

describe('spec-craft in-session two-step flow', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-craft-insession-'));
    const full = path.join(tmpDir, 'docs/changes/feature-x/proposal.md');
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, PROPOSAL);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inline entry throws a loud two-step guard under the in-session provider', async () => {
    await expect(
      runSpecCraft({ path: tmpDir, __testProvider: new InSessionLlmProvider() })
    ).rejects.toThrow(/two-step flow/);
  });

  it('collect returns a runId and non-empty prompts', async () => {
    const collected = await collectSpecCraftPrompts({ path: tmpDir });
    expect(collected.status).toBe('collected');
    expect(collected.runId).toBeTruthy();
    expect(collected.pendingPrompts.length).toBeGreaterThan(0);
  });

  it('round-trips collect → finalize into parsed findings', async () => {
    const collected = await collectSpecCraftPrompts({ path: tmpDir });
    const responses = collected.pendingPrompts.map((p, i) => ({
      promptId: p.promptId,
      raw:
        i === 0
          ? '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"record the alternatives weighed"}\n```'
          : '```json\nnull\n```',
    }));
    const out = await finalizeSpecCraft({ path: tmpDir, runId: collected.runId, responses });
    expect(out.findings.length).toBeGreaterThanOrEqual(1);
    expect(out.summary.runId).toBe(collected.runId);
    expect(out.summary.llmCalls.provider).toBe('in-session');
    expect(out.summary.sectionsScanned).toBeGreaterThan(0);
  });

  it('finalize with a missing runId throws a clear error', async () => {
    await expect(
      finalizeSpecCraft({ path: tmpDir, runId: 'does-not-exist', responses: [] })
    ).rejects.toThrow(/no persisted run/);
  });
});
