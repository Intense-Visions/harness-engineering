import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetWaypointEmitterForTests } from '@harness-engineering/core';
import type { SdlcEvent } from '@harness-engineering/types';
import {
  emitAcceptanceVerdictEvent,
  emitOutcomeVerdictEvent,
  emitUatSignoffEvent,
  specSlug,
} from './waypoint-emission.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-waypoint-cli-'));
  resetWaypointEmitterForTests();
});

afterEach(() => {
  resetWaypointEmitterForTests();
  rmSync(dir, { recursive: true, force: true });
});

function configureSink(): void {
  writeFileSync(
    join(dir, 'harness.config.json'),
    JSON.stringify({ waypoint: { sink: { transport: 'spool' } } }),
    'utf8'
  );
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

describe('specSlug', () => {
  it('extracts the docs/changes slug', () => {
    expect(specSlug('docs/changes/my-change/proposal.md')).toBe('my-change');
    expect(specSlug('/abs/repo/docs/changes/my-change/proposal.md')).toBe('my-change');
    expect(specSlug('docs\\changes\\win-change\\proposal.md')).toBe('win-change');
  });

  it('falls back to the basename without extension', () => {
    expect(specSlug('specs/feature-spec.md')).toBe('feature-spec');
  });
});

describe('verdict emission helpers', () => {
  it('are no-ops without a configured sink (no files created)', async () => {
    await emitOutcomeVerdictEvent(dir, { verdict: 'SATISFIED', confidence: 'high' }, 'x.md');
    await emitAcceptanceVerdictEvent(dir, { measurability: 'MEASURABLE' }, 'x.md');
    await emitUatSignoffEvent(dir, { slug: 's', decision: 'ACCEPTED', signedOffBy: 'chad' });
    expect(existsSync(join(dir, '.harness'))).toBe(false);
  });

  it('spool outcome verdicts as sdlc.verify.graded.v1 (SATISFIED => V2)', async () => {
    configureSink();
    await emitOutcomeVerdictEvent(
      dir,
      { verdict: 'SATISFIED', confidence: 'high' },
      'docs/changes/my-change/proposal.md'
    );
    const [event] = spooledEvents();
    expect(event?.type).toBe('sdlc.verify.graded.v1');
    expect(event?.grade).toBe('V2');
    expect(event?.subject).toBe('item/my-change');
    expect(event?.data).toMatchObject({ kind: 'outcome', verdict: 'SATISFIED' });
  });

  it('spool acceptance verdicts using measurability (MEASURABLE => V1)', async () => {
    configureSink();
    await emitAcceptanceVerdictEvent(
      dir,
      { measurability: 'MEASURABLE', confidence: 'medium' },
      'docs/changes/my-change/proposal.md'
    );
    const [event] = spooledEvents();
    expect(event?.grade).toBe('V1');
    expect(event?.data).toMatchObject({ kind: 'acceptance', verdict: 'MEASURABLE' });
  });

  it('skip malformed verdicts without spooling or throwing', async () => {
    configureSink();
    await emitOutcomeVerdictEvent(dir, { not: 'a verdict' }, 'x.md');
    await emitOutcomeVerdictEvent(dir, undefined, 'x.md');
    expect(spooledEvents()).toEqual([]);
  });

  it('spool UAT sign-offs with a human actor (ACCEPTED => V3)', async () => {
    configureSink();
    await emitUatSignoffEvent(dir, {
      slug: 'my-change',
      decision: 'ACCEPTED',
      signedOffBy: 'chad',
    });
    const [event] = spooledEvents();
    expect(event?.grade).toBe('V3');
    expect(event?.actor).toEqual({ kind: 'human', id: 'user://chad' });
    expect(event?.data).toMatchObject({ kind: 'uat', verdict: 'ACCEPTED' });
  });
});
