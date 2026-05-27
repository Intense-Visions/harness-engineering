import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runAlignDesignSystem } from '../../../src/align';
import { LAST_BATCH_PATH } from '../../../src/align/revert/state';

describe('runAlignDesignSystem --revert (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'align-revert-int-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  function readFile(rel: string): string {
    return fs.readFileSync(path.join(tmpDir, rel), 'utf-8');
  }

  function setupT001Fixture(): string {
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({
        color: { brand: { primary: { $type: 'color', $value: '#ff0000' } } },
      })
    );
    const original = `import { tokens } from '@/design-system/tokens';\nconst c = { color: "#ff0000" };\n`;
    writeFile('src/Card.ts', original);
    return original;
  }

  it('apply then revert restores the file to its original content', async () => {
    const original = setupT001Fixture();

    const applyOut = await runAlignDesignSystem({ path: tmpDir });
    expect(applyOut.summary.applied).toBe(1);
    expect(readFile('src/Card.ts')).not.toBe(original);
    expect(fs.existsSync(path.join(tmpDir, LAST_BATCH_PATH))).toBe(true);

    const revertOut = await runAlignDesignSystem({ path: tmpDir, revert: true });
    expect(revertOut.meta.revert).toBe(true);
    expect(revertOut.summary.applied).toBe(1);
    expect(revertOut.summary.skipped).toBe(0);
    expect(revertOut.summary.failed).toBe(0);
    expect(revertOut.summary.filesModified).toBe(1);
    expect(readFile('src/Card.ts')).toBe(original);
  });

  it('returns an empty revert run when no last-batch is recorded', async () => {
    const out = await runAlignDesignSystem({ path: tmpDir, revert: true });
    expect(out.meta.revert).toBe(true);
    expect(out.outcomes).toEqual([]);
    expect(out.summary.applied).toBe(0);
    expect(out.summary.filesModified).toBe(0);
  });

  it('skips revert with a hash-mismatch reason when the file was edited externally', async () => {
    setupT001Fixture();
    await runAlignDesignSystem({ path: tmpDir });

    // Simulate external edit between apply and revert (a real user edit).
    writeFile(
      'src/Card.ts',
      `import { tokens } from '@/design-system/tokens';\nconst c = { color: tokens.color.brand.primary, other: 1 };\n`
    );
    const tampered = readFile('src/Card.ts');

    const out = await runAlignDesignSystem({ path: tmpDir, revert: true });
    expect(out.meta.revert).toBe(true);
    expect(out.summary.applied).toBe(0);
    expect(out.summary.skipped).toBe(1);
    expect(out.summary.filesModified).toBe(0);
    expect(readFile('src/Card.ts')).toBe(tampered);

    const skipped = out.outcomes.find((o) => o.kind === 'skipped-unsafe');
    expect(skipped?.kind).toBe('skipped-unsafe');
    if (skipped?.kind === 'skipped-unsafe') {
      expect(skipped.reason).toMatch(/changed externally|content hash mismatch/i);
    }
  });

  it('--revert --dry-run computes the inverse without writing', async () => {
    const original = setupT001Fixture();
    await runAlignDesignSystem({ path: tmpDir });
    const afterApply = readFile('src/Card.ts');

    const out = await runAlignDesignSystem({ path: tmpDir, revert: true, dryRun: true });
    expect(out.meta.revert).toBe(true);
    expect(out.meta.dryRun).toBe(true);
    expect(out.summary.applied).toBe(1);
    // disk untouched — still in post-apply state
    expect(readFile('src/Card.ts')).toBe(afterApply);
    expect(readFile('src/Card.ts')).not.toBe(original);
  });

  it('a second revert on the same batch is a no-op (idempotent)', async () => {
    const original = setupT001Fixture();
    await runAlignDesignSystem({ path: tmpDir });

    const first = await runAlignDesignSystem({ path: tmpDir, revert: true });
    expect(first.summary.applied).toBe(1);
    expect(readFile('src/Card.ts')).toBe(original);

    const second = await runAlignDesignSystem({ path: tmpDir, revert: true });
    expect(second.summary.applied).toBe(0);
    // Content-hash mismatch (now equals `before`, not the recorded `after`)
    // gets reported as skipped-unsafe.
    expect(second.summary.skipped).toBe(1);
    expect(readFile('src/Card.ts')).toBe(original);
  });

  it('does not persist a batch when dry-run wrote no files', async () => {
    setupT001Fixture();
    await runAlignDesignSystem({ path: tmpDir, dryRun: true });
    expect(fs.existsSync(path.join(tmpDir, LAST_BATCH_PATH))).toBe(false);
  });
});
