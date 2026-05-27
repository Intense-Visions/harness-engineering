import { describe, it, expect } from 'vitest';
import { applyInverse } from '../../../src/align/revert/inverse';

describe('applyInverse', () => {
  it('reverses a recorded line replacement on matching source', () => {
    const source = `import { tokens } from '@/x';\nconst c = tokens.color.brand.primary;\n`;
    const r = applyInverse(source, {
      file: '/x/a.ts',
      line: 2,
      before: 'const c = "#0066cc";',
      after: 'const c = tokens.color.brand.primary;',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newSource).toBe(`import { tokens } from '@/x';\nconst c = "#0066cc";\n`);
    expect(r.invertedDiff.before).toBe('const c = tokens.color.brand.primary;');
    expect(r.invertedDiff.after).toBe('const c = "#0066cc";');
  });

  it('refuses to revert when the line content no longer matches', () => {
    const source = `something else\nconst c = "other";\n`;
    const r = applyInverse(source, {
      file: '/x/a.ts',
      line: 2,
      before: 'const c = "#0066cc";',
      after: 'const c = tokens.color.brand.primary;',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/no longer matches/);
  });

  it('does not mutate the original source string', () => {
    const source = `a\nconst c = tokens.x;\n`;
    const before = source;
    applyInverse(source, {
      file: '/x/a.ts',
      line: 2,
      before: 'const c = "#x";',
      after: 'const c = tokens.x;',
    });
    expect(source).toBe(before);
  });
});
