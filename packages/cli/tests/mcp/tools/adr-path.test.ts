import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse as parseYaml } from 'yaml';
import { handleManageAdr } from '../../../src/mcp/tools/adr';

/**
 * Regression tests for #2145: `manage_adr` must honour its `path` argument.
 *
 * The MCP server's `process.cwd()` is its LAUNCH checkout. The earlier #1507
 * change resolved the ADR root from that cwd and ignored `path`, so a -fleet
 * lane passing its isolated worktree as `path` wrote every ADR into the shared
 * launch checkout — while the response reported a basename that looked right.
 */

let base: string;
let launchRepo: string; // stands in for the MCP server's launch checkout (its cwd)
let worktree: string; // the caller's isolated worktree, passed as `path`
let originalCwd: string;

const decisionsRel = path.join('docs', 'knowledge', 'decisions');

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
}

function decisionFiles(root: string): string[] {
  try {
    return fs.readdirSync(path.join(root, decisionsRel)).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
}

function payload(resp: Awaited<ReturnType<typeof handleManageAdr>>): any {
  return JSON.parse(resp.content[0]!.text as string);
}

const canon = (p: string): string => fs.realpathSync.native(p);

const createArgs = (title: string, extra: Record<string, string> = {}) =>
  ({
    action: 'create' as const,
    title,
    context: 'ctx',
    decision: 'dec',
    consequences: 'cons',
    ...extra,
  }) as const;

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-path-'));
  launchRepo = path.join(base, 'launch');
  fs.mkdirSync(launchRepo, { recursive: true });
  git(launchRepo, 'init', '-b', 'main');
  git(launchRepo, 'config', 'user.email', 'test@example.com');
  git(launchRepo, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(launchRepo, 'README.md'), '# launch\n');
  git(launchRepo, 'add', '.');
  git(launchRepo, 'commit', '-m', 'init');
  worktree = path.join(base, 'wt');
  git(launchRepo, 'worktree', 'add', '-b', 'lane', worktree, 'HEAD');

  // The server process runs from the launch checkout.
  originalCwd = process.cwd();
  process.chdir(launchRepo);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(base, { recursive: true, force: true });
});

describe('manage_adr honours `path`, not process.cwd() (#2145)', () => {
  it('create writes under `path` and returns the absolute file actually written', async () => {
    const resp = await handleManageAdr({ path: worktree, ...createArgs('Lane ADR') });
    expect(resp.isError).toBeFalsy();
    const record = payload(resp);

    expect(decisionFiles(worktree)).toEqual(['0001-lane-adr.md']);
    expect(decisionFiles(launchRepo)).toEqual([]);

    expect(path.isAbsolute(record.file)).toBe(true);
    expect(fs.existsSync(record.file)).toBe(true);
    expect(canon(record.file)).toBe(canon(path.join(worktree, decisionsRel, '0001-lane-adr.md')));
  });

  it('allocates numbers from the `path` store, never from the launch checkout', async () => {
    // The launch checkout already holds a higher-numbered ADR the lane cannot see.
    fs.mkdirSync(path.join(launchRepo, decisionsRel), { recursive: true });
    fs.writeFileSync(
      path.join(launchRepo, decisionsRel, '0040-launch-only.md'),
      '---\nnumber: 0040\ntitle: Launch only\n---\n\n## Context\n\nx\n'
    );
    const first = payload(await handleManageAdr({ path: worktree, ...createArgs('One') }));
    const second = payload(await handleManageAdr({ path: worktree, ...createArgs('Two') }));
    expect([first.number, second.number]).toEqual(['0001', '0002']);
  });

  it('list / read / update all resolve against `path`', async () => {
    await handleManageAdr({ path: worktree, ...createArgs('Lane ADR') });

    const list = payload(await handleManageAdr({ path: worktree, action: 'list' }));
    expect(list.map((a: { number: string }) => a.number)).toEqual(['0001']);

    const read = payload(await handleManageAdr({ path: worktree, action: 'read', ref: '1' }));
    expect(canon(read.file)).toBe(canon(path.join(worktree, decisionsRel, '0001-lane-adr.md')));

    const upd = await handleManageAdr({
      path: worktree,
      action: 'update',
      ref: '1',
      status: 'accepted',
    });
    expect(upd.isError).toBeFalsy();
    const onDisk = fs.readFileSync(path.join(worktree, decisionsRel, '0001-lane-adr.md'), 'utf-8');
    expect(onDisk).toContain('status: accepted');
    expect(decisionFiles(launchRepo)).toEqual([]);
  });

  it('fails loudly when `path` does not exist instead of reporting "ADR not found"', async () => {
    const missing = path.join(base, 'does-not-exist');
    for (const input of [
      { path: missing, action: 'read' as const, ref: '1' },
      { path: missing, action: 'list' as const },
      { path: missing, ...createArgs('Nope') },
    ]) {
      const resp = await handleManageAdr(input);
      expect(resp.isError).toBe(true);
      expect(resp.content[0]!.text).toContain('does not exist');
    }
    expect(fs.existsSync(missing)).toBe(false);
  });
});

describe('manage_adr frontmatter fidelity (#2145)', () => {
  it('quotes a `source` beginning with "#" so YAML does not read it as null', async () => {
    const record = payload(
      await handleManageAdr({ path: worktree, ...createArgs('Sourced', { source: '#834' }) })
    );
    const raw = fs.readFileSync(record.file, 'utf-8');
    const fm = parseYaml(raw.split('---')[1]!);
    expect(fm.source).toBe('#834');
    // And the tool's own reader round-trips it unquoted.
    const read = payload(await handleManageAdr({ path: worktree, action: 'read', ref: '1' }));
    expect(read.source).toBe('#834');
  });

  it('quotes a title containing ": " so the frontmatter stays valid YAML', async () => {
    const record = payload(
      await handleManageAdr({ path: worktree, ...createArgs('Cache: keep it local') })
    );
    const fm = parseYaml(fs.readFileSync(record.file, 'utf-8').split('---')[1]!);
    expect(fm.title).toBe('Cache: keep it local');
  });

  it('defaults `date` to the LOCAL calendar date, not the UTC one', async () => {
    // 03:00 UTC on the 14th is still the evening of the 13th in Los Angeles —
    // the UTC-rollover the issue reports (a session dated the 13th stamped 14th).
    const originalTz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-14T03:00:00Z'));
    try {
      const record = payload(await handleManageAdr({ path: worktree, ...createArgs('Dated') }));
      expect(record.date).toBe('2026-09-13');
    } finally {
      vi.useRealTimers();
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it('keeps the Decision section body on create', async () => {
    const record = payload(
      await handleManageAdr({
        path: worktree,
        ...createArgs('Kept', { decision: 'We keep the decision text.' }),
      })
    );
    expect(fs.readFileSync(record.file, 'utf-8')).toMatch(
      /## Decision\n\nWe keep the decision text\./
    );
  });
});
