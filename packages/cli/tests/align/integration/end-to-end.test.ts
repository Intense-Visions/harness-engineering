import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runAlignDesignSystem } from '../../../src/align';

describe('runAlignDesignSystem (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'align-int-'));
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

  it('applies a T001 codemod end-to-end (detect -> classify -> apply -> write)', async () => {
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({
        color: { brand: { primary: { $type: 'color', $value: '#ff0000' } } },
      })
    );
    writeFile(
      'src/Card.ts',
      `import { tokens } from '@/design-system/tokens';\nconst c = { color: "#ff0000" };\n`
    );

    const out = await runAlignDesignSystem({ path: tmpDir });

    expect(out.summary.applied).toBe(1);
    expect(out.summary.suggestions).toBe(0);
    expect(out.summary.filesModified).toBe(1);
    expect(out.catalog.codemodApplied).toContain('DRIFT-T001');
    expect(readFile('src/Card.ts')).toContain('tokens.color.brand.primary');
    expect(readFile('src/Card.ts')).not.toContain('"#ff0000"');
  });

  it('emits a suggestion when token import is missing', async () => {
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({
        color: { brand: { primary: { $type: 'color', $value: '#ff0000' } } },
      })
    );
    writeFile('src/Card.ts', `const c = { color: "#ff0000" };\n`);

    const out = await runAlignDesignSystem({ path: tmpDir });

    expect(out.summary.applied).toBe(0);
    expect(out.summary.suggestions).toBe(1);
    expect(out.summary.filesModified).toBe(0);
    // file unchanged
    expect(readFile('src/Card.ts')).toBe(`const c = { color: "#ff0000" };\n`);
  });

  it('dry-run computes diff without writing', async () => {
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({
        color: { brand: { primary: { $type: 'color', $value: '#ff0000' } } },
      })
    );
    const orig = `import { tokens } from '@/design-system/tokens';\nconst c = { color: "#ff0000" };\n`;
    writeFile('src/Card.ts', orig);

    const out = await runAlignDesignSystem({ path: tmpDir, dryRun: true });

    expect(out.summary.applied).toBe(1);
    expect(out.meta.dryRun).toBe(true);
    // disk untouched
    expect(readFile('src/Card.ts')).toBe(orig);
  });

  it('is idempotent — running twice produces no extra applies on the second run', async () => {
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({
        color: { brand: { primary: { $type: 'color', $value: '#ff0000' } } },
      })
    );
    writeFile(
      'src/Card.ts',
      `import { tokens } from '@/design-system/tokens';\nconst c = { color: "#ff0000" };\n`
    );

    const first = await runAlignDesignSystem({ path: tmpDir });
    const second = await runAlignDesignSystem({ path: tmpDir });

    expect(first.summary.applied).toBe(1);
    expect(second.summary.applied).toBe(0);
  });

  it('always emits a suggestion for DRIFT-T004 (deprecated token)', async () => {
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({
        color: {
          old: {
            $type: 'color',
            $value: '#000000',
            $deprecated: true,
          },
        },
      })
    );
    writeFile(
      'src/Card.ts',
      `import { tokens } from '@/design-system/tokens';\nconst c = useToken("color.old");\n`
    );

    const out = await runAlignDesignSystem({ path: tmpDir });

    const t004 = out.outcomes.filter((o) => o.finding.code === 'DRIFT-T004');
    expect(t004.length).toBeGreaterThanOrEqual(1);
    expect(t004.every((o) => o.kind === 'suggestion')).toBe(true);
  });

  it('always emits a suggestion for DRIFT-P001 (primitive adoption)', async () => {
    writeFile(
      'design-system/DESIGN.md',
      `## Component Registry\n\n| Type | File |\n|------|------|\n| Button | b.tsx |\n`
    );
    writeFile(
      'src/Save.tsx',
      `import { tokens } from '@/design-system/tokens';\nexport const S = () => <button>Save</button>;\n`
    );

    const out = await runAlignDesignSystem({ path: tmpDir });

    const p001 = out.outcomes.filter((o) => o.finding.code === 'DRIFT-P001');
    expect(p001.length).toBe(1);
    expect(p001[0].kind).toBe('suggestion');
  });

  it('reads pipeline.driftFindings from handoff.json in pipeline mode', async () => {
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({
        color: { brand: { primary: { $type: 'color', $value: '#abcdef' } } },
      })
    );
    writeFile(
      'src/X.ts',
      `import { tokens } from '@/design-system/tokens';\nconst x = "#abcdef";\n`
    );
    // pre-seed handoff with a finding
    writeFile(
      '.harness/handoff.json',
      JSON.stringify({
        pipeline: {
          driftFindings: [
            {
              code: 'DRIFT-T001',
              severity: 'error',
              file: path.join(tmpDir, 'src/X.ts'),
              line: 2,
              message: 'Hardcoded color "#abcdef" is not in the design token palette',
              evidence: { snippet: '' },
              rule: { id: 'DRIFT-T001', category: 'token-bypass' },
              fix: { kind: 'codemod-todo', description: '' },
            },
          ],
        },
      })
    );

    const out = await runAlignDesignSystem({ path: tmpDir, mode: 'pipeline' });

    expect(out.summary.applied).toBe(1);
    expect(out.meta.mode).toBe('pipeline');
    // fixesApplied written back
    const handoff = JSON.parse(readFile('.harness/handoff.json'));
    expect(handoff.pipeline.fixesApplied).toBeDefined();
    expect(handoff.pipeline.fixesApplied.length).toBe(1);
  });
});
