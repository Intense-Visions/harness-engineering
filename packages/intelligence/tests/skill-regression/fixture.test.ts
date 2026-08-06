import { describe, it, expect } from 'vitest';
import {
  parseFixture,
  serializeFixture,
  fixtureSchema,
} from '../../src/skill-regression/fixture.js';
import type { SkillRegressionFixture } from '../../src/skill-regression/types.js';

const FIXTURE: SkillRegressionFixture = {
  schemaVersion: 1,
  skill: 'harness-spec-craft',
  id: 'minimal-adr',
  description: 'desc',
  input: 'write an ADR',
  rubric: [
    { id: 'a', criterion: 'states a decision', weight: 2 },
    { id: 'b', criterion: 'weighs alternatives' },
  ],
  referenceOutput: 'a good ADR',
  baseline: { score: 1, k: 1, tolerance: 0.25 },
};

describe('fixture (de)serialization', () => {
  it('round-trips: parse(serialize(x)) deep-equals x', () => {
    const parsed = parseFixture(JSON.parse(serializeFixture(FIXTURE)));
    expect(parsed).toEqual(FIXTURE);
  });

  it('is byte-stable: serialize is idempotent regardless of key order', () => {
    const reordered = {
      baseline: FIXTURE.baseline,
      referenceOutput: FIXTURE.referenceOutput,
      rubric: FIXTURE.rubric,
      input: FIXTURE.input,
      description: FIXTURE.description,
      id: FIXTURE.id,
      skill: FIXTURE.skill,
      schemaVersion: FIXTURE.schemaVersion,
    } as SkillRegressionFixture;
    expect(serializeFixture(reordered)).toBe(serializeFixture(FIXTURE));
  });

  it('emits a trailing newline', () => {
    expect(serializeFixture(FIXTURE).endsWith('}\n')).toBe(true);
  });

  it('omits an absent optional weight/description (no byte churn)', () => {
    const minimal: SkillRegressionFixture = {
      schemaVersion: 1,
      skill: 's',
      id: 'i',
      input: 'in',
      rubric: [{ id: 'a', criterion: 'c' }],
      referenceOutput: 'out',
      baseline: { score: 0.9, k: 1, tolerance: 0.1 },
    };
    const serialized = serializeFixture(minimal);
    expect(serialized).not.toContain('weight');
    expect(serialized).not.toContain('description');
  });

  it('rejects an invalid fixture (empty rubric)', () => {
    expect(() => fixtureSchema.parse({ ...FIXTURE, rubric: [] })).toThrow();
  });

  it('rejects a baseline score out of [0,1]', () => {
    expect(() =>
      fixtureSchema.parse({ ...FIXTURE, baseline: { score: 2, k: 1, tolerance: 0.1 } })
    ).toThrow();
  });
});
