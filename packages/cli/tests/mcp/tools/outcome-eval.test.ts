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
