import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeViolations, sdlcContract, validateAgainstContract } from './contract';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A minimal event that satisfies the contract; each test spoils exactly one thing. */
function validEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    specversion: '1.0',
    id: '01M1S2KE571AQJ89QBW822KHST',
    source: 'harness://outpost/pnyon/repo/pnyon',
    type: 'sdlc.build.finished.v1',
    time: '2026-09-09T12:00:00.000Z',
    subject: 'item/01M1S2KE571AQJ89QBW822KHST',
    actor: { kind: 'human', id: 'user://chad' },
    data: {
      outcome: 'merge',
      prNumber: 239,
      mergeCommitSha: 'a'.repeat(40),
      pr: 'Publish the sdlc.* contract',
    },
    ...overrides,
  };
}

describe('sdlcContract', () => {
  it('loads the vendored document', () => {
    const contract = sdlcContract();
    expect(contract['$id']).toBe('https://pnyon.com/schema/sdlc-v1.schema.json');
  });

  it('carries every branch of the pinned vocabulary', () => {
    const contract = sdlcContract() as {
      allOf: unknown[];
      properties: Record<string, { enum: string[] } | undefined>;
    };
    // One `data` branch per type, so no member of the vocabulary is unchecked.
    expect(contract.allOf.length).toBe(contract.properties['type']?.enum.length);
  });
});

describe('validateAgainstContract', () => {
  it('admits a well-formed event', () => {
    const verdict = validateAgainstContract(validEvent());
    expect(verdict).toEqual({ ok: true, violations: [] });
  });

  it('refuses an undeclared data field — the drift this exists to catch', () => {
    const verdict = validateAgainstContract(
      validEvent({
        data: { outcome: 'merge', prNumber: 1, pr: 'x', sneakyNewField: 'anything' },
      })
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.violations.map((v) => v.path)).toContain('data.sneakyNewField');
    // The message must name the .v2 escape hatch, or the reader learns only that they are wrong.
    expect(describeViolations(verdict.violations)).toContain('.v2');
  });

  it('refuses a type outside the pinned vocabulary', () => {
    const verdict = validateAgainstContract(validEvent({ type: 'sdlc.intent.created.v2' }));
    expect(verdict.ok).toBe(false);
    expect(verdict.violations.map((v) => v.path)).toContain('type');
  });

  it('refuses a malformed ULID', () => {
    // "LIVE" contains L and I, which Crockford base32 excludes.
    const verdict = validateAgainstContract(validEvent({ id: '01M2LIVEPRXF00000000000001' }));
    expect(verdict.ok).toBe(false);
    expect(verdict.violations.map((v) => v.path)).toContain('id');
  });

  it('refuses a bad enum member', () => {
    const verdict = validateAgainstContract(
      validEvent({ data: { outcome: 'sideways', prNumber: 1, pr: 'x' } })
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.violations.map((v) => v.path)).toContain('data.outcome');
  });

  it('refuses a scalar of the wrong JS type', () => {
    const verdict = validateAgainstContract(
      validEvent({ data: { outcome: 'merge', prNumber: '239', pr: 'x' } })
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.violations.map((v) => v.path)).toContain('data.prNumber');
  });

  it('refuses a missing required envelope field', () => {
    const event = validEvent();
    delete event['subject'];
    const verdict = validateAgainstContract(event);
    expect(verdict.ok).toBe(false);
    expect(verdict.violations.map((v) => v.path)).toContain('subject');
  });

  it('accepts an agent actor as well as a human one', () => {
    const verdict = validateAgainstContract(
      validEvent({ actor: { kind: 'agent', id: 'agent://claude', onBehalfOf: 'user://chad' } })
    );
    expect(verdict.ok).toBe(true);
  });

  it('refuses an agent actor that names nobody it acts for', () => {
    // Accountability is the point of the field; an agent with no principal breaks four-eyes counting.
    const verdict = validateAgainstContract(
      validEvent({ actor: { kind: 'agent', id: 'agent://claude' } })
    );
    expect(verdict.ok).toBe(false);
  });

  it('does NOT enforce shapes pnyon marks server-authoritative', () => {
    // `slug` has no publishable pattern (segment caps + a real-word rule no regex expresses), so a
    // string that the server would refuse must still pass here. Claiming otherwise would make this
    // preflight lie about its own authority.
    const verdict = validateAgainstContract({
      ...validEvent({ type: 'sdlc.intent.created.v1' }),
      data: {
        slug: 'THIS-IS-NOT-A-VALID-SLUG',
        itemUlid: '01M1S2KE571AQJ89QBW822KHST',
        dependencies: [],
        insufficientHistory: false,
      },
    });
    expect(verdict.ok).toBe(true);
  });

  it('reports every violation, not just the first', () => {
    const verdict = validateAgainstContract(
      validEvent({ id: 'nope', data: { outcome: 'sideways', prNumber: 1, pr: 'x' } })
    );
    const paths = verdict.violations.map((v) => v.path);
    expect(paths).toContain('id');
    expect(paths).toContain('data.outcome');
  });
});

describe('vendored copy is the published artifact', () => {
  it('matches the vectors document it was published alongside', () => {
    // Both files come from the same generated release; a mismatched pair means someone re-vendored
    // one and not the other, which is how a "current" contract quietly goes stale.
    const vectors = JSON.parse(
      readFileSync(join(HERE, 'contract', 'sdlc-v1.vectors.json'), 'utf8')
    ) as { schema: string };
    expect(vectors.schema).toBe(sdlcContract()['$id']);
  });
});
