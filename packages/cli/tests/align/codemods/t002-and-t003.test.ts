import { describe, it, expect } from 'vitest';
import { applyT002Codemod } from '../../../src/align/codemods/t002-font-family';
import { applyT003Codemod } from '../../../src/align/codemods/t003-px-spacing';
import type { DriftFinding } from '../../../src/drift/findings/finding';

function fontFinding(file: string, line: number, family: string): DriftFinding {
  return {
    code: 'DRIFT-T002',
    severity: 'error',
    file,
    line,
    message: `Font-family "${family}" is not in the typography token palette`,
    evidence: { snippet: '' },
    rule: { id: 'DRIFT-T002', category: 'token-bypass' },
    fix: { kind: 'codemod-todo', description: '' },
  };
}

function pxFinding(file: string, line: number, px: number): DriftFinding {
  return {
    code: 'DRIFT-T003',
    severity: 'warn',
    file,
    line,
    message: `Spacing value ${px}px is not in the spacing scale (8px, 16px)`,
    evidence: { snippet: '' },
    rule: { id: 'DRIFT-T003', category: 'token-bypass' },
    fix: { kind: 'codemod-todo', description: '' },
  };
}

const SAFE_FONT = {
  kind: 'safe-codemod' as const,
  tokenImport: { identifier: 'tokens', matchedLine: '' },
  tokenPath: 'typography.body.fontFamily',
};

const SAFE_PX = {
  kind: 'safe-codemod' as const,
  tokenImport: { identifier: 'tokens', matchedLine: '' },
  tokenPath: 'space.md',
};

describe('applyT002Codemod', () => {
  it('replaces a quoted font-family literal', () => {
    const src = `const t = { fontFamily: "Comic Sans" };\n`;
    const r = applyT002Codemod(src, fontFinding('a.ts', 1, 'Comic Sans'), SAFE_FONT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newSource).toBe(`const t = { fontFamily: tokens.typography.body.fontFamily };\n`);
  });

  it('uses var() for css files', () => {
    const src = `body { font-family: "Comic Sans"; }\n`;
    const r = applyT002Codemod(src, fontFinding('a.css', 1, 'Comic Sans'), SAFE_FONT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newSource).toContain('var(--typography-body-fontFamily)');
  });

  it('fails cleanly when the family is not on the expected line', () => {
    const src = `const t = { fontFamily: "Arial" };\n`;
    const r = applyT002Codemod(src, fontFinding('a.ts', 1, 'Comic Sans'), SAFE_FONT);
    expect(r.ok).toBe(false);
  });
});

describe('applyT003Codemod', () => {
  it('replaces "16px" string literal', () => {
    const src = `const s = { padding: "16px" };\n`;
    const r = applyT003Codemod(src, pxFinding('a.ts', 1, 16), SAFE_PX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newSource).toBe(`const s = { padding: tokens.space.md };\n`);
  });

  it('replaces bare 16px in CSS', () => {
    const src = `.x { padding: 16px; }\n`;
    const r = applyT003Codemod(src, pxFinding('a.css', 1, 16), SAFE_PX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newSource).toContain('var(--space-md)');
  });

  it('does not match 116px (word boundary)', () => {
    const src = `.x { padding: 116px; }\n`;
    const r = applyT003Codemod(src, pxFinding('a.css', 1, 16), SAFE_PX);
    expect(r.ok).toBe(false);
  });
});
