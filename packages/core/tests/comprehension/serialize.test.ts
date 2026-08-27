import { describe, it, expect } from 'vitest';
import { parseUnit, serializeUnit } from '../../src/comprehension/serialize';
import type { ComprehensionUnit } from '../../src/comprehension/types';
import { SCHEMA_VERSION, COMPILER_VERSION } from '../../src/comprehension/types';

function present(): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module: 'packages/core/src/roadmap',
      sourceHash: 'a'.repeat(64),
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model: 'claude-haiku',
      semantic: 'present',
      members: ['parse.ts', 'serialize.ts'],
    },
    summary: 'Parses and serializes roadmaps.',
    invariants: ['round-trips byte-stably', 'never mutates input'],
    interfaceContract: 'export function parseRoadmap(md: string): Result<Roadmap>',
    dependencySlice: 'imports: gray-matter\nimporters: cli/roadmap',
  };
}

function absent(): ComprehensionUnit {
  const u = present();
  return {
    ...u,
    provenance: { ...u.provenance, semantic: 'absent', model: null },
    summary: '',
    invariants: [],
  };
}

describe('comprehension serialize/parse', () => {
  it('round-trips a present (full) unit idempotently', () => {
    const md = serializeUnit(present());
    const parsed = parseUnit(md);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(serializeUnit(parsed.value)).toBe(md);
  });

  it('preserves all provenance fields through a round-trip', () => {
    const parsed = parseUnit(serializeUnit(present()));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.provenance).toEqual(present().provenance);
  });

  it('absent unit omits Summary/Invariants sections and parses empty', () => {
    const md = serializeUnit(absent());
    expect(md).not.toContain('## Summary');
    expect(md).not.toContain('## Invariants');
    expect(md).toContain('## Interface Contract');
    const parsed = parseUnit(md);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.summary).toBe('');
      expect(parsed.value.invariants).toEqual([]);
    }
  });

  it('rejects an invalid semantic value', () => {
    const bad = serializeUnit(present()).replace('semantic: present', 'semantic: maybe');
    expect(parseUnit(bad).ok).toBe(false);
  });

  it('rejects missing sourceHash', () => {
    const bad = serializeUnit(present()).replace(/sourceHash: "[a]+"\n/, '');
    expect(parseUnit(bad).ok).toBe(false);
  });
});
