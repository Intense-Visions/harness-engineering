import { describe, it, expect } from 'vitest';
import { extractIdentifiers } from '../../src/naming-craft/extract/identifiers';
import { classify, sampleConventions } from '../../src/naming-craft/extract/convention';

describe('extractIdentifiers', () => {
  it('extracts const + let variables', () => {
    const ids = extractIdentifiers('a.ts', `const userName = "x";\nlet retryCount = 0;\n`);
    expect(ids.map((i) => i.name)).toEqual(['userName', 'retryCount']);
    expect(ids.every((i) => i.kind === 'variable')).toBe(true);
  });

  it('extracts function declarations + arrow-function consts', () => {
    const ids = extractIdentifiers('a.ts', `function fetchUser() {}\nconst saveUser = () => {};\n`);
    expect(ids.find((i) => i.name === 'fetchUser')?.kind).toBe('function');
    expect(ids.find((i) => i.name === 'saveUser')?.kind).toBe('function');
  });

  it('extracts interface + type + class as kind=type', () => {
    const ids = extractIdentifiers('a.ts', `interface Foo {}\ntype Bar = string;\nclass Baz {}\n`);
    const kinds = new Map(ids.map((i) => [i.name, i.kind]));
    expect(kinds.get('Foo')).toBe('type');
    expect(kinds.get('Bar')).toBe('type');
    expect(kinds.get('Baz')).toBe('type');
  });

  it('marks `export` keyword as exported=true', () => {
    const ids = extractIdentifiers(
      'a.ts',
      `export function publicFn() {}\nfunction privateFn() {}\n`
    );
    expect(ids.find((i) => i.name === 'publicFn')?.exported).toBe(true);
    expect(ids.find((i) => i.name === 'privateFn')?.exported).toBe(false);
  });

  it('extracts destructuring binders as variables', () => {
    const ids = extractIdentifiers('a.ts', `const { name, age } = user;\n`);
    expect(ids.map((i) => i.name).sort()).toEqual(['age', 'name']);
  });

  it('records line numbers', () => {
    const ids = extractIdentifiers('a.ts', `// line 1 comment\nconst x = 1;\nfunction y() {}\n`);
    expect(ids.find((i) => i.name === 'x')?.line).toBe(2);
    expect(ids.find((i) => i.name === 'y')?.line).toBe(3);
  });

  it('marks scope=short for vars inside a short function body', () => {
    const ids = extractIdentifiers('a.ts', `function quick() {\n  const inner = 1;\n}\n`);
    expect(ids.find((i) => i.name === 'inner')?.scopeSize).toBe('short');
  });
});

describe('classify (convention)', () => {
  it.each([
    ['userName', 'camelCase'],
    ['user_name', 'snake_case'],
    ['UserName', 'PascalCase'],
    ['user-name', 'kebab-case'],
    ['user', 'camelCase'], // single lowercase word
    ['USER', 'PascalCase'], // ALL_CAPS fits PascalCase regex in v1 (refine in v1.x)
    ['', null],
  ])('classify(%j) → %j', (name, expected) => {
    expect(classify(name)).toBe(expected);
  });
});

describe('sampleConventions', () => {
  it('returns camelCase when >50% of variables are camelCase', () => {
    const ids = [
      {
        name: 'userName',
        kind: 'variable' as const,
        file: 'a.ts',
        line: 1,
        exported: false,
        scopeSize: 'long' as const,
        contextLines: [],
      },
      {
        name: 'fooBar',
        kind: 'variable' as const,
        file: 'a.ts',
        line: 2,
        exported: false,
        scopeSize: 'long' as const,
        contextLines: [],
      },
      {
        name: 'snake_x',
        kind: 'variable' as const,
        file: 'a.ts',
        line: 3,
        exported: false,
        scopeSize: 'long' as const,
        contextLines: [],
      },
    ];
    const conv = sampleConventions(ids, []);
    expect(conv.variables).toBe('camelCase');
  });

  it('returns null when no convention has >50% majority', () => {
    const ids = [
      {
        name: 'userName',
        kind: 'variable' as const,
        file: 'a.ts',
        line: 1,
        exported: false,
        scopeSize: 'long' as const,
        contextLines: [],
      },
      {
        name: 'snake_x',
        kind: 'variable' as const,
        file: 'a.ts',
        line: 2,
        exported: false,
        scopeSize: 'long' as const,
        contextLines: [],
      },
      {
        name: 'PascalY',
        kind: 'variable' as const,
        file: 'a.ts',
        line: 3,
        exported: false,
        scopeSize: 'long' as const,
        contextLines: [],
      },
    ];
    const conv = sampleConventions(ids, []);
    expect(conv.variables).toBe(null);
  });

  it('files convention sampled from basenames sans extension', () => {
    const conv = sampleConventions([], ['my-file.ts', 'other-file.tsx', 'thirdFile.ts']);
    expect(conv.files).toBe('kebab-case');
  });
});
