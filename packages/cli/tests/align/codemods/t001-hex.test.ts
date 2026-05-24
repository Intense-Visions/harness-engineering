import { describe, it, expect } from 'vitest';
import { applyT001Codemod } from '../../../src/align/codemods/t001-hex';
import type { DriftFinding } from '../../../src/drift/findings/finding';

function finding(file: string, line: number, hex: string): DriftFinding {
  return {
    code: 'DRIFT-T001',
    severity: 'error',
    file,
    line,
    message: `Hardcoded color "${hex}" is not in the design token palette`,
    evidence: { snippet: `color: "${hex}"` },
    rule: { id: 'DRIFT-T001', category: 'token-bypass' },
    fix: { kind: 'codemod-todo', description: '' },
  };
}

const SAFE = {
  kind: 'safe-codemod' as const,
  tokenImport: { identifier: 'tokens', matchedLine: '' },
  tokenPath: 'color.brand.primary',
};

describe('applyT001Codemod', () => {
  it('replaces a double-quoted hex with tokens.<path> in a TS file', () => {
    const src = `const x = "#ff0000";\n`;
    const r = applyT001Codemod(src, finding('a.ts', 1, '#ff0000'), SAFE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newSource).toBe(`const x = tokens.color.brand.primary;\n`);
    expect(r.diff.before.trim()).toBe('const x = "#ff0000";');
    expect(r.diff.after.trim()).toBe('const x = tokens.color.brand.primary;');
  });

  it('replaces a single-quoted hex too', () => {
    const src = `const x = '#ff0000';\n`;
    const r = applyT001Codemod(src, finding('a.tsx', 1, '#ff0000'), SAFE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newSource).toBe(`const x = tokens.color.brand.primary;\n`);
  });

  it('uses CSS var() syntax for .css files', () => {
    const src = `.x { color: #ff0000; }\n`;
    const r = applyT001Codemod(src, finding('a.css', 1, '#ff0000'), SAFE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newSource).toContain('var(--color-brand-primary)');
  });

  it('skips when hex is no longer present on the expected line', () => {
    const src = `line one\nline two\n`;
    const r = applyT001Codemod(src, finding('a.ts', 2, '#ff0000'), SAFE);
    expect(r.ok).toBe(false);
  });

  it('does not touch other hex literals on a different line', () => {
    const src = `const a = "#ff0000";\nconst b = "#0066cc";\n`;
    const r = applyT001Codemod(src, finding('a.ts', 1, '#ff0000'), SAFE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newSource).toBe(`const a = tokens.color.brand.primary;\nconst b = "#0066cc";\n`);
  });
});
