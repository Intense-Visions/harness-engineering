import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { SdlcEvent } from '@harness-engineering/types';
import {
  configureWaypointEmitter,
  emitSdlc,
  ensureWaypointEmitter,
  getWaypointEmitter,
  initWaypointEmitter,
  resetWaypointEmitterForTests,
  WaypointEmitter,
} from './emitter';
import { FileSpool } from './spool';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-waypoint-emitter-'));
  resetWaypointEmitterForTests();
});

afterEach(() => {
  resetWaypointEmitterForTests();
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(config: unknown): void {
  writeFileSync(join(dir, 'harness.config.json'), JSON.stringify(config), 'utf8');
}

function spooledEvents(): SdlcEvent[] {
  const spoolDir = join(dir, '.harness', 'spool');
  if (!existsSync(spoolDir)) return [];
  const events: SdlcEvent[] = [];
  for (const entry of readdirSync(spoolDir)) {
    if (!entry.endsWith('.jsonl')) continue;
    for (const line of readFileSync(join(spoolDir, entry), 'utf8').split('\n')) {
      if (line.length > 0) events.push(JSON.parse(line) as SdlcEvent);
    }
  }
  return events;
}

describe('waypoint/emitter — non-adopter invariance (PRD Story 1)', () => {
  it('installs nothing without a waypoint config and emits nothing', () => {
    expect(initWaypointEmitter(undefined, dir)).toBeNull();
    expect(initWaypointEmitter({}, dir)).toBeNull();
    expect(getWaypointEmitter()).toBeNull();
    expect(emitSdlc({ type: 'sdlc.claim.opened.v1', subject: 'item/x' })).toBeNull();
    // THE hard invariant: no sink => no new files anywhere under the repo.
    expect(existsSync(join(dir, '.harness'))).toBe(false);
  });

  it('ensureWaypointEmitter is a memoized no-op without config', () => {
    expect(ensureWaypointEmitter(dir)).toBeNull();
    expect(ensureWaypointEmitter(dir)).toBeNull();
    expect(existsSync(join(dir, '.harness'))).toBe(false);
  });

  it('ensureWaypointEmitter survives a malformed harness.config.json', () => {
    writeFileSync(join(dir, 'harness.config.json'), '{not json', 'utf8');
    expect(ensureWaypointEmitter(dir)).toBeNull();
  });
});

describe('waypoint/emitter — configured sink', () => {
  it('ensureWaypointEmitter installs from harness.config.json waypoint.sink', () => {
    writeConfig({ waypoint: { sink: { transport: 'spool' } } });
    const emitter = ensureWaypointEmitter(dir);
    expect(emitter).toBeInstanceOf(WaypointEmitter);
    // Second call returns the installed singleton.
    expect(ensureWaypointEmitter(dir)).toBe(emitter);
  });

  it('emitSdlc spools exactly one valid enveloped event per call', () => {
    initWaypointEmitter({ sink: { transport: 'spool', source: 'harness://repo/custom' } }, dir);
    const id = emitSdlc({
      type: 'sdlc.claim.opened.v1',
      subject: 'item/example',
      component: 'roadmap',
      data: { assignee: 'chad' },
    });
    expect(id).not.toBeNull();
    const events = spooledEvents();
    expect(events).toHaveLength(1);
    const event = events[0] as SdlcEvent;
    expect(event.id).toBe(id);
    expect(event.source).toBe('harness://repo/custom');
    expect(event.type).toBe('sdlc.claim.opened.v1');
    expect(event.actor.kind).toBe('agent');
    expect(event.actor.id).toBe('agent://harness/roadmap');
    expect((event.actor as { onBehalfOf?: string }).onBehalfOf).toBeDefined();
    expect(event.data).toEqual({ assignee: 'chad' });
  });

  it('defaults source to harness://repo/<basename> and honors explicit actors', () => {
    initWaypointEmitter({ sink: { transport: 'spool', onBehalfOf: 'user://someone' } }, dir);
    emitSdlc({
      type: 'sdlc.verify.graded.v1',
      subject: 'item/x',
      grade: 'V3',
      actor: { kind: 'human', id: 'user://approver' },
    });
    const [event] = spooledEvents();
    expect(event?.source).toBe(`harness://repo/${basename(dir)}`);
    expect(event?.actor).toEqual({ kind: 'human', id: 'user://approver' });
    expect(event?.grade).toBe('V3');
  });

  it('records failures without throwing and reports them on the emitter', () => {
    const emitter = initWaypointEmitter({ sink: { transport: 'spool' } }, dir);
    expect(emitter).not.toBeNull();
    // An invalid subject fails validation inside the spool append.
    const id = emitSdlc({ type: 'sdlc.claim.opened.v1', subject: '' });
    expect(id).toBeNull();
    expect(emitter?.emissionFailures).toHaveLength(1);
    expect(emitter?.emissionFailures[0]?.type).toBe('sdlc.claim.opened.v1');
  });

  it('notifies onEvent listeners for spooled events and isolates listener errors', () => {
    initWaypointEmitter({ sink: { transport: 'spool' } }, dir);
    const seen: string[] = [];
    const emitter = getWaypointEmitter() as WaypointEmitter;
    emitter.onEvent(() => {
      throw new Error('bad bridge');
    });
    const off = emitter.onEvent((event) => seen.push(event.type));
    const id = emitSdlc({ type: 'sdlc.build.finished.v1', subject: 'phase/execute' });
    expect(id).not.toBeNull();
    expect(seen).toEqual(['sdlc.build.finished.v1']);
    off();
    emitSdlc({ type: 'sdlc.build.finished.v1', subject: 'phase/verify' });
    expect(seen).toHaveLength(1);
  });

  it('respects maxEventsPerSegment from the sink config', () => {
    initWaypointEmitter({ sink: { transport: 'spool', maxEventsPerSegment: 1 } }, dir);
    emitSdlc({ type: 'sdlc.claim.opened.v1', subject: 'item/a' });
    emitSdlc({ type: 'sdlc.claim.opened.v1', subject: 'item/b' });
    expect(spooledEvents()).toHaveLength(1);
    expect(getWaypointEmitter()?.spoolSegment.droppedEvents).toBe(1);
  });

  it('never propagates spool exceptions to the caller (second seatbelt)', () => {
    const throwingSpool = new FileSpool({ spoolDir: join(dir, 's'), segmentId: 'X' });
    throwingSpool.append = () => {
      throw new Error('disk on fire');
    };
    const emitter = new WaypointEmitter({
      source: 'harness://repo/test',
      onBehalfOf: 'user://x',
      spool: throwingSpool,
    });
    configureWaypointEmitter(emitter);
    expect(() => emitSdlc({ type: 'sdlc.claim.opened.v1', subject: 'item/x' })).not.toThrow();
    expect(emitter.emissionFailures).toHaveLength(1);
  });
});
