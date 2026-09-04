import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { resetWaypointEmitterForTests } from '@harness-engineering/core';
import type { SdlcEvent } from '@harness-engineering/types';
import { createWaypointCommand } from '../../src/commands/waypoint';

async function runCommand(args: string[]): Promise<void> {
  const parent = new Command();
  parent.option('--json', 'JSON output');
  parent.addCommand(createWaypointCommand());
  parent.exitOverride();
  await parent.parseAsync(['node', 'test', '--json', 'waypoint', ...args]);
}

let tmpDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-waypoint-cmd-'));
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir) as ReturnType<typeof vi.spyOn>;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as ReturnType<typeof vi.spyOn>;
  resetWaypointEmitterForTests();
  process.exitCode = undefined;
});

afterEach(() => {
  resetWaypointEmitterForTests();
  cwdSpy.mockRestore();
  logSpy.mockRestore();
  process.exitCode = undefined;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function configureSink(): void {
  fs.writeFileSync(
    path.join(tmpDir, 'harness.config.json'),
    JSON.stringify({ waypoint: { sink: { transport: 'spool' } } }),
    'utf8'
  );
}

function lastJsonOutput(): Record<string, unknown> {
  const call = logSpy.mock.calls.at(-1);
  return JSON.parse(String(call?.[0])) as Record<string, unknown>;
}

function spooledEvents(): SdlcEvent[] {
  const spoolDir = path.join(tmpDir, '.harness', 'spool');
  if (!fs.existsSync(spoolDir)) return [];
  const events: SdlcEvent[] = [];
  for (const entry of fs.readdirSync(spoolDir)) {
    if (!entry.endsWith('.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(spoolDir, entry), 'utf8').split('\n')) {
      if (line.length > 0) events.push(JSON.parse(line) as SdlcEvent);
    }
  }
  return events;
}

describe('harness waypoint record-provenance', () => {
  it('is a no-op without a configured sink', async () => {
    const file = path.join(tmpDir, 'provenance.json');
    fs.writeFileSync(file, JSON.stringify({ slug: 's', stages: [] }), 'utf8');
    await runCommand(['record-provenance', file]);
    expect(lastJsonOutput()).toMatchObject({ recorded: false });
    expect(fs.existsSync(path.join(tmpDir, '.harness'))).toBe(false);
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('spools one sdlc.build.finished.v1 for a provenance artifact', async () => {
    configureSink();
    const artifactDir = path.join(tmpDir, 'docs', 'changes', 'my-slug');
    fs.mkdirSync(artifactDir, { recursive: true });
    const file = path.join(artifactDir, 'provenance.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ slug: 'my-slug', issues: [1], stages: ['plan', 'execute'] }),
      'utf8'
    );
    await runCommand(['record-provenance', file]);
    expect(lastJsonOutput()).toMatchObject({ recorded: true });
    const [event] = spooledEvents();
    expect(event?.type).toBe('sdlc.build.finished.v1');
    expect(event?.subject).toBe('item/my-slug');
    expect(event?.data).toMatchObject({ artifact: 'provenance', stages: ['plan', 'execute'] });
  });

  it('derives the item from the directory name when slug is absent', async () => {
    configureSink();
    const artifactDir = path.join(tmpDir, 'docs', 'changes', 'dir-slug');
    fs.mkdirSync(artifactDir, { recursive: true });
    const file = path.join(artifactDir, 'provenance.json');
    fs.writeFileSync(file, JSON.stringify({ stages: [] }), 'utf8');
    await runCommand(['record-provenance', file]);
    expect(spooledEvents()[0]?.subject).toBe('item/dir-slug');
  });

  it('fails with exit code 1 on an unreadable file', async () => {
    configureSink();
    await runCommand(['record-provenance', path.join(tmpDir, 'missing.json')]);
    expect(process.exitCode).toBe(1);
  });
});

describe('harness waypoint record-handoff', () => {
  it('spools review.requested for a done handoff record', async () => {
    configureSink();
    const file = path.join(tmpDir, 'handoff.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        status: 'done',
        fleet: 'roadmap-fleet',
        item: 'my-slug',
        summary: 'shipped',
        evidence: [{ kind: 'pr', ref: 'https://example.test/pr/9' }],
        next_steps: [],
      }),
      'utf8'
    );
    await runCommand(['record-handoff', file]);
    expect(lastJsonOutput()).toMatchObject({ recorded: true });
    const [event] = spooledEvents();
    expect(event?.type).toBe('sdlc.review.requested.v1');
    expect(event?.data).toMatchObject({ artifact: 'handoff', status: 'done' });
  });

  it('rejects an invalid handoff record with exit code 1', async () => {
    configureSink();
    const file = path.join(tmpDir, 'handoff.json');
    fs.writeFileSync(file, JSON.stringify({ status: 'parked' }), 'utf8');
    await runCommand(['record-handoff', file]);
    expect(process.exitCode).toBe(1);
    expect(spooledEvents()).toEqual([]);
  });
});

describe('harness waypoint status', () => {
  it('reports an empty spool', async () => {
    await runCommand(['status']);
    expect(lastJsonOutput()).toMatchObject({ segments: 0, events: 0, droppedEvents: 0 });
  });

  it('reports segment, event, and drop counts', async () => {
    configureSink();
    const file = path.join(tmpDir, 'handoff.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        status: 'done',
        fleet: 'roadmap-fleet',
        item: 'x',
        summary: 's',
        evidence: [],
        next_steps: [],
      }),
      'utf8'
    );
    await runCommand(['record-handoff', file]);
    await runCommand(['status']);
    const status = lastJsonOutput();
    expect(status.segments).toBe(1);
    expect(status.events).toBe(1);
    expect(typeof status.oldestEventTime).toBe('string');
  });
});
