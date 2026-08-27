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

// F1 — fence-aware section parsing + dynamic fence length + leading `## ` in prose.
describe('comprehension serialize/parse — F1 round-trip robustness', () => {
  function withBodies(bodies: Partial<ComprehensionUnit>): ComprehensionUnit {
    return { ...present(), ...bodies };
  }
  function roundTrip(u: ComprehensionUnit): ComprehensionUnit {
    const parsed = parseUnit(serializeUnit(u));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw parsed.error;
    return parsed.value;
  }

  it('recovers a `## Heading` line embedded in the summary', () => {
    const summary = 'Intro paragraph.\n\n## A Markdown Heading\n\nMore prose after it.';
    const r = roundTrip(withBodies({ summary }));
    expect(r.summary).toBe(summary);
  });

  it('recovers a fenced code block embedded in the summary', () => {
    const summary = 'Uses code:\n\n```ts\nconst x = 1;\n```\n\nDone.';
    const r = roundTrip(withBodies({ summary }));
    expect(r.summary).toBe(summary);
  });

  it('recovers a `## Heading` embedded in an invariant', () => {
    const r = roundTrip(withBodies({ invariants: ['plain one', '## looks like a heading'] }));
    expect(r.invariants).toEqual(['plain one', '## looks like a heading']);
  });

  it('recovers a `## Heading` inside a fenced static section (interfaceContract)', () => {
    const interfaceContract = '// docs:\n## Not a section boundary\nexport const y: number';
    const r = roundTrip(withBodies({ interfaceContract }));
    expect(r.interfaceContract).toBe(interfaceContract);
  });

  it('recovers a code fence inside a fenced static section via dynamic fence length', () => {
    const dependencySlice = 'example usage:\n```ts\nimport { z } from "z";\n```\nend';
    const r = roundTrip(withBodies({ dependencySlice }));
    expect(r.dependencySlice).toBe(dependencySlice);
  });

  it('recovers a nested/longer backtick run inside a fenced static section', () => {
    const interfaceContract = 'nested markdown:\n````md\n```ts\ninner\n```\n````\ntail';
    const r = roundTrip(withBodies({ interfaceContract }));
    expect(r.interfaceContract).toBe(interfaceContract);
  });

  it('stays idempotent when sections contain headings and fences', () => {
    const u = withBodies({
      summary: '## Heading\n\n```ts\ncode\n```',
      interfaceContract: '```ts\nnested\n```\nafter',
      dependencySlice: '## Deps\n````\n```\ninner\n```\n````',
    });
    const md = serializeUnit(u);
    const parsed = parseUnit(md);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(serializeUnit(parsed.value)).toBe(md);
  });
});

// F2 — schemaVersion is read and validated, not blindly stamped.
describe('comprehension parse — F2 schemaVersion validation', () => {
  it('rejects a frontmatter missing schemaVersion', () => {
    const bad = serializeUnit(present()).replace(/schemaVersion: \d+\n/, '');
    expect(parseUnit(bad).ok).toBe(false);
  });

  it('rejects an unknown future schemaVersion', () => {
    const bad = serializeUnit(present()).replace(/schemaVersion: \d+/, 'schemaVersion: 999');
    const r = parseUnit(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/schemaVersion/);
  });

  it('accepts the current schemaVersion', () => {
    const r = parseUnit(serializeUnit(present()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.provenance.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

// F4 — empty invariants are intentionally dropped, not emitted as bare `- `.
describe('comprehension serialize — F4 empty invariant normalization', () => {
  it('skips empty invariants on serialize and round-trips the filtered list', () => {
    const u = { ...present(), invariants: ['keep me', '', '   ', 'and me'] };
    const md = serializeUnit(u);
    expect(md).not.toMatch(/^- *$/m);
    const parsed = parseUnit(md);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.invariants).toEqual(['keep me', 'and me']);
  });
});
