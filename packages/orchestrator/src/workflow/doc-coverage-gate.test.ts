import { describe, it, expect } from 'vitest';
import {
  needsDoc,
  docToken,
  findUndocumentedAdditions,
  formatUndocumentedReason,
} from './doc-coverage-gate';

describe('needsDoc', () => {
  it('flags a new public source file under a package src/', () => {
    expect(needsDoc('packages/eslint-plugin/src/rules/no-spread-in-variadic.ts')).toBe(true);
  });

  it('ignores tests, barrels, type-only decls, and config', () => {
    expect(needsDoc('packages/eslint-plugin/tests/rules/no-spread-in-variadic.test.ts')).toBe(
      false
    );
    expect(needsDoc('packages/eslint-plugin/src/rules/index.ts')).toBe(false);
    expect(needsDoc('packages/core/src/foo.d.ts')).toBe(false);
    expect(needsDoc('packages/core/src/types.ts')).toBe(false);
    expect(needsDoc('packages/core/src/vitest.config.ts')).toBe(false);
    expect(needsDoc('packages/eslint-plugin/src/rules/rule.spec.ts')).toBe(false);
  });

  it('ignores files outside a package src/ (docs, root, scripts)', () => {
    expect(needsDoc('docs/reference/eslint-rules.md')).toBe(false);
    expect(needsDoc('scripts/gen.mjs')).toBe(false);
    expect(needsDoc('README.md')).toBe(false);
  });
});

describe('docToken', () => {
  it('is the basename without extension (the name a doc references)', () => {
    expect(docToken('packages/eslint-plugin/src/rules/no-spread-in-variadic.ts')).toBe(
      'no-spread-in-variadic'
    );
  });
});

describe('findUndocumentedAdditions', () => {
  const rule = 'packages/eslint-plugin/src/rules/no-spread-in-variadic.ts';

  it('flags an added rule with no docs mention', () => {
    const docs = '# ESLint Rules\n- no-skipped-tests\n- no-focused-tests\n';
    expect(findUndocumentedAdditions([rule], docs)).toEqual([rule]);
  });

  it('passes when the rule name is mentioned anywhere in docs', () => {
    const docs = '# ESLint Rules\nThe `no-spread-in-variadic` rule flags call-stack blowups.\n';
    expect(findUndocumentedAdditions([rule], docs)).toEqual([]);
  });

  it('ignores added files that do not need docs (tests, barrels)', () => {
    const added = [
      'packages/eslint-plugin/tests/rules/no-spread-in-variadic.test.ts',
      'packages/eslint-plugin/src/rules/index.ts',
    ];
    expect(findUndocumentedAdditions(added, '')).toEqual([]);
  });

  it('returns only the undocumented subset among several additions', () => {
    const a = 'packages/core/src/alpha.ts';
    const b = 'packages/core/src/beta.ts';
    const docs = 'alpha is documented here';
    expect(findUndocumentedAdditions([a, b], docs)).toEqual([b]);
  });
});

describe('formatUndocumentedReason', () => {
  it('names each file and points at the docs fix', () => {
    const msg = formatUndocumentedReason([
      'packages/eslint-plugin/src/rules/no-spread-in-variadic.ts',
    ]);
    expect(msg).toMatch(/doc coverage failed/);
    expect(msg).toMatch(/no-spread-in-variadic\.ts/);
    expect(msg).toMatch(/docs\/reference\/eslint-rules\.md/);
  });
});
