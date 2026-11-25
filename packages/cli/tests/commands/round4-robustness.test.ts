import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runReviewTier } from '../../src/commands/review-tier';
import { runReviewProvenanceRender } from '../../src/commands/review-provenance';
import { runGitIn, type CwdGit } from '../../src/review-receipts/io';

/**
 * Round 4, fix 12. autopilot-state.json is read like a receipt (a regular file of at most 5 MB);
 * review-tier answers `full` with reason diff-too-large instead of failing on a diff it cannot
 * buffer; review.backend comes from the repository top's harness.config.json, not the nearest
 * one above the working directory.
 */
let tmp: string;
const g = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: tmp, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
let base: string;
let head: string;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-r4-robust-')));
  g('init', '-q');
  fs.writeFileSync(path.join(tmp, 'a.txt'), 'a\n');
  g('add', '.');
  g('commit', '-q', '--no-verify', '-m', 'a');
  base = g('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(tmp, 'b.txt'), 'b\n');
  g('add', '.');
  g('commit', '-q', '--no-verify', '-m', 'b');
  head = g('rev-parse', 'HEAD');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('autopilot-state.json is read as a bounded regular file', () => {
  const sessionDir = () => path.join(tmp, '.harness', 'sessions', 's1');
  const stateFile = () => path.join(sessionDir(), 'autopilot-state.json');
  beforeEach(() => fs.mkdirSync(path.join(sessionDir(), 'reviews'), { recursive: true }));
  const notes = () => {
    const out = runReviewProvenanceRender({ session: 's1', cwd: tmp });
    return out.ok ? out.value.notes : [];
  };
  it('a regular state file is read', () => {
    fs.writeFileSync(stateFile(), JSON.stringify({ phases: [] }));
    expect(notes()).toEqual([]);
  });
  it('a state file over 5 MB is "no state", not read', () => {
    fs.writeFileSync(stateFile(), `{"phases":[],"pad":"${'x'.repeat(5 * 1024 * 1024)}"}`);
    expect(notes()[0]).toMatch(/^expected reviews unknown \(autopilot-state.json is absent/);
  });
  it('a directory named autopilot-state.json is "no state"', () => {
    fs.mkdirSync(stateFile());
    expect(notes()[0]).toMatch(/^expected reviews unknown \(autopilot-state.json is absent/);
  });
  it.skipIf(process.platform === 'win32')('a FIFO is refused before it is opened (no hang)', () => {
    execFileSync('mkfifo', [stateFile()]);
    expect(notes()[0]).toMatch(/^expected reviews unknown \(autopilot-state.json is absent/);
  });
});

describe('review-tier: a diff too large to buffer is full, not an error', () => {
  const enobufs: CwdGit = (args, cwd) => {
    if (args[0] === 'diff' && args.includes('--text')) {
      throw Object.assign(new Error('spawnSync git ENOBUFS'), { code: 'ENOBUFS' });
    }
    return runGitIn(args, cwd);
  };
  it('ENOBUFS on the diff text -> full, reason diff-too-large', () => {
    const out = runReviewTier({ moment: 'phase', base, head, cwd: tmp, git: enobufs });
    expect(out.ok && out.value).toMatchObject({ tier: 'full', reasons: ['diff-too-large'] });
  });
  it('any other diff failure is still an error', () => {
    const broken: CwdGit = (args, cwd) => {
      if (args[0] === 'diff' && args.includes('--text')) throw new Error('fatal: bad object');
      return runGitIn(args, cwd);
    };
    expect(runReviewTier({ moment: 'phase', base, head, cwd: tmp, git: broken }).ok).toBe(false);
  });
});

describe('review-tier reads review.backend from the repository top', () => {
  const config = (dir: string, backend: string) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ review: { backend } })
    );
  };
  it('from a subdirectory holding its own harness.config.json, the top one decides', () => {
    config(tmp, 'agent');
    const example = path.join(tmp, 'examples', 'hello');
    config(example, 'pipeline');
    const out = runReviewTier({ moment: 'final', cwd: example, pipelineRunner: true });
    expect(out.ok && out.value.backend).toMatchObject({ backend: 'agent' });
  });
  it('no config at the top: the default, whatever a subdirectory holds', () => {
    const example = path.join(tmp, 'examples', 'hello');
    config(example, 'pipeline');
    const out = runReviewTier({ moment: 'final', cwd: example, pipelineRunner: true });
    expect(out.ok && out.value.backend).toEqual({ backend: 'agent', degraded: false });
  });
  it('an invalid review.backend at the top is an error naming the file', () => {
    config(tmp, 'robot');
    const out = runReviewTier({ moment: 'final', cwd: tmp });
    expect(!out.ok && out.error.message).toMatch(/review\.backend must be one of agent, pipeline/);
  });
});
