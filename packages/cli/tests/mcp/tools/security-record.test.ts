import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { handleRunSecurityScan } from '../../../src/mcp/tools/security';

/**
 * Issue #2474: `run_security_scan` appends to the TRACKED
 * `.harness/security/timeline.json` as a side effect. Read-only internal callers
 * (the health snapshot) must be able to scan without dirtying the tree.
 */
describe('handleRunSecurityScan timeline recording (#2474)', () => {
  let repo: string;
  let timeline: string;
  const seeded = JSON.stringify({ version: 1, snapshots: [], findingLifecycles: [] }) + '\n';

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-sec-record-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    git('init', '-q');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
    timeline = path.join(repo, '.harness', 'security', 'timeline.json');
    fs.mkdirSync(path.dirname(timeline), { recursive: true });
    fs.writeFileSync(timeline, seeded);
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('leaves a tracked timeline byte-identical when record is false', async () => {
    const res = await handleRunSecurityScan({ path: repo, record: false });
    expect(res.isError).toBeFalsy();
    expect(fs.readFileSync(timeline, 'utf8')).toBe(seeded);
  });

  it('still records by default (MCP tool behaviour unchanged)', async () => {
    const res = await handleRunSecurityScan({ path: repo });
    expect(res.isError).toBeFalsy();
    expect(fs.readFileSync(timeline, 'utf8')).not.toBe(seeded);
  });
});
