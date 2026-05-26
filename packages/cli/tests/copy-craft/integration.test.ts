import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCopyCraft, critiqueCopyInFile } from '../../src/copy-craft';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';

describe('runCopyCraft (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-craft-int-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('empty project: zero findings, both git surfaces skip', async () => {
    const out = await runCopyCraft({
      path: tmpDir,
      surfaces: ['error', 'log', 'commit', 'pr-description'],
    });
    expect(out.findings).toEqual([]);
    // commit skip is guaranteed; pr-description may skip on gh-missing OR
    // succeed if gh is locally authenticated for some other repo (unlikely
    // for the tmpDir scope, but be tolerant)
    const commitSkipped = out.summary.skippedSurfaces.find((s) => s.surface === 'commit');
    expect(commitSkipped).toBeDefined();
    expect(commitSkipped!.reason).toContain('not a git repo');
  });

  it('walks source files and emits findings via mock provider', async () => {
    writeFile('src/parse.ts', `throw new Error("parse error");\n`);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'parse error',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"medium","message":"too generic"}\n```',
      },
    ]);
    const out = await runCopyCraft({
      path: tmpDir,
      surfaces: ['error'],
      __testProvider: provider,
    });
    expect(out.summary.counts.error).toBe(1);
    expect(out.findings.length).toBeGreaterThanOrEqual(1);
    expect(out.findings[0].target.surface).toBe('error');
  });

  it('extracts both errors and logs from the same file in one walk', async () => {
    writeFile('src/x.ts', `throw new Error("e");\nconsole.log("l");\n`);
    const out = await runCopyCraft({
      path: tmpDir,
      surfaces: ['error', 'log'],
    });
    expect(out.summary.counts.error).toBeGreaterThanOrEqual(1);
    expect(out.summary.counts.log).toBeGreaterThanOrEqual(1);
  });

  it('honors --surfaces filter (only errors)', async () => {
    writeFile('src/x.ts', `throw new Error("e");\nconsole.log("l");\n`);
    const out = await runCopyCraft({ path: tmpDir, surfaces: ['error'] });
    expect(out.summary.counts.error).toBeGreaterThanOrEqual(1);
    expect(out.summary.counts.log).toBe(0);
  });

  it('records skippedSurfaces with reasons (commit on non-git)', async () => {
    const out = await runCopyCraft({ path: tmpDir, surfaces: ['commit'] });
    expect(out.summary.skippedSurfaces).toEqual([{ surface: 'commit', reason: 'not a git repo' }]);
  });

  it('emits CopyFinding with all 3 axes present (ADR 0019)', async () => {
    writeFile('src/x.ts', `throw new Error("oops");\n`);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'oops',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"low","message":"vague"}\n```',
      },
    ]);
    const out = await runCopyCraft({
      path: tmpDir,
      surfaces: ['error'],
      __testProvider: provider,
    });
    const f = out.findings[0];
    expect(f.tier).toBe('polish');
    expect(f.impact).toBe('medium');
    expect(f.confidence).toBe('low');
    expect(f.cite.rubricId).toMatch(/^COPY-R/);
  });

  it('cross-cutting critiqueCopyInFile works on a single file (source surfaces)', async () => {
    writeFile('src/x.ts', `console.log("hi");\n`);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'hi',
        response:
          '```json\n{"tier":"polish","impact":"small","confidence":"medium","message":"ok"}\n```',
      },
    ]);
    const findings = await critiqueCopyInFile(path.join(tmpDir, 'src/x.ts'), {
      surfaces: ['log'],
      provider,
    });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });
});
