import { describe, it, expect } from 'vitest';
import { runForbiddenPhrasesRule } from '../../../src/brand/rules/forbidden-phrases-rule';

const FORBIDDEN = ['click here', 'best-in-class', 'synergy'];

describe('runForbiddenPhrasesRule (BRAND-V001)', () => {
  it('fires on JSX text node containing forbidden phrase', () => {
    const findings = runForbiddenPhrasesRule({
      source: `export const X = () => <p>Click here to continue</p>;`,
      file: 'src/X.tsx',
      forbiddenPhrases: FORBIDDEN,
      strictness: 'standard',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('BRAND-V001');
    expect(findings[0].severity).toBe('warn');
    expect(findings[0].message).toContain('click here');
  });

  it('matches case-insensitively (CLICK HERE)', () => {
    const findings = runForbiddenPhrasesRule({
      source: `export const X = () => <p>CLICK HERE</p>;`,
      file: 'src/X.tsx',
      forbiddenPhrases: FORBIDDEN,
      strictness: 'standard',
    });
    expect(findings).toHaveLength(1);
  });

  it('fires on string-typed JSX attribute', () => {
    const findings = runForbiddenPhrasesRule({
      source: `export const X = () => <a title="best-in-class">link</a>;`,
      file: 'src/X.tsx',
      forbiddenPhrases: FORBIDDEN,
      strictness: 'standard',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.snippet).toBe('best-in-class');
  });

  it('does NOT fire on .ts files (only .jsx/.tsx)', () => {
    const findings = runForbiddenPhrasesRule({
      source: `const x = "click here";`,
      file: 'src/X.ts',
      forbiddenPhrases: FORBIDDEN,
      strictness: 'standard',
    });
    expect(findings).toHaveLength(0);
  });

  it('returns empty when forbiddenPhrases array is empty', () => {
    const findings = runForbiddenPhrasesRule({
      source: `export const X = () => <p>Click here</p>;`,
      file: 'src/X.tsx',
      forbiddenPhrases: [],
      strictness: 'standard',
    });
    expect(findings).toHaveLength(0);
  });

  it('deduplicates same phrase on same line+file', () => {
    const findings = runForbiddenPhrasesRule({
      source: `export const X = () => <p>Click here</p>;`,
      file: 'src/X.tsx',
      forbiddenPhrases: ['click', 'click here'],
      strictness: 'standard',
    });
    // Both phrases hit but they're different keys, so we expect 2.
    expect(findings).toHaveLength(2);
  });

  it('walks nested JSX correctly (TS Compiler API tree traversal)', () => {
    const findings = runForbiddenPhrasesRule({
      source: `export const X = () => (
        <div>
          <header><h1>Welcome</h1></header>
          <p>Use this best-in-class tool</p>
        </div>
      );`,
      file: 'src/X.tsx',
      forbiddenPhrases: FORBIDDEN,
      strictness: 'standard',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('BRAND-V001');
  });

  it('strictness flips severity', () => {
    const strict = runForbiddenPhrasesRule({
      source: `export const X = () => <p>Click here</p>;`,
      file: 'a.tsx',
      forbiddenPhrases: ['click here'],
      strictness: 'strict',
    });
    const permissive = runForbiddenPhrasesRule({
      source: `export const X = () => <p>Click here</p>;`,
      file: 'a.tsx',
      forbiddenPhrases: ['click here'],
      strictness: 'permissive',
    });
    expect(strict[0].severity).toBe('error');
    expect(permissive[0].severity).toBe('info');
  });
});
