import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runDetectDrift } from '../../../src/drift';

describe('runDetectDrift (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-int-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relPath: string, content: string): void {
    const full = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('returns empty findings + meta.tokensLoaded=false when no tokens/registry exist', async () => {
    writeFile('src/X.tsx', `export const X = () => <button>hi</button>;`);
    const out = await runDetectDrift({ path: tmpDir });
    expect(out.findings).toHaveLength(0);
    expect(out.meta.tokensLoaded).toBe(false);
    expect(out.meta.registryLoaded).toBe(false);
    expect(out.catalog.rulesApplied).toEqual([]);
  });

  it('detects token bypass when tokens.json exists', async () => {
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({
        color: { brand: { $type: 'color', $value: '#0066cc' } },
      })
    );
    writeFile('src/Card.ts', `const c = { color: "#ff0000" };`);

    const out = await runDetectDrift({ path: tmpDir });
    expect(out.meta.tokensLoaded).toBe(true);
    expect(out.catalog.rulesApplied).toContain('token-bypass');
    const hexFindings = out.findings.filter((f) => f.code === 'DRIFT-T001');
    expect(hexFindings).toHaveLength(1);
    expect(hexFindings[0].file).toContain('Card.ts');
  });

  it('detects primitive adoption when DESIGN.md registry exists', async () => {
    writeFile(
      'design-system/DESIGN.md',
      `## Component Registry\n\n| Type | File |\n|------|------|\n| Button | b.tsx |\n`
    );
    writeFile('src/Save.tsx', `export const S = () => <button>Save</button>;`);

    const out = await runDetectDrift({ path: tmpDir });
    expect(out.meta.registryLoaded).toBe(true);
    expect(out.catalog.rulesApplied).toContain('primitive-adoption');
    const primFindings = out.findings.filter((f) => f.code === 'DRIFT-P001');
    expect(primFindings).toHaveLength(1);
  });

  it('aggregates summary.bySeverity and summary.byCode correctly', async () => {
    writeFile('design-system/tokens.json', JSON.stringify({ color: {} }));
    writeFile(
      'design-system/DESIGN.md',
      `## Component Registry\n\n| Type | File |\n|------|------|\n| Button | b.tsx |\n`
    );
    writeFile('src/A.tsx', `const a = "#aabbcc"; export const A = () => <button>x</button>;`);

    const out = await runDetectDrift({ path: tmpDir });
    expect(out.summary.totalFiles).toBeGreaterThanOrEqual(1);
    expect(out.summary.bySeverity.error).toBeGreaterThanOrEqual(1); // T001 + P001 both error in standard
    expect(out.summary.byCode['DRIFT-T001']).toBe(1);
    expect(out.summary.byCode['DRIFT-P001']).toBe(1);
    expect(out.summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('honors the files arg (scans only those files)', async () => {
    writeFile('design-system/tokens.json', JSON.stringify({ color: {} }));
    writeFile('src/A.tsx', `const a = "#aabbcc";`);
    writeFile('src/B.tsx', `const b = "#112233";`);

    const out = await runDetectDrift({ path: tmpDir, files: ['src/A.tsx'] });
    const filesScanned = new Set(out.findings.map((f) => f.file));
    expect([...filesScanned].every((f) => f.endsWith('A.tsx'))).toBe(true);
  });

  it('rules.tokenBypass=false disables that rule entirely', async () => {
    writeFile('design-system/tokens.json', JSON.stringify({ color: {} }));
    writeFile('src/A.tsx', `const a = "#aabbcc";`);

    const out = await runDetectDrift({
      path: tmpDir,
      rules: { tokenBypass: false },
    });
    expect(out.findings.filter((f) => f.code.startsWith('DRIFT-T'))).toHaveLength(0);
    expect(out.catalog.rulesApplied).not.toContain('token-bypass');
  });
});
