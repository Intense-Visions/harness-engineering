/**
 * Whose spend was it.
 *
 * `burn` already walked into `subagents/` and already counted these units;
 * what it threw away was the identity on the line. Each case here is one of
 * the populations that must stay separable, plus the rule that keeps a lost
 * label from ever reading as free.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { refresh } from '../src/refresh';
import { parseTranscript } from '../src/scan';
import { readRecords } from '../src/store';
import type { UsageRecord } from '../src/types';
import { DEFAULT_WEEK, agentLine, hoursAgo, makeHud, transcriptLine, type Hud } from './helpers';

let hud: Hud | null = null;

function newHud(): Hud {
  hud = makeHud();
  return hud;
}

afterEach(() => {
  hud?.cleanup();
  hud = null;
});

const SUB = path.join('session', 'subagents');

describe('classification', () => {
  it('labels a named subagent turn with its agent type and lane id', () => {
    const h = newHud();
    h.writeSubagentTranscript('agent-a.jsonl', [
      agentLine('req_1', hoursAgo(new Date(), 1), {
        isSidechain: true,
        agentId: 'a6bbff57161b6ebb2',
        attributionAgent: 'harness-task-executor',
      }),
    ]);

    const records = new Map<string, UsageRecord>();
    parseTranscript(path.join(h.paths.projects, '-proj', SUB, 'agent-a.jsonl'), records);
    expect(records.get('req_1')!.agent).toBe('harness-task-executor');
    expect(records.get('req_1')!.agentId).toBe('a6bbff57161b6ebb2');
  });

  it('labels subagent spend with no readable agent as unattributed and still counts it', () => {
    // The requirement in one line: a CLI update must not be able to report a
    // fleet run as free. The units land in a visible bucket, never nowhere.
    const h = newHud();
    h.writeSubagentTranscript('agent-b.jsonl', [
      agentLine(
        'req_2',
        hoursAgo(new Date(), 1),
        { isSidechain: true, agentId: 'lane-2' },
        {
          out: 1000,
        }
      ),
    ]);

    const records = new Map<string, UsageRecord>();
    expect(
      parseTranscript(path.join(h.paths.projects, '-proj', SUB, 'agent-b.jsonl'), records)
    ).toBe(1);
    expect(records.get('req_2')!.agent).toBe('unattributed');
    expect(records.get('req_2')!.agentId).toBe('lane-2');
    expect(records.get('req_2')!.out).toBe(1000);
  });

  it('labels a main-thread turn main, never unattributed', () => {
    // A missing label must not collapse into `main`, and the reverse is just
    // as wrong: the human's own spend is not a broken subagent record.
    const h = newHud();
    h.writeTranscript('main.jsonl', [transcriptLine('req_3', hoursAgo(new Date(), 1))]);

    const records = new Map<string, UsageRecord>();
    parseTranscript(path.join(h.paths.projects, '-proj', 'main.jsonl'), records);
    expect(records.get('req_3')!.agent).toBe('main');
    expect(records.get('req_3')!.agentId).toBe('');
  });

  it('classifies a subagents/ file whose lines carry no isSidechain flag', () => {
    // Signal one of two: if Claude Code drops the flag, the path still classifies.
    const h = newHud();
    h.writeSubagentTranscript('agent-c.jsonl', [
      agentLine('req_4', hoursAgo(new Date(), 1), { agentId: 'lane-4' }),
    ]);

    const records = new Map<string, UsageRecord>();
    parseTranscript(path.join(h.paths.projects, '-proj', SUB, 'agent-c.jsonl'), records);
    expect(records.get('req_4')!.agent).toBe('unattributed');
  });

  it('classifies an isSidechain line that sits outside a subagents/ directory', () => {
    // Signal two of two: if Claude Code moves the directory, the flag still
    // classifies. Both signals must fail at once before attribution degrades.
    const h = newHud();
    h.writeTranscript('stray.jsonl', [
      agentLine('req_5', hoursAgo(new Date(), 1), { isSidechain: true }),
    ]);

    const records = new Map<string, UsageRecord>();
    parseTranscript(path.join(h.paths.projects, '-proj', 'stray.jsonl'), records);
    expect(records.get('req_5')!.agent).toBe('unattributed');
  });
});

describe('dedup with upgrade', () => {
  it('upgrades a pre-migration record when a later read finds the label', () => {
    const h = newHud();
    h.writeSubagentTranscript('agent-d.jsonl', [
      agentLine('req_6', hoursAgo(new Date(), 1), {
        isSidechain: true,
        agentId: 'lane-6',
        attributionAgent: 'harness-task-executor',
      }),
    ]);

    const records = new Map<string, UsageRecord>([
      [
        'req_6',
        {
          ts: '2026-08-06T00:00:00Z',
          model: 'claude-opus-5',
          out: 1,
          in: 0,
          cacheWrite: 0,
          cacheRead: 0,
          agent: 'pre-migration',
          agentId: '',
        },
      ],
    ]);

    // An upgrade is not an add: counting it would make the record count
    // disagree with the store it describes.
    expect(
      parseTranscript(path.join(h.paths.projects, '-proj', SUB, 'agent-d.jsonl'), records)
    ).toBe(0);
    expect(records.get('req_6')!.agent).toBe('harness-task-executor');
    expect(records.get('req_6')!.agentId).toBe('lane-6');
  });

  it('upgrades a pre-migration record to unattributed when that is all the line offers', () => {
    // The rule is `pre-migration -> anything`, not `-> a named agent`. A
    // legacy row that turns out to be unlabelled subagent spend must reach
    // the bucket that drives the degradation flag, or a broken transcript
    // shape would hide behind history.
    const h = newHud();
    h.writeSubagentTranscript('agent-g.jsonl', [
      agentLine('req_9', hoursAgo(new Date(), 1), { isSidechain: true, agentId: 'lane-9' }),
    ]);

    const records = new Map<string, UsageRecord>([
      [
        'req_9',
        {
          ts: '2026-08-06T00:00:00Z',
          model: 'claude-opus-5',
          out: 1,
          in: 0,
          cacheWrite: 0,
          cacheRead: 0,
          agent: 'pre-migration',
          agentId: '',
        },
      ],
    ]);

    parseTranscript(path.join(h.paths.projects, '-proj', SUB, 'agent-g.jsonl'), records);
    expect(records.get('req_9')!.agent).toBe('unattributed');
  });

  it('never overwrites an unattributed record — only pre-migration is upgradable', () => {
    // First-write-wins still holds in every direction but the one that heals.
    // `unattributed` is a CURRENT observation, not a missing one, so it is
    // not up for revision by a later overlapping transcript.
    const h = newHud();
    h.writeSubagentTranscript('agent-e.jsonl', [
      agentLine('req_7', hoursAgo(new Date(), 1), {
        isSidechain: true,
        agentId: 'lane-7',
        attributionAgent: 'harness-task-executor',
      }),
    ]);

    const records = new Map<string, UsageRecord>([
      [
        'req_7',
        {
          ts: '2026-08-06T00:00:00Z',
          model: 'claude-opus-5',
          out: 1,
          in: 0,
          cacheWrite: 0,
          cacheRead: 0,
          agent: 'unattributed',
          agentId: 'lane-7',
        },
      ],
    ]);

    parseTranscript(path.join(h.paths.projects, '-proj', SUB, 'agent-e.jsonl'), records);
    expect(records.get('req_7')!.agent).toBe('unattributed');
  });

  it('heals a store migrated from the 7-column format on the first rescan', () => {
    // End to end: the migration relabels every row whose transcript is still
    // on disk, so nobody is pinned to `pre-migration` by a release.
    const h = newHud();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    h.writeSubagentTranscript('agent-f.jsonl', [
      agentLine('req_8', hoursAgo(new Date(), 1), {
        isSidechain: true,
        agentId: 'lane-8',
        attributionAgent: 'harness-task-executor',
      }),
    ]);
    refresh(h.paths);

    // Rewind the store to the pre-migration shape: 7 columns, no #version.
    const legacyRows = readFileSync(h.paths.usageTsv, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((r) => r.split('\t').slice(0, 7).join('\t'));
    writeFileSync(h.paths.usageTsv, `${legacyRows.join('\n')}\n`);
    const legacyFingerprints = readFileSync(h.paths.filesTsv, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#version\t'));
    writeFileSync(h.paths.filesTsv, `${legacyFingerprints.join('\n')}\n`);

    expect(readRecords(h.paths).get('req_8')!.agent).toBe('pre-migration');
    refresh(h.paths);
    expect(readRecords(h.paths).get('req_8')!.agent).toBe('harness-task-executor');
  });
});
