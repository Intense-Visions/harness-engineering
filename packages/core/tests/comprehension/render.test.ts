import { describe, it, expect } from 'vitest';
import { renderServedUnit } from '../../src/comprehension/render';
import type { ComprehensionUnit } from '../../src/comprehension/types';
import { SCHEMA_VERSION, COMPILER_VERSION } from '../../src/comprehension/types';

function base(semantic: 'present' | 'absent'): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module: 'pkg/mod',
      sourceHash: 'a'.repeat(64),
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model: null,
      semantic,
      members: ['a.ts'],
    },
    summary: 'Does the thing.',
    invariants: ['always X'],
    interfaceContract: 'export const a: 1',
    dependencySlice: 'imports: none',
  };
}

describe('renderServedUnit (served wire format)', () => {
  it('collapses provenance to a single sourceHash line — no full frontmatter', () => {
    const md = renderServedUnit(base('present'));
    expect(md).toContain('a'.repeat(64));
    expect(md).not.toContain('schemaVersion:');
    expect(md).not.toContain('compiledAt:');
  });

  it('renders static sections always and semantic sections when present', () => {
    const md = renderServedUnit(base('present'));
    expect(md).toContain('## Interface Contract');
    expect(md).toContain('## Dependency Slice');
    expect(md).toContain('Does the thing.');
    expect(md).toContain('always X');
  });

  it('omits Summary/Invariants for a static-only (semantic: absent) unit', () => {
    const md = renderServedUnit(base('absent'));
    expect(md).not.toContain('## Summary');
    expect(md).not.toContain('## Invariants');
    expect(md).toContain('## Interface Contract');
  });
});
