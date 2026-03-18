import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { loadPersona, listPersonas } from '../../src/persona/loader';

const PERSONAS_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'agents', 'personas');

describe('built-in personas', () => {
  const personaFiles = [
    'architecture-enforcer.yaml',
    'code-reviewer.yaml',
    'documentation-maintainer.yaml',
    'entropy-cleaner.yaml',
  ];

  for (const file of personaFiles) {
    it(`${file} is valid`, () => {
      const result = loadPersona(path.join(PERSONAS_DIR, file));
      expect(result.ok).toBe(true);
    });
  }

  it('lists all 3 built-in personas', () => {
    const result = listPersonas(PERSONAS_DIR);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(4);
  });
});
