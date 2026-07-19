import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { outcomeEvalDefinition, handleOutcomeEval } from '../../../src/mcp/tools/outcome-eval.js';

let tmpDir: string;

function parseResult(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'outcome-eval-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('outcome_eval definition', () => {
  it('has the correct tool name', () => {
    expect(outcomeEvalDefinition.name).toBe('outcome_eval');
  });

  it('requires specPath, diff and testOutput', () => {
    expect(outcomeEvalDefinition.inputSchema.required).toEqual(['specPath', 'diff', 'testOutput']);
  });

  it('exposes an optional model input', () => {
    expect(outcomeEvalDefinition.inputSchema.properties.model).toBeDefined();
  });
});

describe('handleOutcomeEval input contract', () => {
  it('errors when specPath is missing', async () => {
    const result = await handleOutcomeEval({
      // @ts-expect-error intentionally omitting specPath
      diff: 'x',
      testOutput: 'y',
    });
    expect(result.isError).toBe(true);
    expect(parseResult(result).error).toMatch(/specPath/);
  });

  it('errors when diff is missing', async () => {
    const result = await handleOutcomeEval({
      specPath: path.join(tmpDir, 'spec.md'),
      // @ts-expect-error intentionally omitting diff
      testOutput: 'y',
    });
    expect(result.isError).toBe(true);
    expect(parseResult(result).error).toMatch(/diff/);
  });

  it('errors when testOutput is missing', async () => {
    const result = await handleOutcomeEval({
      specPath: path.join(tmpDir, 'spec.md'),
      // @ts-expect-error intentionally omitting testOutput
      diff: 'x',
    });
    expect(result.isError).toBe(true);
    expect(parseResult(result).error).toMatch(/testOutput/);
  });
});

describe('handleOutcomeEval degrade-safe behaviour', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    // Ensure no real provider is configured for the degradation path.
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it('returns an advisory INCONCLUSIVE verdict when no provider is configured', async () => {
    const specPath = path.join(tmpDir, 'spec.md');
    await fs.writeFile(
      specPath,
      '# Spec\n\n## Success Criteria\n\n- The endpoint returns 404 for missing users.\n'
    );

    const result = await handleOutcomeEval({
      specPath,
      diff: 'diff --git a/x b/x\n+added',
      testOutput: 'PASS 1 test',
      path: tmpDir,
    });

    expect(result.isError).toBeUndefined();
    const verdict = parseResult(result);
    // Provider unconfigured => judge() degrades.
    expect(verdict.verdict).toBe('INCONCLUSIVE');
    expect(verdict.confidence).toBe('low');
    // Authority is TS-derived: INCONCLUSIVE/low => advisory, never blocking.
    expect(verdict.authority).toBe('advisory');
    expect(Array.isArray(verdict.unmetCriteria)).toBe(true);
  });

  it('surfaces guardian diff-coverage records from .harness/analyses/ in the rationale', async () => {
    const specPath = path.join(tmpDir, 'spec.md');
    await fs.writeFile(specPath, '# Spec\n\n## Success Criteria\n\n- Does a thing.\n');
    // Drop a valid guardian record into the project's analyses archive.
    const analysesDir = path.join(tmpDir, '.harness', 'analyses');
    await fs.mkdir(analysesDir, { recursive: true });
    await fs.writeFile(
      path.join(analysesDir, 'guardian-1.json'),
      JSON.stringify({
        schema: 'harness.guardian.diff-coverage',
        version: 1,
        generatedAt: '2026-07-19T00:00:00.000Z',
        verdict: 'fail',
        severity: 'error',
        coverageDelta: -3.1,
        files: [{ file: 'src/x.ts', uncoveredLines: [1, 2] }],
      })
    );

    const result = await handleOutcomeEval({
      specPath,
      diff: 'diff --git a/x b/x\n+added',
      testOutput: 'PASS',
      path: tmpDir,
    });

    expect(result.isError).toBeUndefined();
    expect(parseResult(result).rationale).toContain('Guardian diff-coverage: FAIL');
  });

  it('leaves the rationale free of guardian text when the archive is absent', async () => {
    const specPath = path.join(tmpDir, 'spec.md');
    await fs.writeFile(specPath, '# Spec\n\n## Success Criteria\n\n- Does a thing.\n');

    const result = await handleOutcomeEval({
      specPath,
      diff: 'd',
      testOutput: 'PASS',
      path: tmpDir,
    });

    expect(parseResult(result).rationale).not.toContain('Guardian diff-coverage');
  });

  it('returns the full OutcomeVerdict shape', async () => {
    const specPath = path.join(tmpDir, 'spec.md');
    await fs.writeFile(specPath, '# Spec\n\n## Success Criteria\n\n- Does a thing.\n');

    const result = await handleOutcomeEval({
      specPath,
      diff: '',
      testOutput: '',
      path: tmpDir,
    });

    const verdict = parseResult(result);
    expect(verdict).toHaveProperty('verdict');
    expect(verdict).toHaveProperty('confidence');
    expect(verdict).toHaveProperty('authority');
    expect(verdict).toHaveProperty('judgedAgainst');
    expect(verdict).toHaveProperty('rationale');
    expect(verdict).toHaveProperty('unmetCriteria');
  });
});
