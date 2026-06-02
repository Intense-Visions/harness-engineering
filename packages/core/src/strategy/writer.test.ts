import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { StrategyDoc } from '@harness-engineering/types';
import { writeStrategyDoc } from './writer';
import { validateStrategy } from '../validation/strategy';

function sampleDoc(overrides: Partial<StrategyDoc> = {}): StrategyDoc {
  return {
    frontmatter: {
      name: 'Acme',
      last_updated: '2026-06-02',
      version: 1,
      ...overrides.frontmatter,
    },
    sections: overrides.sections ?? [
      { name: 'Target problem', body: 'Engineering teams ship without a strategic anchor.' },
      { name: 'Our approach', body: 'Force the upstream conversation into a small, durable doc.' },
      {
        name: "Who it's for",
        body: 'Mid-size eng orgs that already run a roadmap and need the why.',
      },
      {
        name: 'Key metrics',
        body: '- Activation rate: % new projects with STRATEGY.md within 7 days',
      },
      { name: 'Tracks', body: '- Strategic anchor: ship STRATEGY.md + harness-strategy skill' },
    ],
  };
}

describe('writeStrategyDoc', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-writer-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes STRATEGY.md in the supplied cwd', () => {
    writeStrategyDoc(sampleDoc(), { cwd: tmpDir });
    const target = path.join(tmpDir, 'STRATEGY.md');
    expect(fs.existsSync(target)).toBe(true);
    const raw = fs.readFileSync(target, 'utf-8');
    expect(raw).toMatch(/^---\nname: Acme\n/);
    expect(raw).toMatch(/## Target problem/);
  });

  it('produces a file that passes validateStrategy', async () => {
    writeStrategyDoc(sampleDoc(), { cwd: tmpDir });
    const result = await validateStrategy(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.present).toBe(true);
      expect(result.value.valid).toBe(true);
    }
  });

  it('rejects schema-invalid docs without touching disk', () => {
    const bad = sampleDoc({
      sections: [
        { name: 'Target problem', body: '' }, // empty body fails schema
        { name: 'Our approach', body: 'ok' },
        { name: "Who it's for", body: 'ok' },
        { name: 'Key metrics', body: '- m' },
        { name: 'Tracks', body: '- t' },
      ],
    });
    expect(() => writeStrategyDoc(bad, { cwd: tmpDir })).toThrow();
    expect(fs.existsSync(path.join(tmpDir, 'STRATEGY.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'STRATEGY.md.bak'))).toBe(false);
  });

  it('writes a .bak on first overwrite, preserving the pre-strategy contents', () => {
    const original = '# Original strategy\n\nUntouched user content.\n';
    fs.writeFileSync(path.join(tmpDir, 'STRATEGY.md'), original, 'utf-8');

    writeStrategyDoc(sampleDoc(), { cwd: tmpDir });

    const bak = path.join(tmpDir, 'STRATEGY.md.bak');
    expect(fs.existsSync(bak)).toBe(true);
    expect(fs.readFileSync(bak, 'utf-8')).toBe(original);
  });

  it('is idempotent: re-running does NOT clobber an existing .bak', () => {
    const original = '# v0\n\nOriginal user content.\n';
    fs.writeFileSync(path.join(tmpDir, 'STRATEGY.md'), original, 'utf-8');

    writeStrategyDoc(sampleDoc(), { cwd: tmpDir });
    const bakAfterFirst = fs.readFileSync(path.join(tmpDir, 'STRATEGY.md.bak'), 'utf-8');

    // Mutate the bumped doc and run again — .bak must still point at the
    // original pre-strategy file, not the intermediate result.
    const bumped = sampleDoc({
      frontmatter: { name: 'Acme', last_updated: '2026-06-03', version: 2 },
    });
    writeStrategyDoc(bumped, { cwd: tmpDir });

    const bakAfterSecond = fs.readFileSync(path.join(tmpDir, 'STRATEGY.md.bak'), 'utf-8');
    expect(bakAfterSecond).toBe(bakAfterFirst);
    expect(bakAfterSecond).toBe(original);
  });

  it('respects skipBackup: true and writes no .bak', () => {
    const original = '# Original\n\nbody\n';
    fs.writeFileSync(path.join(tmpDir, 'STRATEGY.md'), original, 'utf-8');

    writeStrategyDoc(sampleDoc(), { cwd: tmpDir, skipBackup: true });

    expect(fs.existsSync(path.join(tmpDir, 'STRATEGY.md.bak'))).toBe(false);
  });

  it('preserves an existing custom H1 on overwrite', () => {
    const original = [
      '---',
      'name: Acme',
      'last_updated: "2026-05-01"',
      'version: 1',
      '---',
      '',
      '# Acme — Engineering Strategy',
      '',
      '## Target problem',
      '',
      'old content',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, 'STRATEGY.md'), original, 'utf-8');

    writeStrategyDoc(sampleDoc(), { cwd: tmpDir });

    const rewritten = fs.readFileSync(path.join(tmpDir, 'STRATEGY.md'), 'utf-8');
    expect(rewritten).toMatch(/# Acme — Engineering Strategy/);
    expect(rewritten).not.toMatch(/# Acme Strategy\b/);
  });

  it('uses the default `# <name> Strategy` H1 on greenfield create', () => {
    writeStrategyDoc(sampleDoc(), { cwd: tmpDir });
    const raw = fs.readFileSync(path.join(tmpDir, 'STRATEGY.md'), 'utf-8');
    expect(raw).toMatch(/\n# Acme Strategy\n/);
  });

  it('leaves no .tmp-<pid> file lingering after a successful write', () => {
    writeStrategyDoc(sampleDoc(), { cwd: tmpDir });
    const entries = fs.readdirSync(tmpDir);
    const tmpEntries = entries.filter((e) => e.startsWith('STRATEGY.md.tmp-'));
    expect(tmpEntries).toHaveLength(0);
  });
});
