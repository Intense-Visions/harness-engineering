import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAlignDesignSystem } from '../../src/align';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'align-cov-'));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function writeHandoff(driftFindings: unknown[]): void {
  const p = path.join(tmp, '.harness', 'handoff.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ pipeline: { driftFindings } }));
}

function finding(code: string, file: string, line = 1): Record<string, unknown> {
  return {
    code,
    severity: 'error',
    file,
    line,
    message: `${code} finding`,
    evidence: { snippet: '' },
    rule: { id: code, category: 'token-bypass' },
    fix: { kind: 'codemod-todo', description: 'fix it' },
  };
}

describe('runAlignDesignSystem — pipeline mode', () => {
  it('returns an empty result when the handoff file is missing', async () => {
    const out = await runAlignDesignSystem({ path: tmp, mode: 'pipeline' });
    expect(out.meta.mode).toBe('pipeline');
    expect(out.summary.totalFindings).toBe(0);
  });

  it('tolerates an invalid handoff JSON and still writes a fixesApplied array', async () => {
    const p = path.join(tmp, '.harness', 'handoff.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '{ not valid json');

    const out = await runAlignDesignSystem({ path: tmp, mode: 'pipeline' });
    expect(out.summary.totalFindings).toBe(0);
    // writePipelineFixesApplied re-reads the same invalid handoff, resets to {}
    const handoff = JSON.parse(fs.readFileSync(p, 'utf-8'));
    expect(Array.isArray(handoff.pipeline.fixesApplied)).toBe(true);
  });

  it('emits a suggestion for a DRIFT-T004 finding without reading the file', async () => {
    writeHandoff([finding('DRIFT-T004', path.join(tmp, 'does-not-exist.ts'))]);
    const out = await runAlignDesignSystem({ path: tmp, mode: 'pipeline' });
    expect(out.summary.suggestions).toBe(1);
    expect(out.outcomes[0]!.kind).toBe('suggestion');
    expect(out.catalog.suggestionsEmitted).toContain('DRIFT-T004');
  });

  it('emits a suggestion for a DRIFT-P finding', async () => {
    writeHandoff([finding('DRIFT-P001', path.join(tmp, 'nope.tsx'))]);
    const out = await runAlignDesignSystem({ path: tmp, mode: 'pipeline' });
    expect(out.summary.suggestions).toBe(1);
    expect(out.catalog.suggestionsEmitted).toContain('DRIFT-P001');
  });

  it('records a failed outcome when a codemod finding points at a missing file', async () => {
    writeHandoff([finding('DRIFT-T001', path.join(tmp, 'ghost.ts'))]);
    const out = await runAlignDesignSystem({ path: tmp, mode: 'pipeline' });
    expect(out.summary.failed).toBe(1);
    const failed = out.outcomes[0]!;
    expect(failed.kind).toBe('failed');
    if (failed.kind === 'failed') {
      expect(failed.error).toContain('cannot read source file');
    }
  });

  it('honors fixBatch, skipping findings whose key is not in the batch', async () => {
    const fileA = path.join(tmp, 'a.ts');
    const fileB = path.join(tmp, 'b.ts');
    writeHandoff([finding('DRIFT-T004', fileA, 3), finding('DRIFT-T004', fileB, 7)]);
    const keyA = `DRIFT-T004@${fileA}:3`;

    const out = await runAlignDesignSystem({ path: tmp, mode: 'pipeline', fixBatch: [keyA] });
    // Only the batched finding is processed.
    expect(out.summary.totalFindings).toBe(1);
    expect(out.outcomes[0]!.finding.file).toBe(fileA);
  });

  it('merges fixesApplied into an existing handoff that carries other keys', async () => {
    const p = path.join(tmp, '.harness', 'handoff.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
      p,
      JSON.stringify({
        pipeline: { driftFindings: [finding('DRIFT-T004', path.join(tmp, 'z.ts'))] },
        other: 'kept',
      })
    );
    const out = await runAlignDesignSystem({ path: tmp, mode: 'pipeline' });
    expect(out.summary.suggestions).toBe(1);
    const handoff = JSON.parse(fs.readFileSync(p, 'utf-8'));
    expect(handoff.other).toBe('kept');
    expect(handoff.pipeline.fixesApplied.length).toBe(1);
  });
});

describe('runAlignDesignSystem — revert with no recorded batch', () => {
  it('produces an empty revert result flagged in meta', async () => {
    const out = await runAlignDesignSystem({ path: tmp, revert: true });
    expect(out.summary.totalFindings).toBe(0);
    expect(out.meta.revert).toBe(true);
  });
});
