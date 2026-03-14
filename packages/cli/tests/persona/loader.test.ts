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
    expect(result.value.commands).toEqual(['validate']);
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

describe('listPersonas', () => {
  it('lists all valid personas in a directory', () => {
    const result = listPersonas(FIXTURES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThanOrEqual(1);
    expect(result.value[0].name).toBe('Test Enforcer');
  });
});
