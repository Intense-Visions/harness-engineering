// THE PROPERTY: the `run_code_review` MCP tool hands the project's own
// `harness.config.json` to `runReviewPipeline`.
//
// It did not. `runReviewPipeline` reads `config` for the review seam's clump
// policy (Phase 6 of docs/changes/clumping/proposal.md), so the documented
// escape hatch `clumping.floorEnabled: false` genuinely did not work on the MCP
// path — the path an agent reaches code review through. One of the three
// production callers passed `config`, and that was the one anybody checked.
//
// Asserting through a real pipeline run was tried first and cannot work: the
// mechanical tier on a synthetic project emits zero findings, so
// `githubCommentCount` is 0 with the config read and 0 without it, and the two
// outcomes are indistinguishable. What is under test here is the ARGUMENT, so
// the argument is what is observed.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi, beforeEach } from 'vitest';

const runReviewPipeline = vi.fn();

vi.mock('@harness-engineering/core', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runReviewPipeline,
}));

const { handleRunCodeReview } = await import('../../../src/mcp/tools/review-pipeline');

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1234567..abcdefg 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' const a = 1;',
  '+const b = 2;',
].join('\n');

function pipelineResult() {
  return {
    skipped: false,
    stoppedByMechanical: false,
    assessment: 'approve',
    findings: [],
    strengths: [],
    terminalOutput: '',
    githubComments: [],
    exitCode: 0,
  };
}

describe('run_code_review forwards the project config to the pipeline', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-mcp-config-'));
    runReviewPipeline.mockReset();
    runReviewPipeline.mockResolvedValue(pipelineResult());
  });

  const write = (raw: string): void => fs.writeFileSync(path.join(dir, 'harness.config.json'), raw);

  it('carries the `clumping` block the adopter wrote into the pipeline call', async () => {
    write(JSON.stringify({ version: 1, name: 'p', clumping: { floorEnabled: false } }));
    await handleRunCodeReview({ path: dir, diff: DIFF });
    expect(runReviewPipeline).toHaveBeenCalledTimes(1);
    const passed = runReviewPipeline.mock.calls[0]![0] as { config?: Record<string, unknown> };
    expect(passed.config).toMatchObject({ clumping: { floorEnabled: false } });
  });

  it('POSITIVE CONTROL: omits the key AND says nothing when there is no config', async () => {
    // Two halves, because each one alone passes against a different defect.
    // `config` must be absent rather than `undefined` — an explicitly-undefined
    // key is the exact shape the clumping config layer documents as able to
    // clobber a default. And stderr must be SILENT: a project with no
    // harness.config.json is the ordinary case, not a degrade, and a reporter
    // that fires on it turns every review into a false alarm. Without this
    // second assertion, dropping the `existsSync` guard survives the suite.
    const stderr: string[] = [];
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown): boolean => (stderr.push(String(chunk)), true));
    try {
      await handleRunCodeReview({ path: dir, diff: DIFF });
      const passed = runReviewPipeline.mock.calls[0]![0] as Record<string, unknown>;
      expect('config' in passed).toBe(false);
      expect(stderr.join('')).toBe('');
    } finally {
      spy.mockRestore();
    }
  });

  it('reports a config that is THERE and will not parse, rather than swallowing it', async () => {
    const stderr: string[] = [];
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown): boolean => (stderr.push(String(chunk)), true));
    try {
      write('{ not json');
      await handleRunCodeReview({ path: dir, diff: DIFF });
      expect(stderr.join('')).toMatch(/IGNORED WHOLE/);
    } finally {
      spy.mockRestore();
    }
  });
});
