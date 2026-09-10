/**
 * Shipper contract tests (`docs/changes/waypoint-spool-shipper/proposal.md`).
 *
 * The fake below mirrors the endpoint PROBED LIVE on 2026-09-07 — a bare JSON
 * array in, a per-event `results` array out. That fidelity is the point: the
 * two prior harness↔Waypoint adapters were complete and green against mocks of
 * a contract that returned 404 in production, so a mock here is only worth
 * anything if it matches something real. Step 6 of the spec is a live proof on
 * top of these.
 *
 *  - SC-1 no `ship` config ⇒ no network
 *  - SC-2 events reach the endpoint and the checkpoint advances
 *  - SC-3 a second run with nothing new sends nothing
 *  - SC-4 terminal rejections advance AND are recorded
 *  - SC-5 401/400 fail loudly without retry and without advancing
 *  - SC-6 spool segments are never modified
 *  - SC-7 a partial batch resumes from the first unlanded event
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WaypointShipConfig } from '@harness-engineering/types';
import { readCheckpoint } from './checkpoint';
import { countRejected, recordRejected } from './rejected-log';
import {
  countUnshipped,
  hasLanded,
  ingestUrl,
  isTerminal,
  ShipError,
  shipSpool,
  type IngestEventResult,
  type ShipFetch,
} from './shipper';

let dir: string;
let spoolDir: string;

const CONFIG: WaypointShipConfig = {
  url: 'https://waypoint.test',
  outpost: 'pnyon',
  project: 'pnyon',
};

/**
 * A spooled line with a ULID-shaped, lexicographically ordered id.
 *
 * Carries the full CloudEvents envelope the published contract requires. It used to be
 * `{ id, type, subject }` — enough for the shipper's own bookkeeping, but an event the live ledger
 * would have refused outright, so the suite was exercising the happy path with input that could
 * never take it. The local contract preflight is what surfaced that.
 */
function event(n: number, type = 'sdlc.intent.created.v1'): string {
  const id = `01ABCDEFGH${String(n).padStart(16, '0')}`;
  return JSON.stringify({
    specversion: '1.0',
    id,
    source: 'harness://outpost/pnyon/repo/pnyon',
    type,
    time: '2026-09-09T12:00:00.000Z',
    subject: `item/thing-${n}`,
    actor: { kind: 'human', id: 'user://chad' },
  });
}

function writeSegment(segmentId: string, lines: readonly string[]): void {
  mkdirSync(spoolDir, { recursive: true });
  writeFileSync(join(spoolDir, `sdlc-${segmentId}.jsonl`), `${lines.join('\n')}\n`, 'utf8');
}

/** Mirrors the live endpoint: array in, per-event results out. */
function fakeIngest(
  verdict: (id: string, index: number) => IngestEventResult['result'] = () => 'accepted'
): { fetchFn: ShipFetch; bodies: string[]; urls: string[] } {
  const bodies: string[] = [];
  const urls: string[] = [];
  const fetchFn: ShipFetch = async (url, init) => {
    urls.push(url);
    bodies.push(init.body);
    const parsed = JSON.parse(init.body) as Array<{ id: string }>;
    const results = parsed.map((e, i) => ({ id: e.id, result: verdict(e.id, i) }));
    return {
      status: 200,
      text: async () =>
        JSON.stringify({
          results,
          accepted: results.filter((r) => r.result === 'accepted').length,
          duplicate: results.filter((r) => r.result === 'duplicate').length,
          invalid: results.filter((r) => r.result === 'invalid').length,
          scrubRejected: results.filter((r) => r.result === 'scrub-rejected').length,
        }),
    };
  };
  return { fetchFn, bodies, urls };
}

const statusOnly = (status: number, body = '{}'): ShipFetch => {
  let calls = 0;
  const fn: ShipFetch = async () => {
    calls += 1;
    return { status, text: async () => body };
  };
  (fn as ShipFetch & { calls: () => number }).calls = () => calls;
  return fn;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'waypoint-shipper-'));
  spoolDir = join(dir, '.harness', 'spool');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ingestUrl', () => {
  it('builds the live route space, not a guessed one', () => {
    expect(ingestUrl(CONFIG)).toBe('https://waypoint.test/outpost/pnyon/project/pnyon/events');
  });

  it('normalizes a trailing slash and encodes the scope segments', () => {
    expect(ingestUrl({ url: 'https://w.test/', outpost: 'a b', project: 'c/d' })).toBe(
      'https://w.test/outpost/a%20b/project/c%2Fd/events'
    );
  });
});

describe('result classification', () => {
  // `duplicate` is at-least-once delivery working as designed, not a failure.
  it('treats accepted and duplicate as landed', () => {
    expect(hasLanded('accepted')).toBe(true);
    expect(hasLanded('duplicate')).toBe(true);
    expect(hasLanded('invalid')).toBe(false);
  });

  it('treats invalid and scrub-rejected as terminal', () => {
    expect(isTerminal('invalid')).toBe(true);
    expect(isTerminal('scrub-rejected')).toBe(true);
    expect(isTerminal('accepted')).toBe(false);
  });
});

describe('shipSpool — events reach the ledger (SC-2)', () => {
  it('posts spooled events as a bare JSON array and advances the checkpoint', async () => {
    writeSegment('seg1', [event(1), event(2), event(3)]);
    const { fetchFn, bodies, urls } = fakeIngest();

    const report = await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn });

    expect(report.shipped).toBe(3);
    expect(report.accepted).toBe(3);
    expect(report.remaining).toBe(0);
    expect(urls[0]).toBe('https://waypoint.test/outpost/pnyon/project/pnyon/events');
    // A bare array — not wrapped in an envelope the endpoint would 400 on.
    expect(JSON.parse(bodies[0]!)).toHaveLength(3);
    expect(Array.isArray(JSON.parse(bodies[0]!))).toBe(true);
    expect(readCheckpoint(spoolDir).marks['seg1']).toBeDefined();
  });

  it('sends the token in the header the gateway checks', async () => {
    writeSegment('seg1', [event(1)]);
    let seen: Record<string, string> = {};
    const fetchFn: ShipFetch = async (_u, init) => {
      seen = init.headers;
      return { status: 200, text: async () => '{"results":[]}' };
    };

    await shipSpool({ spoolDir, config: CONFIG, token: 'secret-token', fetchFn });

    expect(seen['x-pnyon-ingest-token']).toBe('secret-token');
  });

  it('ships in ULID order across segments, so causality is preserved', async () => {
    // Interleaved across two writers: order must come from the ids, not the
    // file listing — a claim landing before its intent is a corrupt ledger.
    writeSegment('segA', [event(1), event(3)]);
    writeSegment('segB', [event(2), event(4)]);
    const { fetchFn, bodies } = fakeIngest();

    await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn });

    const ids = (JSON.parse(bodies[0]!) as Array<{ id: string }>).map((e) => e.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('splits into batches at the configured size', async () => {
    writeSegment('seg1', [event(1), event(2), event(3), event(4), event(5)]);
    const { fetchFn, bodies } = fakeIngest();

    const report = await shipSpool({
      spoolDir,
      config: { ...CONFIG, batchSize: 2 },
      token: 't',
      fetchFn,
    });

    expect(bodies).toHaveLength(3);
    expect(report.shipped).toBe(5);
  });
});

describe('shipSpool — idempotence (SC-3)', () => {
  it('sends nothing on a second run with no new events', async () => {
    writeSegment('seg1', [event(1), event(2)]);
    const first = fakeIngest();
    await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn: first.fetchFn });

    const second = fakeIngest();
    const report = await shipSpool({
      spoolDir,
      config: CONFIG,
      token: 't',
      fetchFn: second.fetchFn,
    });

    expect(second.bodies).toHaveLength(0);
    expect(report.shipped).toBe(0);
    expect(report.requests).toBe(0);
  });

  it('ships only the new events when the segment grows', async () => {
    writeSegment('seg1', [event(1), event(2)]);
    await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn: fakeIngest().fetchFn });

    writeSegment('seg1', [event(1), event(2), event(3)]);
    const next = fakeIngest();
    const report = await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn: next.fetchFn });

    expect(report.shipped).toBe(1);
    expect(JSON.parse(next.bodies[0]!)).toHaveLength(1);
  });

  it('counts a re-sent event as duplicate rather than an error', async () => {
    writeSegment('seg1', [event(1)]);
    const { fetchFn } = fakeIngest(() => 'duplicate');

    const report = await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn });

    expect(report.duplicate).toBe(1);
    expect(report.shipped).toBe(1);
    expect(report.rejected).toHaveLength(0);
  });
});

describe('shipSpool — terminal rejections (SC-4)', () => {
  it('reports a permanently-refused event without failing the run', async () => {
    writeSegment('seg1', [event(1), event(2), event(3)]);
    const { fetchFn } = fakeIngest((_id, i) => (i === 0 ? 'invalid' : 'accepted'));

    const report = await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn });

    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]!.result).toBe('invalid');
    expect(report.shipped).toBe(2);
  });

  /**
   * The regression terminal-advance actually prevents.
   *
   * Progress is one high-water mark per segment, so a rejected event with an
   * accepted event AFTER it is covered either way — the later mark subsumes it.
   * The case that genuinely needs `isTerminal` is a TRAILING rejection, with
   * nothing accepted behind it to carry the mark forward. Without advancing on
   * terminal verdicts, that event is re-sent on every future run forever, and
   * the dead-letter log grows a fresh copy each time.
   *
   * Worth stating because the obvious version of this test — a rejection
   * followed by successes — passes whether or not the behaviour exists.
   */
  it('never re-sends a trailing rejection on a later run', async () => {
    writeSegment('seg1', [event(1), event(2)]);
    const first = fakeIngest((_id, i) => (i === 1 ? 'invalid' : 'accepted'));
    await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn: first.fetchFn });

    const second = fakeIngest();
    const report = await shipSpool({
      spoolDir,
      config: CONFIG,
      token: 't',
      fetchFn: second.fetchFn,
    });

    expect(second.bodies).toHaveLength(0);
    expect(report.requests).toBe(0);
  });

  it('does not duplicate a trailing rejection in the dead-letter log across runs', async () => {
    writeSegment('seg1', [event(1)]);
    const rejections: string[] = [];
    const run = async (): Promise<void> => {
      const { fetchFn } = fakeIngest(() => 'scrub-rejected');
      await shipSpool({
        spoolDir,
        config: CONFIG,
        token: 't',
        fetchFn,
        onRejected: (r) => rejections.push(...r.map((x) => x.id)),
      });
    };

    await run();
    await run();

    // Recorded once, not once per run — the adopter reads this file.
    expect(rejections).toHaveLength(1);
  });

  it('hands rejections to the recorder, with the original event body', async () => {
    writeSegment('seg1', [event(1)]);
    const { fetchFn } = fakeIngest(() => 'scrub-rejected');
    const seen: string[] = [];

    const report = await shipSpool({
      spoolDir,
      config: CONFIG,
      token: 't',
      fetchFn,
      onRejected: (r) => seen.push(...r.map((x) => x.result)),
    });

    expect(seen).toEqual(['scrub-rejected']);
    // The line itself, not merely its id — a scrub rejection has to be
    // inspectable by the adopter.
    expect(report.rejected[0]!.line).toContain('sdlc.intent.created.v1');
  });

  it('writes rejections to a dead-letter log that survives the run', () => {
    mkdirSync(spoolDir, { recursive: true });
    recordRejected(
      spoolDir,
      [{ id: '01X', result: 'scrub-rejected', line: '{"id":"01X"}' }],
      '2026-09-07T00:00:00.000Z'
    );

    expect(countRejected(spoolDir)).toBe(1);
    const written = readFileSync(join(spoolDir, 'rejected.jsonl'), 'utf8');
    expect(written).toContain('scrub-rejected');
    expect(written).toContain('01X');
  });
});

describe('shipSpool — configuration faults fail loudly (SC-5)', () => {
  it('does not retry a 401 and names both places the token comes from', async () => {
    writeSegment('seg1', [event(1)]);
    const fetchFn = statusOnly(401, '{"error":"unauthorized"}');

    const err = await shipSpool({
      spoolDir,
      config: CONFIG,
      token: 'bad',
      fetchFn,
      sleep: async () => {},
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ShipError);
    expect((err as ShipError).retryable).toBe(false);
    expect((err as ShipError).message).toContain('PNYON_WAYPOINT_INGEST_TOKEN');
    expect((fetchFn as ShipFetch & { calls: () => number }).calls()).toBe(1);
  });

  it('does not retry a 400', async () => {
    writeSegment('seg1', [event(1)]);
    const fetchFn = statusOnly(400, '{"error":"body must be a JSON array of events"}');

    const err = await shipSpool({
      spoolDir,
      config: CONFIG,
      token: 't',
      fetchFn,
      sleep: async () => {},
    }).catch((e: unknown) => e);

    expect((err as ShipError).retryable).toBe(false);
    expect((fetchFn as ShipFetch & { calls: () => number }).calls()).toBe(1);
  });

  it('leaves the checkpoint untouched when a batch fails', async () => {
    writeSegment('seg1', [event(1)]);
    await shipSpool({
      spoolDir,
      config: CONFIG,
      token: 'bad',
      fetchFn: statusOnly(401),
      sleep: async () => {},
    }).catch(() => undefined);

    expect(readCheckpoint(spoolDir).marks['seg1']).toBeUndefined();
    expect(countUnshipped(spoolDir)).toBe(1);
  });

  it('retries a 5xx and then gives up as retryable', async () => {
    writeSegment('seg1', [event(1)]);
    const fetchFn = statusOnly(503, 'upstream down');

    const err = await shipSpool({
      spoolDir,
      config: CONFIG,
      token: 't',
      fetchFn,
      maxAttempts: 3,
      sleep: async () => {},
    }).catch((e: unknown) => e);

    expect((err as ShipError).retryable).toBe(true);
    expect((fetchFn as ShipFetch & { calls: () => number }).calls()).toBe(3);
  });

  it('recovers when a retry succeeds', async () => {
    writeSegment('seg1', [event(1)]);
    let call = 0;
    const fetchFn: ShipFetch = async () => {
      call += 1;
      if (call === 1) throw new Error('ECONNRESET');
      return {
        status: 200,
        text: async () =>
          JSON.stringify({ results: [{ id: '01ABCDEFGH0000000000000001', result: 'accepted' }] }),
      };
    };

    const report = await shipSpool({
      spoolDir,
      config: CONFIG,
      token: 't',
      fetchFn,
      sleep: async () => {},
    });

    expect(report.shipped).toBe(1);
    expect(report.requests).toBe(2);
  });

  /**
   * A 200 that cannot say what landed must not be read as success. Re-sending
   * costs a `duplicate`; a false advance loses events permanently.
   */
  it('refuses to advance on a 200 with no per-event results', async () => {
    writeSegment('seg1', [event(1)]);

    const err = await shipSpool({
      spoolDir,
      config: CONFIG,
      token: 't',
      fetchFn: statusOnly(200, '{"ok":true}'),
    }).catch((e: unknown) => e);

    expect((err as ShipError).message).toContain('results');
    expect(readCheckpoint(spoolDir).marks['seg1']).toBeUndefined();
  });
});

describe('shipSpool — the spool is never consumed (SC-6)', () => {
  it('leaves segment files byte-identical after a successful run', async () => {
    writeSegment('seg1', [event(1), event(2)]);
    const path = join(spoolDir, 'sdlc-seg1.jsonl');
    const before = readFileSync(path, 'utf8');

    await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn: fakeIngest().fetchFn });

    // ADR-0047 guarantees adopters keep their own copy of their exhaust; a
    // shipper that consumed the spool would delete exactly that.
    expect(readFileSync(path, 'utf8')).toBe(before);
  });
});

describe('shipSpool — resume and limits (SC-7)', () => {
  it('resumes from the first unlanded event after a mid-run failure', async () => {
    writeSegment('seg1', [event(1), event(2), event(3), event(4)]);
    let batch = 0;
    const fetchFn: ShipFetch = async (_u, init) => {
      batch += 1;
      if (batch === 2) return { status: 503, text: async () => 'down' };
      const parsed = JSON.parse(init.body) as Array<{ id: string }>;
      return {
        status: 200,
        text: async () =>
          JSON.stringify({ results: parsed.map((e) => ({ id: e.id, result: 'accepted' })) }),
      };
    };

    await shipSpool({
      spoolDir,
      config: { ...CONFIG, batchSize: 2 },
      token: 't',
      fetchFn,
      maxAttempts: 1,
      sleep: async () => {},
    }).catch(() => undefined);

    // First batch landed and was checkpointed before the second failed.
    expect(countUnshipped(spoolDir)).toBe(2);

    const resume = fakeIngest();
    const report = await shipSpool({
      spoolDir,
      config: CONFIG,
      token: 't',
      fetchFn: resume.fetchFn,
    });
    expect(report.shipped).toBe(2);
    expect(JSON.parse(resume.bodies[0]!)).toHaveLength(2);
  });

  it('honours --limit and reports what is still waiting', async () => {
    writeSegment('seg1', [event(1), event(2), event(3)]);
    const { fetchFn } = fakeIngest();

    const report = await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn, limit: 2 });

    expect(report.shipped).toBe(2);
    expect(report.remaining).toBe(1);
    expect(countUnshipped(spoolDir)).toBe(1);
  });

  it('dry run computes the backlog and issues no request', async () => {
    writeSegment('seg1', [event(1), event(2)]);
    const { fetchFn, bodies } = fakeIngest();

    const report = await shipSpool({
      spoolDir,
      config: CONFIG,
      token: 't',
      fetchFn,
      dryRun: true,
    });

    expect(report.remaining).toBe(2);
    expect(report.shipped).toBe(0);
    expect(bodies).toHaveLength(0);
    expect(readCheckpoint(spoolDir).marks['seg1']).toBeUndefined();
  });

  it('an empty spool ships nothing and does not create a directory', async () => {
    const { fetchFn, bodies } = fakeIngest();

    const report = await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn });

    expect(report.shipped).toBe(0);
    expect(bodies).toHaveLength(0);
    expect(countUnshipped(spoolDir)).toBe(0);
  });

  describe('contract preflight', () => {
    /** An event carrying a field the pinned v1 contract does not declare. */
    function undeclaredFieldEvent(n: number): string {
      const parsed = JSON.parse(event(n)) as Record<string, unknown>;
      return JSON.stringify({ ...parsed, data: { sneakyNewField: 'anything' } });
    }

    it('never sends an event the ledger would refuse', async () => {
      const { fetchFn, bodies } = fakeIngest();
      writeSegment('seg1', [undeclaredFieldEvent(1)]);

      const report = await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn });

      // The whole point: no round trip at all, not a round trip that comes back 'invalid'.
      expect(bodies).toHaveLength(0);
      expect(report.requests).toBe(0);
      expect(report.rejected).toHaveLength(1);
      expect(report.rejected[0]?.result).toBe('invalid');
    });

    it('says which field broke the contract, and how to fix it', async () => {
      const { fetchFn } = fakeIngest();
      writeSegment('seg1', [undeclaredFieldEvent(1)]);

      const report = await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn });

      const reason = report.rejected[0]?.contractViolations ?? '';
      expect(reason).toContain('data.sneakyNewField');
      expect(reason).toContain('.v2');
    });

    it('still ships the good events alongside a refused one', async () => {
      const { fetchFn, bodies } = fakeIngest();
      writeSegment('seg1', [event(1), undeclaredFieldEvent(2), event(3)]);

      const report = await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn });

      // One bad event must not strand the batch it happened to share a segment with.
      expect(report.accepted).toBe(2);
      expect(report.rejected).toHaveLength(1);
      const sent = JSON.parse(bodies[0] ?? '[]') as Array<{ id: string }>;
      expect(sent.map((e) => e.id)).toEqual([JSON.parse(event(1)).id, JSON.parse(event(3)).id]);
    });

    it('hands refused events to the dead-letter recorder', async () => {
      const { fetchFn } = fakeIngest();
      writeSegment('seg1', [undeclaredFieldEvent(1)]);

      await shipSpool({
        spoolDir,
        config: CONFIG,
        token: 't',
        fetchFn,
        onRejected: (rejected) => recordRejected(spoolDir, rejected, '2026-09-09T12:00:00.000Z'),
      });

      expect(countRejected(spoolDir)).toBe(1);
    });

    it('does not advance the checkpoint past an event it never sent', async () => {
      const { fetchFn } = fakeIngest();
      writeSegment('seg1', [undeclaredFieldEvent(1)]);

      await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn });

      // Marking it shipped would be the silent drop the dead-letter file exists to prevent.
      expect(readCheckpoint(spoolDir).marks['seg1']).toBeUndefined();
    });

    it('ships anyway under skipContractCheck, for a stale vendored copy', async () => {
      const { fetchFn, bodies } = fakeIngest();
      writeSegment('seg1', [undeclaredFieldEvent(1)]);

      const report = await shipSpool({
        spoolDir,
        config: CONFIG,
        token: 't',
        fetchFn,
        skipContractCheck: true,
      });

      expect(bodies).toHaveLength(1);
      expect(report.accepted).toBe(1);
      expect(report.rejected).toHaveLength(0);
    });

    it('passes an unparseable line through for the ledger to judge', async () => {
      // A stub that tolerates a malformed body — `fakeIngest` parses what it receives, so it
      // cannot stand in for a server being handed garbage.
      const bodies: string[] = [];
      const fetchFn: ShipFetch = async (_url, init) => {
        bodies.push(init.body);
        return { status: 200, text: async () => JSON.stringify({ results: [] }) };
      };
      writeSegment('seg1', ['{not json']);

      const report = await shipSpool({ spoolDir, config: CONFIG, token: 't', fetchFn });

      // Pre-existing, tested behaviour: the shipper does not parse-gate the spool, and adding a
      // contract check must not quietly become a syntax check too.
      expect(bodies).toHaveLength(1);
      expect(report.rejected).toHaveLength(0);
    });
  });
});
