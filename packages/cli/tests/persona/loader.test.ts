import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { loadPersona, listPersonas } from '../../src/persona/loader';

const FIXTURES = path.join(__dirname, 'fixtures');

describe('loadPersona', () => {
  it('loads and validates a valid persona YAML', () => {
    const result = loadPersona(path.join(FIXTURES, 'valid-persona.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Test Enforcer');
  });

  it('returns error for invalid persona', () => {
    const result = loadPersona(path.join(FIXTURES, 'invalid-persona.yaml'));
    expect(result.ok).toBe(false);
  });

  it('returns error for missing file', () => {
    const result = loadPersona(path.join(FIXTURES, 'nonexistent.yaml'));
    expect(result.ok).toBe(false);
  });
});

describe('v1 normalization', () => {
  it('normalizes v1 commands to steps', () => {
    const result = loadPersona(path.join(FIXTURES, 'valid-persona.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.steps).toBeDefined();
    expect(result.value.steps).toEqual([{ command: 'validate', when: 'always' }]);
  });
});

describe('v2 loading', () => {
  it('loads a v2 persona with steps', () => {
    const result = loadPersona(path.join(FIXTURES, 'v2-persona.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Test Reviewer');
    expect(result.value.steps).toHaveLength(2);
    expect(result.value.steps[0]).toEqual({ command: 'validate', when: 'always' });
    expect(result.value.steps[1]).toEqual({
      skill: 'harness-code-review',
      when: 'on_pr',
      output: 'auto',
    });
  });

  it('loads a v2 persona with mixed command and skill steps', () => {
    const result = loadPersona(path.join(FIXTURES, 'v2-persona-mixed.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.steps).toHaveLength(3);
  });

  it('lists both v1 and v2 personas', () => {
    const result = listPersonas(FIXTURES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.value.map((p) => p.name);
    expect(names).toContain('Test Enforcer');
    expect(names).toContain('Test Reviewer');
  });
});

describe('listPersonas', () => {
  it('lists all valid personas in a directory', () => {
    const result = listPersonas(FIXTURES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThanOrEqual(1);
    expect(result.value.find((p) => p.name === 'Test Enforcer')).toBeTruthy();
  });
});
