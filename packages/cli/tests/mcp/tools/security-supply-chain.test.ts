import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { handleRunSecurityScan, runSecurityScanDefinition } from '../../../src/mcp/tools/security';

// MCP parity for `check-security --supply-chain-json`.

const MEASURED_WITH_HIGH = {
  critical: 1,
  high: 2,
  moderate: 0,
  low: 0,
  info: 0,
  total: 3,
  packagesScanned: 42,
};

let project: string;

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'mcp-security-supply-chain-'));
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const answer = 42;\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'init');
  return dir;
}

function timelinePath(dir: string): string {
  return path.join(dir, '.harness', 'security', 'timeline.json');
}

afterEach(() => {
  if (project) rmSync(project, { recursive: true, force: true });
});

describe('run_security_scan supplyChainJson', () => {
  it('declares the input in its schema', () => {
    expect(runSecurityScanDefinition.inputSchema.properties).toHaveProperty('supplyChainJson');
  });

  it('records the supplied measurement in the timeline', async () => {
    project = makeProject();
    writeFileSync(path.join(project, 'audit.json'), JSON.stringify(MEASURED_WITH_HIGH));

    const response = await handleRunSecurityScan({ path: project, supplyChainJson: 'audit.json' });

    expect(response.isError).toBeUndefined();
    const snapshot = JSON.parse(readFileSync(timelinePath(project), 'utf-8')).snapshots.at(-1);
    expect(snapshot.supplyChain).toEqual(MEASURED_WITH_HIGH);
    // 1 critical * 5 + 2 high * 3 = 11 penalty → 89
    expect(snapshot.securityScore).toBe(89);
    expect(JSON.parse(response.content[0]!.text).supplyChain).toEqual(MEASURED_WITH_HIGH);
  });

  it('returns an error for malformed input and records nothing', async () => {
    project = makeProject();
    writeFileSync(path.join(project, 'audit.json'), 'not json');

    const response = await handleRunSecurityScan({ path: project, supplyChainJson: 'audit.json' });

    expect(response.isError).toBe(true);
    expect(response.content[0]!.text).toMatch(/is not valid JSON/);
    expect(existsSync(timelinePath(project))).toBe(false);
  });
});
