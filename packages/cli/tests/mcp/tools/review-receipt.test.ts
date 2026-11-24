import { REVIEW_GATE_FAILURE_CODES } from '@harness-engineering/core';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  checkReviewReceiptDefinition,
  handleCheckReviewReceipt,
} from '../../../src/mcp/tools/review-receipt';
import { applyCompaction } from '../../../src/mcp/middleware/compaction';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
let project: string;
let dir: string;
const gitAt =
  (head: string, file = 'src/a.ts') =>
  (args: string[]) =>
    args[0] === 'rev-parse' ? head : args[0] === 'diff' ? file : '';
const git = gitAt(HEAD);
const body = (r: Awaited<ReturnType<typeof handleCheckReviewReceipt>>) =>
  JSON.parse(r.content[0]?.text ?? '{}');

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-review-receipt-'));
  dir = path.join(project, '.harness', 'sessions', 's1', 'reviews', 'phase-0');
  fs.mkdirSync(dir, { recursive: true });
  // phase-0's base is the session's starting commit (the receipt gate recomputes it).
  const state = path.join(project, '.harness', 'sessions', 's1', 'autopilot-state.json');
  fs.writeFileSync(state, JSON.stringify({ startingCommit: BASE }));
});
afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

function write(ran: boolean) {
  fs.writeFileSync(
    path.join(dir, 'compliance-bug.json'),
    JSON.stringify({
      schemaVersion: 1,
      reviewerId: 'compliance-bug',
      head: HEAD,
      examinedFiles: ['src/a.ts'],
      findings: [],
    })
  );
  fs.writeFileSync(
    path.join(dir, 'receipt.json'),
    JSON.stringify({
      schemaVersion: 1,
      moment: 'phase',
      tier: 'light',
      backend: 'agent',
      diff: { base: BASE, head: HEAD },
      coldContext: true,
      priorFindingsSupplied: false,
      reviewers: [
        ran
          ? {
              id: 'compliance-bug',
              required: true,
              ran: true,
              findingsPath: 'compliance-bug.json',
            }
          : { id: 'compliance-bug', required: true, ran: false },
      ],
      blocking: 0,
      advisory: 0,
    })
  );
}

describe('check_review_receipt', () => {
  it('declares path and receipt as required', () => {
    expect(checkReviewReceiptDefinition.name).toBe('check_review_receipt');
    expect(checkReviewReceiptDefinition.inputSchema.required).toEqual(['path', 'receipt']);
  });
  it('returns pass:true for a passing receipt given relative to the project root', async () => {
    write(true);
    const r = await handleCheckReviewReceipt(
      { path: project, receipt: path.relative(project, dir) },
      { git }
    );
    expect(r.isError).toBeUndefined();
    expect(body(r)).toMatchObject({ pass: true, reviewersRun: 1, reviewersRequired: 1 });
  });
  it('returns pass:false and names the reviewer when a required reviewer did not run', async () => {
    write(false);
    const r = await handleCheckReviewReceipt({ path: project, receipt: dir }, { git });
    expect(body(r).pass).toBe(false);
    expect(body(r).failures[0]).toMatchObject({
      code: 'REQUIRED_REVIEWER_NOT_RUN',
      reviewerId: 'compliance-bug',
    });
  });
  it('returns pass:false with RECEIPT_MISSING when there is no receipt', async () => {
    const r = await handleCheckReviewReceipt({ path: project, receipt: 'nope' }, { git });
    expect(body(r)).toMatchObject({ pass: false, failures: [{ code: 'RECEIPT_MISSING' }] });
  });
  it('fix 7: refuses a receipt path outside the project, without reading it', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-outside-'));
    fs.writeFileSync(path.join(outside, 'receipt.json'), '{}');
    for (const receipt of [outside, path.join('..', path.basename(outside))]) {
      const r = await handleCheckReviewReceipt({ path: project, receipt }, { git });
      expect(body(r)).toMatchObject({ pass: false, failures: [{ code: 'GATE_ERROR' }] });
      expect(body(r).failures[0].message).toMatch(/inside the project/);
    }
    fs.rmSync(outside, { recursive: true, force: true });
  });
  /**
   * Fix 3 (security-7). Input partition for the confined receipt path: a symlinked directory
   * that leaves the project, a receipt.json that is a symlink out of it, and a missing file
   * behind such a link. Each is refused as outside the project; none is read or reported missing.
   */
  describe.skipIf(process.platform === 'win32')('confine resolves real paths', () => {
    let outside: string;
    beforeEach(() => {
      outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-outside-'));
      fs.writeFileSync(path.join(outside, 'receipt.json'), '{"secret":1}');
    });
    afterEach(() => fs.rmSync(outside, { recursive: true, force: true }));
    const refused = async (receipt: string) => {
      const r = await handleCheckReviewReceipt({ path: project, receipt }, { git });
      expect(body(r)).toMatchObject({ pass: false, failures: [{ code: 'GATE_ERROR' }] });
      expect(body(r).failures[0].message).toBe('the receipt path must be inside the project');
    };
    it('a symlinked directory inside the project that points outside it', async () => {
      fs.symlinkSync(outside, path.join(project, 'link'));
      await refused('link');
      await refused(path.join('link', 'receipt.json'));
      await refused(path.join('link', 'absent', 'receipt.json'));
    });
    it('a receipt.json that is itself a symlink out of the project', async () => {
      fs.symlinkSync(path.join(outside, 'receipt.json'), path.join(dir, 'receipt.json'));
      await refused(dir);
    });
  });
  /**
   * Input partition for the `moment` argument: absent, each enum member (the directory here is
   * phase-0, so `phase` agrees and the other two conflict), a typo, wrong case, empty, and a
   * non-string. An invalid value is an argument error, never MOMENT_UNKNOWN.
   */
  const failureCodes = (r: Awaited<ReturnType<typeof handleCheckReviewReceipt>>) =>
    [body(r).failures ?? []].flat().map((f: { code: string }) => f.code);
  it.each([
    [undefined, []],
    ['phase', []],
    ['final', ['MOMENT_MISMATCH']],
    ['standalone', ['MOMENT_MISMATCH']],
  ])('moment %j against a phase-0 directory -> %j', async (moment, codes) => {
    write(true);
    const input = { path: project, receipt: dir, ...(moment !== undefined && { moment }) };
    expect(failureCodes(await handleCheckReviewReceipt(input, { git }))).toEqual(codes);
  });
  it.each(['fianl', 'PHASE', '', 7, null, ['phase']])(
    'moment %j is an invalid argument (GATE_ERROR naming the three values)',
    async (moment) => {
      write(true);
      const r = await handleCheckReviewReceipt({ path: project, receipt: dir, moment }, { git });
      expect(r.isError).toBe(true);
      expect(body(r)).toMatchObject({ pass: false, failures: [{ code: 'GATE_ERROR' }] });
      expect(body(r).failures[0].message).toBe('moment must be one of phase, final, standalone');
    }
  );
  it('declares the three moments as an enum in the input schema', () => {
    expect(checkReviewReceiptDefinition.inputSchema.properties.moment).toMatchObject({
      enum: ['phase', 'final', 'standalone'],
    });
  });
  it('GATE_ERROR is a declared gate failure code', () => {
    expect(REVIEW_GATE_FAILURE_CODES).toContain('GATE_ERROR');
  });
  it('returns an error response, still pass:false, when an argument is missing', async () => {
    const r = await handleCheckReviewReceipt({ path: project }, { git });
    expect(r.isError).toBe(true);
    expect(body(r).pass).toBe(false);
  });
});

describe('check_review_receipt: the shape of `failures` on the wire (N5)', () => {
  /** The handler as the server registers it: behind the shared compaction middleware. */
  const call = async (g: (args: string[]) => string) => {
    const handlers = applyCompaction(
      { check_review_receipt: (input) => handleCheckReviewReceipt(input, { git: g }) },
      { projectRoot: project }
    );
    const r = await handlers.check_review_receipt!({ path: project, receipt: dir });
    const text = r.content[0]?.text ?? '';
    return JSON.parse(text.slice(text.indexOf('{'))) as { pass: boolean; failures?: unknown };
  };
  it('omits failures on a pass, sends one failure as an object and several as an array', async () => {
    write(true);
    const pass = await call(git);
    expect(pass.pass).toBe(true);
    expect('failures' in pass).toBe(false);

    const stale = await call(gitAt('c'.repeat(40)));
    expect(stale.pass).toBe(false);
    expect(Array.isArray(stale.failures)).toBe(false);
    expect(stale.failures).toMatchObject({ code: 'HEAD_MISMATCH' });

    const two = await call(gitAt('c'.repeat(40), 'src/other.ts'));
    expect(two.pass).toBe(false);
    expect(Array.isArray(two.failures)).toBe(true);
    expect((two.failures as Array<{ code: string }>).map((f) => f.code)).toEqual([
      'HEAD_MISMATCH',
      'EXAMINED_OUTSIDE_DIFF',
    ]);
  });
  it('the description promises exactly that shape and tells the caller to gate on pass', () => {
    const d = checkReviewReceiptDefinition.description;
    expect(d).not.toContain('failures[');
    expect(d).toMatch(/`failures` is absent on a pass/);
    expect(d).toMatch(
      /a single object \{code, reviewerId\?, message\} when there is exactly one failure/
    );
    expect(d).toMatch(/an array of them when there are two or more/);
    expect(d).toMatch(/Gate on `pass` alone/);
  });
});
