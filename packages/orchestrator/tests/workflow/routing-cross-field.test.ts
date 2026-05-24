import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { BackendDef, RoutingConfig } from '@harness-engineering/types';
import { crossFieldRoutingIssues } from '../../src/workflow/config';
import { validateBackendsAndRouting } from '../../src/workflow/schema';

/**
 * I3 (Phase 0 review): pin the per-entry issue path produced by
 * Phase 0's cross-field validators. The path-with-index logic
 * (schema.ts:152-159, config.ts:35-43) is the only Phase-0 code path
 * that emits *user-facing error messages* with per-chain-entry
 * granularity. Without these tests, a refactor that changes
 * `path.push(idx)` -> `path.push(String(idx))` (or vice versa) would
 * pass typecheck and the existing schema-acceptance tests, but break
 * downstream consumers that index into `issue.path` to highlight the
 * offending entry in a config UI.
 *
 * Both validators are tested in parallel because they produce
 * structurally-equivalent issue paths (one inside Zod's
 * `superRefine` context, one as a flat array).
 */

const KNOWN_BACKENDS: Record<string, BackendDef> = {
  'claude-opus': { type: 'claude' },
  mock: { type: 'mock' },
};

describe('crossFieldRoutingIssues (config.ts) — chain entry issue paths', () => {
  it('reports the offending index when a skills chain entry is unknown', () => {
    const routing: RoutingConfig = {
      default: 'claude-opus',
      skills: {
        foo: ['claude-opus', 'unknown-backend'],
      },
    };
    const issues = crossFieldRoutingIssues(KNOWN_BACKENDS, routing);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(['skills', 'foo', '1']);
    expect(issues[0]?.message).toContain('unknown-backend');
    expect(issues[0]?.message).toContain('routing.skills.foo.1');
  });

  it('reports the offending index when a modes chain entry is unknown', () => {
    const routing: RoutingConfig = {
      default: 'claude-opus',
      modes: {
        'adversarial-reviewer': ['unknown-backend', 'claude-opus'],
      },
    };
    const issues = crossFieldRoutingIssues(KNOWN_BACKENDS, routing);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(['modes', 'adversarial-reviewer', '0']);
    expect(issues[0]?.message).toContain('unknown-backend');
    expect(issues[0]?.message).toContain('routing.modes.adversarial-reviewer.0');
  });

  it('reports indices for multiple unknown entries in the same chain', () => {
    const routing: RoutingConfig = {
      default: 'claude-opus',
      skills: {
        foo: ['claude-opus', 'unknown-one', 'mock', 'unknown-two'],
      },
    };
    const issues = crossFieldRoutingIssues(KNOWN_BACKENDS, routing);

    expect(issues).toHaveLength(2);
    expect(issues[0]?.path).toEqual(['skills', 'foo', '1']);
    expect(issues[1]?.path).toEqual(['skills', 'foo', '3']);
  });

  it('omits the index segment for scalar form (1-segment path preserved)', () => {
    // Pins the asymmetric path shape: scalar entries report
    // `['skills', 'foo']` (no `.0` suffix), chain entries report
    // `['skills', 'foo', '<idx>']`. A consumer doing
    // `path[path.length - 1]` to extract the entry index must be able
    // to tell scalar from chain — the contract is "path length
    // increases by 1 when reporting a chain entry".
    const routing: RoutingConfig = {
      default: 'claude-opus',
      skills: {
        foo: 'unknown-backend',
      },
    };
    const issues = crossFieldRoutingIssues(KNOWN_BACKENDS, routing);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(['skills', 'foo']);
  });

  it('reports no issues when every chain entry is a known backend', () => {
    const routing: RoutingConfig = {
      default: 'claude-opus',
      skills: {
        foo: ['claude-opus', 'mock'],
      },
      modes: {
        bar: ['mock'],
      },
    };
    const issues = crossFieldRoutingIssues(KNOWN_BACKENDS, routing);

    expect(issues).toEqual([]);
  });
});

/**
 * `validateBackendsAndRouting` is the Zod-flavored sibling — it pushes
 * issues into a `superRefine` context rather than returning an array.
 * To exercise it in isolation we wrap a minimal Zod schema that
 * forwards (backends, routing) to the helper.
 */
describe('validateBackendsAndRouting (schema.ts) — chain entry issue paths', () => {
  const TestSchema = z
    .object({
      backends: z.record(z.string(), z.any()).optional(),
      routing: z.any().optional(),
    })
    .superRefine((val, ctx) => {
      validateBackendsAndRouting(
        val.backends as Record<string, BackendDef> | undefined,
        val.routing as RoutingConfig | undefined,
        ctx
      );
    });

  it('reports the offending index in the issue path for a skills chain', () => {
    const result = TestSchema.safeParse({
      backends: KNOWN_BACKENDS,
      routing: {
        default: 'claude-opus',
        skills: { foo: ['claude-opus', 'unknown-backend'] },
      },
    });

    expect(result.success).toBe(false);
    if (result.success) return; // type guard
    expect(result.error.issues).toHaveLength(1);
    // `validateBackendsAndRouting` prefixes the path with `routing`;
    // the index segment is appended as a number (not a string) per
    // schema.ts:154.
    expect(result.error.issues[0]?.path).toEqual(['routing', 'skills', 'foo', 1]);
    expect(result.error.issues[0]?.message).toContain('unknown-backend');
    expect(result.error.issues[0]?.message).toContain('routing.skills.foo.1');
  });

  it('reports the offending index in the issue path for a modes chain', () => {
    const result = TestSchema.safeParse({
      backends: KNOWN_BACKENDS,
      routing: {
        default: 'claude-opus',
        modes: { bar: ['unknown-backend', 'mock'] },
      },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]?.path).toEqual(['routing', 'modes', 'bar', 0]);
  });

  it('reports the offending index in the issue path for intelligence.pesl chain', () => {
    const result = TestSchema.safeParse({
      backends: KNOWN_BACKENDS,
      routing: {
        default: 'claude-opus',
        intelligence: { pesl: ['mock', 'unknown-backend'] },
      },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]?.path).toEqual(['routing', 'intelligence', 'pesl', 1]);
  });

  it('omits the index segment for scalar form (1-segment path under the field key)', () => {
    const result = TestSchema.safeParse({
      backends: KNOWN_BACKENDS,
      routing: {
        default: 'claude-opus',
        skills: { foo: 'unknown-backend' },
      },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]?.path).toEqual(['routing', 'skills', 'foo']);
  });
});
