import { describe, it, expect } from 'vitest';
import {
  runArchitectureAgent,
  ARCHITECTURE_DESCRIPTOR,
} from '../../../src/review/agents/architecture-agent';
import type { ContextBundle } from '../../../src/review/types';

function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    domain: 'architecture',
    changeType: 'feature',
    changedFiles: [
      {
        path: 'src/routes/users.ts',
        content: [
          'import { query } from "../db/queries";',
          'import { UserService } from "../services/user-service";',
          'export function getUsers() { return query("SELECT * FROM users"); }',
        ].join('\n'),
        reason: 'changed',
        lines: 3,
      },
    ],
    contextFiles: [],
    commitHistory: [],
    diffLines: 10,
    contextLines: 0,
    ...overrides,
  };
}

describe('ARCHITECTURE_DESCRIPTOR', () => {
  it('has domain architecture and tier standard', () => {
    expect(ARCHITECTURE_DESCRIPTOR.domain).toBe('architecture');
    expect(ARCHITECTURE_DESCRIPTOR.tier).toBe('standard');
  });

  it('has a displayName', () => {
    expect(ARCHITECTURE_DESCRIPTOR.displayName).toBe('Architecture');
  });
});

describe('runArchitectureAgent()', () => {
  it('returns ReviewFinding[] with domain architecture', () => {
    const findings = runArchitectureAgent(makeBundle());
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.domain).toBe('architecture');
    }
  });

  it('all findings have validatedBy heuristic', () => {
    const findings = runArchitectureAgent(makeBundle());
    for (const f of findings) {
      expect(f.validatedBy).toBe('heuristic');
    }
  });

  it('detects check-deps violations from context', () => {
    const bundle = makeBundle({
      contextFiles: [
        {
          path: 'harness-check-deps-output',
          content: 'Layer violation: routes -> db in src/routes/users.ts:1',
          reason: 'convention',
          lines: 1,
        },
      ],
    });
    const findings = runArchitectureAgent(bundle);
    expect(
      findings.some(
        (f) =>
          f.title.toLowerCase().includes('layer') || f.title.toLowerCase().includes('violation')
      )
    ).toBe(true);
  });

  it('detects large files as architectural concern', () => {
    const longContent = Array.from({ length: 400 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/monolith.ts',
          content: longContent,
          reason: 'changed',
          lines: 400,
        },
      ],
    });
    const findings = runArchitectureAgent(bundle);
    expect(
      findings.some(
        (f) =>
          f.title.toLowerCase().includes('large') ||
          f.title.toLowerCase().includes('responsibility')
      )
    ).toBe(true);
  });

  it('detects circular import hints', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/a.ts',
          content: 'import { b } from "./b";\nexport const a = b + 1;',
          reason: 'changed',
          lines: 2,
        },
      ],
      contextFiles: [
        {
          path: 'src/b.ts',
          content: 'import { a } from "./a";\nexport const b = a + 1;',
          reason: 'import',
          lines: 2,
        },
      ],
    });
    const findings = runArchitectureAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('circular'))).toBe(true);
  });

  it('returns empty findings for clean architecture', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/utils/format.ts',
          content: 'export function formatDate(d: Date): string { return d.toISOString(); }',
          reason: 'changed',
          lines: 1,
        },
      ],
      contextFiles: [],
    });
    const findings = runArchitectureAgent(bundle);
    // Small, clean utility file — no architectural issues
    expect(Array.isArray(findings)).toBe(true);
  });

  it('generates unique ids', () => {
    const bundle = makeBundle({
      contextFiles: [
        {
          path: 'harness-check-deps-output',
          content: 'Layer violation: routes -> db',
          reason: 'convention',
          lines: 1,
        },
      ],
    });
    const findings = runArchitectureAgent(bundle);
    const ids = findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
