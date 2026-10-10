import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Ok } from '@harness-engineering/core';
import { handleCheckDependencies } from '../../../src/mcp/tools/architecture';

/**
 * Regression coverage for #2098 — the MCP twin of `harness check-deps`.
 *
 * `check_dependencies` delegates to `validateDependencies`, which abstains when
 * the parser is unavailable: `Ok({ valid: true, violations: [], skipped: true,
 * reason })`. The handler read neither `skipped` nor `reason`, so it returned
 * that payload as an ordinary success — `valid: true`, zero violations, no
 * `isError` — which is byte-indistinguishable from a genuinely clean project
 * for a check that validated nothing.
 */
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    validateDependencies: vi.fn(actual.validateDependencies),
  };
});

const { validateDependencies } = await import('@harness-engineering/core');

describe('check_dependencies does not report clean when the engine abstained (#2098)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-abstain-'));
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        name: 'p',
        layers: [{ name: 'core', pattern: 'src/core/**', allowedDependencies: [] }],
      })
    );
    fs.mkdirSync(path.join(dir, 'src', 'core'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'core', 'index.ts'), 'export const x = 1;\n');
    vi.mocked(validateDependencies).mockReset();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns an error naming the abstention, not a clean payload', async () => {
    vi.mocked(validateDependencies).mockResolvedValue(
      Ok({
        valid: true,
        violations: [],
        graph: { nodes: [], edges: [] },
        skipped: true,
        reason: 'Parser unavailable',
      }) as never
    );

    const r = await handleCheckDependencies({ path: dir });

    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('Parser unavailable');
    expect(r.content[0]!.text).not.toContain('"valid": true');
  });

  it('still returns the ordinary payload when the engine actually ran', async () => {
    vi.mocked(validateDependencies).mockResolvedValue(
      Ok({ valid: true, violations: [], graph: { nodes: [], edges: [] } }) as never
    );

    const r = await handleCheckDependencies({ path: dir });

    expect(r.isError).toBeFalsy();
    expect(() => JSON.parse(r.content[0]!.text)).not.toThrow();
  });
});
