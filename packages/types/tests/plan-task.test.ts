import { describe, it, expect } from 'vitest';
import { PlanTaskSchema } from '../src/plan-task';

describe('PlanTaskSchema', () => {
  it('accepts a task with dependsOn and owns', () => {
    const parsed = PlanTaskSchema.parse({
      id: 't1',
      files: ['a.ts'],
      dependsOn: ['t0'],
      owns: ['src/mod/**'],
    });
    expect(parsed.dependsOn).toEqual(['t0']);
    expect(parsed.owns).toEqual(['src/mod/**']);
  });

  it('accepts a minimal task without dependsOn/owns', () => {
    const parsed = PlanTaskSchema.parse({ id: 't1', files: [] });
    expect(parsed.dependsOn).toBeUndefined();
    expect(parsed.owns).toBeUndefined();
  });

  it('rejects a task whose dependsOn is not a string array', () => {
    expect(() => PlanTaskSchema.parse({ id: 't1', files: [], dependsOn: [1] })).toThrow();
  });
});
