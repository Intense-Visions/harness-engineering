import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { deriveAcceptanceAuthority } from '@harness-engineering/intelligence';
import {
  acceptanceEvalDefinition,
  handleAcceptanceEval,
  resolveTestContent,
} from '../../../src/mcp/tools/acceptance-eval.js';

let tmpDir: string;

function parseResult(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acceptance-eval-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('acceptance_eval definition', () => {
  it('has the correct tool name', () => {
    expect(acceptanceEvalDefinition.name).toBe('acceptance_eval');
  });

  it('requires only specPath', () => {
    expect(acceptanceEvalDefinition.inputSchema.required).toEqual(['specPath']);
  });

  it('exposes optional model, testGlobs and testContent inputs', () => {
    const props = acceptanceEvalDefinition.inputSchema.properties;
    expect(props.model).toBeDefined();
    expect(props.testGlobs).toBeDefined();
    expect(props.testContent).toBeDefined();
  });

  it('does NOT expose a path / graph-persistence input (deferred)', () => {
    expect(
      (acceptanceEvalDefinition.inputSchema.properties as Record<string, unknown>).path
    ).toBeUndefined();
  });
});

describe('handleAcceptanceEval input contract', () => {
  it('errors when specPath is missing', async () => {
    // @ts-expect-error intentionally omitting specPath
    const result = await handleAcceptanceEval({});
    expect(result.isError).toBe(true);
    expect(parseResult(result).error).toMatch(/specPath/);
  });
});

describe('handleAcceptanceEval degrade-safe behaviour', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
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

    const result = await handleAcceptanceEval({ specPath });

    expect(result.isError).toBeUndefined();
    const verdict = parseResult(result);
    expect(verdict.measurability).toBe('INCONCLUSIVE');
    expect(verdict.confidence).toBe('low');
    expect(verdict.authority).toBe('advisory');
  });

  it('returns the full AcceptanceVerdict shape with TS-derived authority', async () => {
    const specPath = path.join(tmpDir, 'spec.md');
    await fs.writeFile(specPath, '# Spec\n\n## Success Criteria\n\n- Does a thing.\n');

    const result = await handleAcceptanceEval({ specPath });
    const verdict = parseResult(result);

    expect(verdict).toHaveProperty('measurability');
    expect(verdict).toHaveProperty('confidence');
    expect(verdict).toHaveProperty('authority');
    expect(verdict).toHaveProperty('judgedAgainst');
    expect(verdict).toHaveProperty('rationale');
    expect(Array.isArray(verdict.criteriaFindings)).toBe(true);
    expect(Array.isArray(verdict.coverageFindings)).toBe(true);

    // Success criterion 4: authority is exactly the TS-derived value,
    // never read from the LLM.
    expect(verdict.authority).toBe(
      deriveAcceptanceAuthority(verdict.measurability, verdict.confidence)
    );
  });
});

describe('resolveTestContent (b) evidence resolution', () => {
  it('returns testContent verbatim when provided', async () => {
    const out = await resolveTestContent({ specPath: 'x', testContent: 'direct snippet' });
    expect(out).toBe('direct snippet');
  });

  it('concatenates contents of all files matched by testGlobs with path headers', async () => {
    const a = path.join(tmpDir, 'a.test.ts');
    const b = path.join(tmpDir, 'b.test.ts');
    await fs.writeFile(a, 'AAA');
    await fs.writeFile(b, 'BBB');

    const out = await resolveTestContent({
      specPath: 'x',
      testGlobs: [path.join(tmpDir, '*.test.ts')],
    });

    expect(out).toContain('AAA');
    expect(out).toContain('BBB');
    // Path headers come from the glob lib, which returns POSIX separators even
    // on win32; compare separator-agnostically so the assertion holds cross-OS.
    const slash = (s: string) => s.replace(/\\/g, '/');
    expect(slash(out ?? '')).toContain(slash(a));
    expect(slash(out ?? '')).toContain(slash(b));
  });

  it('returns undefined when neither testContent nor testGlobs yields content', async () => {
    expect(await resolveTestContent({ specPath: 'x' })).toBeUndefined();
    expect(
      await resolveTestContent({ specPath: 'x', testGlobs: [path.join(tmpDir, 'nope-*.ts')] })
    ).toBeUndefined();
  });
});
