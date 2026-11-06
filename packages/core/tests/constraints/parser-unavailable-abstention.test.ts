/**
 * The parser-unavailable abstention, exercised against a REAL `TypeScriptParser`.
 *
 * `TypeScriptParser.health()` used to return a hardcoded `available: true`
 * (#2267), so `validateDependencies`' three parser-unavailable branches — and
 * every consumer branch built on them — were unreachable from any production
 * input. The sibling tests in `dependencies.test.ts` reach them with a
 * hand-rolled parser object, which proves the branch compiles but not that any
 * real parser can enter it. These tests use the real class, made genuinely
 * unavailable through its module loader.
 *
 * Each case pairs the abstention with the SAME fixture parsed by a healthy
 * parser, so the fixture produces a different answer in the two states: a
 * detected violation / a detected cycle versus a named abstention. A fixture
 * that produced zero either way would not discriminate.
 */
import { describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { validateDependencies } from '../../src/constraints/dependencies';
import { detectCircularDepsInFiles } from '../../src/constraints/circular-deps';
import { defineLayer } from '../../src/constraints/layers';
import { TypeScriptParser } from '../../src/shared/parsers/typescript';

const LOAD_FAILURE = "Cannot find module '@typescript-eslint/typescript-estree'";

/** A real TypeScriptParser whose one runtime dependency cannot be resolved. */
function unavailableParser(): TypeScriptParser {
  return new TypeScriptParser(() => Promise.reject(new Error(LOAD_FAILURE)));
}

const layerFixtures = join(__dirname, '../fixtures/layer-violations');
const layers = [
  defineLayer('domain', ['domain/**'], []),
  defineLayer('services', ['services/**'], ['domain']),
  defineLayer('api', ['api/**'], ['services', 'domain']),
];

describe('validateDependencies with a genuinely unavailable TypeScriptParser (#2267)', () => {
  it('finds the fixture violation when the parser is healthy', async () => {
    // The discriminating half: this fixture has a real WRONG_LAYER edge, so a
    // healthy run is non-empty and an abstention is visibly different from it.
    const result = await validateDependencies({
      layers,
      rootDir: layerFixtures,
      parser: new TypeScriptParser(),
      fallbackBehavior: 'skip',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.skipped).toBeUndefined();
    expect(result.value.valid).toBe(false);
    expect(result.value.violations.map((v) => v.reason)).toContain('WRONG_LAYER');
  });

  it("abstains under fallbackBehavior 'skip', naming the parser's own reason", async () => {
    const result = await validateDependencies({
      layers,
      rootDir: layerFixtures,
      parser: unavailableParser(),
      fallbackBehavior: 'skip',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.skipped).toBe(true);
    expect(result.value.violations).toHaveLength(0);
    // Positive discriminator on the reason, not merely on the absence of
    // violations: `check-deps` and the `check_dependencies` MCP tool print this
    // string, and 'Parser unavailable' alone never said what was wrong.
    expect(result.value.reason).toContain('Parser unavailable:');
    expect(result.value.reason).toContain('could not be loaded');
    expect(result.value.reason).toContain(LOAD_FAILURE);
  });

  it("abstains and warns under fallbackBehavior 'warn'", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await validateDependencies({
        layers,
        rootDir: layerFixtures,
        parser: unavailableParser(),
        fallbackBehavior: 'warn',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.value.skipped).toBe(true);
      expect(result.value.reason).toContain(LOAD_FAILURE);
      expect(warn.mock.calls.flat().join(' ')).toContain(LOAD_FAILURE);
    } finally {
      warn.mockRestore();
    }
  });

  it("errors under the default fallbackBehavior, naming the parser's own reason", async () => {
    const result = await validateDependencies({
      layers,
      rootDir: layerFixtures,
      parser: unavailableParser(),
      // fallbackBehavior omitted on purpose: core defaults to 'error', which is
      // what check-orchestrator and review/mechanical-checks rely on.
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('PARSER_UNAVAILABLE');
    expect(result.error.message).toContain(LOAD_FAILURE);
  });
});

describe('circular-dependency detection with a genuinely unavailable parser (#2267)', () => {
  const cycleFiles = ['a.ts', 'b.ts', 'c.ts'].map((f) =>
    join(__dirname, '../fixtures/circular-deps', f)
  );

  it('detects the fixture cycle when the parser is healthy', async () => {
    const result = await detectCircularDepsInFiles(cycleFiles, new TypeScriptParser());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.hasCycles).toBe(true);
  });

  it('fails closed instead of reporting "no cycles" over files it never parsed', async () => {
    // `buildDependencyGraph` skips files it cannot parse, which is right for a
    // syntax error in one file and wrong when the parser is gone: every file is
    // skipped, the graph has zero edges, and `detectCircularDeps` reads that as
    // "no cycles". `check-deps` then reports the cycle check clean — a pass over
    // an analysis that never ran, on the same files the healthy run above
    // flagged. PARSER_UNAVAILABLE must therefore propagate.
    const result = await detectCircularDepsInFiles(cycleFiles, unavailableParser());

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error(
        `expected err, got hasCycles=${result.value.hasCycles} over an unparsed file set`
      );
    }
    expect(result.error.code).toBe('PARSER_UNAVAILABLE');
    expect(result.error.message).toContain('Cannot build a dependency graph');
    expect(result.error.message).toContain(LOAD_FAILURE);
  });
});
