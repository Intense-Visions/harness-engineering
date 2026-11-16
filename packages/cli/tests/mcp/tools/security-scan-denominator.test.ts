import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { handleRunSecurityScan } from '../../../src/mcp/tools/security';

/**
 * Issue #2622: `run_security_scan` on a nonexistent path returned
 * `scannedFiles: 0` with no `isError` — byte-identical to a clean scan — and a
 * zero-file scan was recorded to the security timeline as a posture point.
 */
describe('run_security_scan denominator (#2622)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-sec-denom-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const parse = (res: { content: Array<{ text: string }> }) =>
    JSON.parse(res.content[0]!.text) as Record<string, unknown>;

  it('is an error for a nonexistent path', async () => {
    const missing = path.join(tmp, 'does-not-exist');
    const res = await handleRunSecurityScan({ path: missing, record: false });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('does not exist');
  });

  it('is an error for a path that is a file, not a directory', async () => {
    const file = path.join(tmp, 'a.ts');
    fs.writeFileSync(file, 'export const a = 1;\n');
    const res = await handleRunSecurityScan({ path: file, record: false });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('not a directory');
  });

  it('reports an empty directory as an abstention, not a clean pass', async () => {
    const res = await handleRunSecurityScan({ path: tmp, record: false });
    expect(res.isError).toBeFalsy();
    const body = parse(res);
    expect(body.scannedFiles).toBe(0);
    expect(body.abstained).toBe(true);
    expect(typeof body.abstentionReason).toBe('string');
  });

  it('never records a zero-file scan to the security timeline', async () => {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: tmp, stdio: 'ignore' });
    git('init', '-q');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    fs.writeFileSync(path.join(tmp, 'README.txt'), 'nothing scannable\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
    const timeline = path.join(tmp, '.harness', 'security', 'timeline.json');

    const res = await handleRunSecurityScan({ path: tmp }); // record defaults to true
    expect(fs.existsSync(timeline)).toBe(false);
    expect(parse(res).abstained).toBe(true);
  });

  it('positive control: a directory with a vulnerable file still reports findings', async () => {
    fs.mkdirSync(path.join(tmp, 'src'));
    fs.writeFileSync(
      path.join(tmp, 'src', 'bad.ts'),
      'export function run(userInput: string) {\n  return eval(userInput);\n}\n'
    );
    const res = await handleRunSecurityScan({ path: tmp, record: false });
    expect(res.isError).toBeFalsy();
    const body = parse(res);
    expect(body.scannedFiles).toBeGreaterThan(0);
    expect(body.abstained).toBeFalsy();
    expect((body.findings as unknown[]).length).toBeGreaterThan(0);
  });
});
