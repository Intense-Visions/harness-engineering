/**
 * Whose spend was it.
 *
 * `burn` already walked into `subagents/` and already counted these units;
 * what it threw away was the identity on the line. Each case here is one of
 * the populations that must stay separable, plus the rule that keeps a lost
 * label from ever reading as free.
 */
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseTranscript } from '../src/scan';
import type { UsageRecord } from '../src/types';
import { agentLine, hoursAgo, makeHud, transcriptLine, type Hud } from './helpers';

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
