// tests/rules/no-circular-deps.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll, beforeEach, expect } from 'vitest';
import rule, {
  clearImportGraph,
  addEdge,
  detectCycle,
} from '../../src/rules/no-circular-deps';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

// Clear graph before each test
beforeEach(() => {
  clearImportGraph();
});

ruleTester.run('no-circular-deps', rule, {
  valid: [
    // No circular dependency
    {
      code: `import { foo } from './foo';`,
      filename: '/project/src/bar.ts',
    },
    // External import
    {
      code: `import lodash from 'lodash';`,
      filename: '/project/src/utils.ts',
    },
  ],
  invalid: [],
});

// Additional tests for cycle detection logic
describe('cycle detection', () => {
  beforeEach(() => {
    clearImportGraph();
  });

  it('detects direct cycle A→B→A', () => {
    // Simulate: a.ts imports b.ts, then b.ts imports a.ts
    addEdge('src/a.ts', 'src/b.ts');
    const cycle = detectCycle('src/b.ts', 'src/a.ts');

    expect(cycle).not.toBeNull();
    expect(cycle).toContain('src/a.ts');
    expect(cycle).toContain('src/b.ts');
  });

  it('detects indirect cycle A→B→C→A', () => {
    addEdge('src/a.ts', 'src/b.ts');
    addEdge('src/b.ts', 'src/c.ts');
    const cycle = detectCycle('src/c.ts', 'src/a.ts');

    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThanOrEqual(3);
  });

  it('returns null when no cycle', () => {
    addEdge('src/a.ts', 'src/b.ts');
    addEdge('src/b.ts', 'src/c.ts');
    const cycle = detectCycle('src/a.ts', 'src/d.ts');

    expect(cycle).toBeNull();
  });
});
