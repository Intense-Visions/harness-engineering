/**
 * `roadmap.tracker.kind: "pnyon"` config surface
 * (docs/changes/waypoint-tracker-kind-pnyon/proposal.md, US-1): the schema
 * accepts a pnyon tracker with a Waypoint URL (+ optional token), while the
 * pre-existing github variant and the kind-collision guarantees pinned by
 * `schema.tracker-kind.test.ts` stay intact (that suite is unmodified).
 */
import { describe, it, expect } from 'vitest';
import { TrackerConfigSchema, HarnessConfigSchema } from '../../src/config/schema';

describe('TrackerConfigSchema — pnyon variant', () => {
  it('accepts kind: "pnyon" with a url', () => {
    const r = TrackerConfigSchema.safeParse({
      kind: 'pnyon',
      url: 'https://waypoint.test/o/outpost-1',
    });
    expect(r.success).toBe(true);
  });

  it('accepts an optional token', () => {
    const r = TrackerConfigSchema.safeParse({
      kind: 'pnyon',
      url: 'https://waypoint.test/o/outpost-1',
      token: 'tok',
    });
    expect(r.success).toBe(true);
  });

  it('rejects kind: "pnyon" without a url', () => {
    const r = TrackerConfigSchema.safeParse({ kind: 'pnyon' });
    expect(r.success).toBe(false);
  });

  it('rejects a non-URL url', () => {
    const r = TrackerConfigSchema.safeParse({ kind: 'pnyon', url: 'not a url' });
    expect(r.success).toBe(false);
  });

  it('does NOT loosen the github variant (statusMap still required)', () => {
    const r = TrackerConfigSchema.safeParse({ kind: 'github' });
    expect(r.success).toBe(false);
  });
});

describe('HarnessConfigSchema — roadmap.tracker pnyon passthrough', () => {
  it('accepts a file-less pnyon tracker via the top-level schema', () => {
    const r = HarnessConfigSchema.safeParse({
      version: 1,
      roadmap: {
        mode: 'file-less',
        tracker: { kind: 'pnyon', url: 'https://waypoint.test/o/outpost-1' },
      },
    });
    expect(r.success).toBe(true);
  });
});
