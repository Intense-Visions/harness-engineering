/**
 * `harness waypoint ship` wiring (D5 / SC-1, SC-8 of
 * `docs/changes/waypoint-spool-shipper/proposal.md`).
 *
 * The shipper's own logic is covered in core. What these pin is the part that
 * cannot be tested from there: that the command exists, is registered, and
 * reaches the shipper — and that a repo with no `ship` config makes no network
 * call at all. A shipper nothing invokes is the exact failure mode this whole
 * line of work exists to close.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createWaypointCommand } from '../../src/commands/waypoint';

let cwd: string;
let originalCwd: string;
let logs: string[];
let errors: string[];
const savedEnv = { ...process.env };

function writeConfig(waypoint: unknown): void {
  fs.writeFileSync(path.join(cwd, 'harness.config.json'), JSON.stringify({ waypoint }, null, 2));
}

function writeSpool(lines: readonly string[]): void {
  const spoolDir = path.join(cwd, '.harness', 'spool');
  fs.mkdirSync(spoolDir, { recursive: true });
  fs.writeFileSync(path.join(spoolDir, 'sdlc-seg1.jsonl'), `${lines.join('\n')}\n`, 'utf8');
}

const event = (n: number): string =>
  JSON.stringify({
    id: `01ABCDEFGH${String(n).padStart(16, '0')}`,
    type: 'sdlc.intent.created.v1',
    subject: `item/x-${n}`,
    time: '2026-09-07T00:00:00.000Z',
  });

async function run(args: string[]): Promise<void> {
  const cmd = createWaypointCommand();
  cmd.exitOverride();
  await cmd.parseAsync(['node', 'waypoint', ...args]);
}

beforeEach(() => {
  originalCwd = process.cwd();
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'waypoint-ship-cli-'));
  process.chdir(cwd);
  logs = [];
  errors = [];
  delete process.env.PNYON_WAYPOINT_INGEST_TOKEN;
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.join(' '));
  });
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
    logs.push(a.join(' '));
  });
  vi.spyOn(console, 'info').mockImplementation((...a: unknown[]) => {
    logs.push(a.join(' '));
  });
});

afterEach(() => {
  process.chdir(originalCwd);
  process.env = { ...savedEnv };
  process.exitCode = 0;
  vi.restoreAllMocks();
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('harness waypoint ship — registration', () => {
  it('is a registered subcommand', () => {
    const names = createWaypointCommand()
      .commands.map((c) => c.name())
      .sort();
    // Without this the shipper is unreachable no matter how correct it is.
    expect(names).toContain('ship');
  });
});

describe('harness waypoint ship — non-adopter invariance (SC-1)', () => {
  it('makes no network call and exits 0 when no ship config exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    writeSpool([event(1)]);

    await run(['ship']);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(process.exitCode).not.toBe(1);
    expect(logs.join('\n')).toContain('local spool');
  });

  it('makes no network call when there is no harness.config.json at all', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await run(['ship']);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(process.exitCode).not.toBe(1);
  });
});

describe('harness waypoint ship — credential handling', () => {
  it('refuses without the token and names the env var, not a config key', async () => {
    writeConfig({
      sink: {
        transport: 'spool',
        ship: { url: 'https://waypoint.test', outpost: 'o', project: 'p' },
      },
    });
    writeSpool([event(1)]);

    await run(['ship']);

    expect(process.exitCode).toBe(1);
    const message = errors.join('\n');
    expect(message).toContain('PNYON_WAYPOINT_INGEST_TOKEN');
    // The token must not be configurable in the committed file.
    expect(message).toContain('cannot be committed');
  });
});

describe('harness waypoint ship — dry run', () => {
  it('reports the backlog without sending or checkpointing', async () => {
    writeConfig({
      sink: {
        transport: 'spool',
        ship: { url: 'https://waypoint.test', outpost: 'o', project: 'p' },
      },
    });
    writeSpool([event(1), event(2)]);
    process.env.PNYON_WAYPOINT_INGEST_TOKEN = 'tok';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await run(['ship', '--dry-run']);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('2');
    expect(fs.existsSync(path.join(cwd, '.harness', 'spool', '.shipped.json'))).toBe(false);
  });
});

describe('harness waypoint status — shipping visibility (SC-8)', () => {
  it('reports unshipped count alongside spool health', async () => {
    writeSpool([event(1), event(2), event(3)]);

    await run(['--json', 'status']);

    const status = JSON.parse(logs.join('')) as { events: number; unshipped: number };
    expect(status.events).toBe(3);
    expect(status.unshipped).toBe(3);
  });

  it('reports zero unshipped once the checkpoint covers the spool', async () => {
    writeSpool([event(1), event(2)]);
    fs.writeFileSync(
      path.join(cwd, '.harness', 'spool', '.shipped.json'),
      JSON.stringify({ marks: { seg1: `01ABCDEFGH${'2'.padStart(16, '0')}` } })
    );

    await run(['--json', 'status']);

    const status = JSON.parse(logs.join('')) as { unshipped: number };
    expect(status.unshipped).toBe(0);
  });

  it('reports the permanently-refused count', async () => {
    writeSpool([event(1)]);
    fs.writeFileSync(
      path.join(cwd, '.harness', 'spool', 'rejected.jsonl'),
      `${JSON.stringify({ id: '01X', result: 'scrub-rejected', at: 'now', event: '{}' })}\n`
    );

    await run(['--json', 'status']);

    const status = JSON.parse(logs.join('')) as { rejected: number };
    expect(status.rejected).toBe(1);
  });
});
