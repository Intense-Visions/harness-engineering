import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runAuditBrand } from '../../../src/brand';

describe('runAuditBrand (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-int-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('returns no findings + meta flags false when neither input is present', async () => {
    writeFile('src/X.tsx', `export const X = () => <p>Hello</p>;`);
    const out = await runAuditBrand({ path: tmpDir });
    expect(out.findings).toHaveLength(0);
    expect(out.meta.designMdLoaded).toBe(false);
    expect(out.meta.brandTokensLoaded).toBe(false);
    expect(out.catalog.rulesApplied).toEqual([]);
  });

  it('fires BRAND-V001 when DESIGN.md voice.forbidden_phrases is present', async () => {
    writeFile(
      'design-system/DESIGN.md',
      `## Brand Rules\n\n### Voice\n\nforbidden_phrases:\n  - "click here"\n`
    );
    writeFile('src/X.tsx', `export const X = () => <p>Click here</p>;`);

    const out = await runAuditBrand({ path: tmpDir });
    expect(out.meta.designMdLoaded).toBe(true);
    expect(out.catalog.rulesApplied).toContain('forbidden-phrases');
    const v = out.findings.filter((f) => f.code === 'BRAND-V001');
    expect(v).toHaveLength(1);
  });

  it('fires BRAND-T001 when token used in forbidden context', async () => {
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({
        color: {
          brand: {
            '500': {
              $type: 'color',
              $value: '#3b82f6',
              $extensions: {
                harness: {
                  brand: {
                    role: 'primary',
                    approved_contexts: ['cta'],
                    forbidden_contexts: ['data-visualization'],
                  },
                },
              },
            },
          },
        },
      })
    );
    writeFile('src/Chart.ts', `// data-visualization color\nconst c = tokens.color.brand.500;\n`);

    const out = await runAuditBrand({ path: tmpDir });
    expect(out.meta.brandTokensLoaded).toBe(true);
    expect(out.catalog.rulesApplied).toContain('token-misuse');
    const t = out.findings.filter((f) => f.code === 'BRAND-T001');
    expect(t).toHaveLength(1);
  });

  it('aggregates summary.bySeverity and summary.byCode correctly', async () => {
    writeFile(
      'design-system/DESIGN.md',
      `## Brand Rules\n\n### Voice\n\nforbidden_phrases:\n  - "click here"\n`
    );
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({
        color: {
          brand: {
            '500': {
              $type: 'color',
              $value: '#3b82f6',
              $extensions: {
                harness: { brand: { forbidden_contexts: ['data-visualization'] } },
              },
            },
          },
        },
      })
    );
    writeFile(
      'src/Chart.tsx',
      `// data-visualization\nexport const X = () => { const c = tokens.color.brand.500; return <p>Click here</p>; };\n`
    );

    const out = await runAuditBrand({ path: tmpDir });
    expect(out.summary.bySeverity.error).toBe(1); // T001
    expect(out.summary.bySeverity.warn).toBe(1); // V001
    expect(out.summary.byCode['BRAND-T001']).toBe(1);
    expect(out.summary.byCode['BRAND-V001']).toBe(1);
  });

  it('rules.voice=false disables forbidden-phrases', async () => {
    writeFile(
      'design-system/DESIGN.md',
      `## Brand Rules\n\n### Voice\n\nforbidden_phrases:\n  - "click here"\n`
    );
    writeFile('src/X.tsx', `export const X = () => <p>Click here</p>;`);

    const out = await runAuditBrand({ path: tmpDir, rules: { voice: false } });
    expect(out.findings.filter((f) => f.code.startsWith('BRAND-V'))).toHaveLength(0);
    expect(out.catalog.rulesApplied).not.toContain('forbidden-phrases');
  });
});
