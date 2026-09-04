// packages/types/src/waypoint.ts
//
// Waypoint `sdlc.*` event contract — cross-layer types for the opt-in SDLC
// event emission layer (pnyon/pnyon#124; pnyon ADR-0047).
//
// The envelope is a CloudEvents 1.0 profile with Waypoint extension
// attributes and a pinned, versioned `sdlc.*.v1` vocabulary mapped against
// CDEvents v0.5.1 (mapped and pinned, never a runtime dependency). The
// normative contract lives in pnyon's
// `docs/architecture/waypoint/sdlc-event-schema.md`; this module pins the
// same list so emitter and consumer cannot drift.
//
// Nothing in this module performs I/O or changes behavior — it is the shared
// vocabulary for the opt-in emission layer in
// `packages/core/src/waypoint/`. When no Waypoint sink is configured in
// `harness.config.json`, no code path constructs these values.

import { z } from 'zod';

/** The only CloudEvents spec version the v1 profile accepts. */
export const SDLC_SPECVERSION = '1.0';

/** The ten pinned `sdlc.*` categories (pnyon ADR-0047). */
export const SDLC_CATEGORIES = [
  'intent',
  'claim',
  'build',
  'review',
  'test',
  'verify',
  'release',
  'wave',
  'override',
  'approval',
] as const;

/** One of the ten pinned `sdlc.*` categories. */
export type SdlcCategory = (typeof SDLC_CATEGORIES)[number];

/**
 * The pinned, CLOSED v1 vocabulary. Validation rejects any type outside this
 * list. Incompatible payload changes mint `.v2` types alongside — `.v1` is
 * never mutated. The CDEvents v0.5.1 mapping table lives in the schema doc,
 * one row per entry here.
 */
export const SDLC_EVENT_TYPES_V1 = [
  'sdlc.intent.created.v1',
  'sdlc.intent.updated.v1',
  'sdlc.intent.closed.v1',
  'sdlc.claim.opened.v1',
  'sdlc.claim.released.v1',
  'sdlc.build.started.v1',
  'sdlc.build.finished.v1',
  'sdlc.review.requested.v1',
  'sdlc.review.verdict.v1',
  'sdlc.test.started.v1',
  'sdlc.test.finished.v1',
  'sdlc.verify.graded.v1',
  'sdlc.release.published.v1',
  'sdlc.wave.proposed.v1',
  'sdlc.wave.approved.v1',
  'sdlc.wave.completed.v1',
  'sdlc.override.applied.v1',
  'sdlc.approval.granted.v1',
  'sdlc.approval.denied.v1',
] as const;

/** A member of the pinned, closed v1 vocabulary. */
export type SdlcEventTypeV1 = (typeof SDLC_EVENT_TYPES_V1)[number];

/**
 * Actor duality: a human principal, or an agent principal that MUST name the
 * human it acts on behalf of. Validation rejects agent actors lacking
 * `onBehalfOf` — agent work is always attributable to a human.
 */
export interface SdlcHumanActor {
  readonly kind: 'human';
  /** Human principal URI/id, e.g. `user://chad`. */
  readonly id: string;
}

/** An agent principal acting on behalf of an accountable human. */
export interface SdlcAgentActor {
  readonly kind: 'agent';
  /** Agent principal URI/id, e.g. `agent://claude/roadmap-fleet`. */
  readonly id: string;
  /** The accountable human principal. Required for every agent actor. */
  readonly onBehalfOf: string;
}

/** The accountable-actor union: a human, or an agent `onBehalfOf` a human. */
export type SdlcActor = SdlcHumanActor | SdlcAgentActor;

/** SLSA-style verification grades, V0 (none) to V3. */
export const SDLC_VERIFICATION_GRADES = ['V0', 'V1', 'V2', 'V3'] as const;

/** One of the four SLSA-style verification grades. */
export type SdlcVerificationGrade = (typeof SDLC_VERIFICATION_GRADES)[number];

/**
 * The v1 envelope — CloudEvents 1.0 required attributes plus Waypoint
 * extension attributes, in the Waypoint JSON binding (structured `actor` and
 * `causes`; the strict-transport flattening is documented in the schema doc).
 */
export interface SdlcEvent<
  TData extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  /** CloudEvents spec version — always `"1.0"` in the v1 profile. */
  readonly specversion: typeof SDLC_SPECVERSION;
  /**
   * ULID, client-generated at append time; the idempotency/dedup key.
   * Stable across every retry and replay (at-least-once delivery,
   * exactly-once effects).
   */
  readonly id: string;
  /** Emitting scope URI, e.g. `harness://repo/harness-engineering`. */
  readonly source: string;
  /** Pinned vocabulary member, e.g. `sdlc.review.verdict.v1`. */
  readonly type: SdlcEventTypeV1;
  /** RFC 3339 / ISO-8601 timestamp of the occurrence. */
  readonly time: string;
  /** Stable subject id, e.g. `item/<feature-name>`. */
  readonly subject: string;
  /** Present (as `application/json`) whenever `data` is present. */
  readonly datacontenttype?: 'application/json';
  /** Waypoint extension: accountable actor (duality — see SdlcActor). */
  readonly actor: SdlcActor;
  /** Waypoint extension: verification grade for grade-asserting events. */
  readonly grade?: SdlcVerificationGrade;
  /** Waypoint extension: ULIDs of the events this one was caused by. */
  readonly causes?: readonly string[];
  /** Event-type-specific payload. */
  readonly data?: TData;
}

/** One named diagnostic from envelope validation (reject-with-field). */
export interface SdlcValidationIssue {
  /** Dotted path of the violated field, e.g. `actor.onBehalfOf`. */
  readonly field: string;
  readonly message: string;
}

/** Envelope validation outcome: the typed event, or per-field diagnostics. */
export type SdlcValidationResult =
  | { readonly ok: true; readonly event: SdlcEvent }
  | { readonly ok: false; readonly issues: readonly SdlcValidationIssue[] };

/**
 * Result of an append attempt. Appending NEVER throws and never blocks the
 * originating harness operation: invalid events come back with diagnostics,
 * valid events land (dropping the oldest at the cap).
 */
export type SdlcAppendResult =
  | {
      readonly ok: true;
      /** Events evicted from this segment by this append (0 or 1). */
      readonly dropped: number;
      /** Redactions applied by the client-side best-effort scrub. */
      readonly redactions: number;
    }
  | { readonly ok: false; readonly issues: readonly SdlcValidationIssue[] };

/** A read-only view of one per-process segment's state. */
export interface SdlcSpoolSegmentSnapshot {
  /** Unique per-writer id; the segment file is `sdlc-<segmentId>.jsonl`. */
  readonly segmentId: string;
  /** JSONL lines, oldest first — each one complete event envelope. */
  readonly lines: readonly string[];
  /** Monotonic count of events evicted by drop-oldest at the cap. */
  readonly droppedEvents: number;
}

/**
 * Waypoint sink configuration — the `waypoint` key in `harness.config.json`
 * (zod, mirroring `NotificationsConfigSchema`: the runtime schema lives in
 * types so core, cli, and orchestrator all validate the same shape).
 *
 * ABSENT CONFIG MEANS ABSENT FEATURE: when `harness.config.json` has no
 * `waypoint.sink` entry, the emission layer stays a no-op — no new files, no
 * new I/O, no behavior change anywhere in harness (PRD Story 1, the
 * non-adopter invariance contract).
 */
export const WaypointSinkConfigSchema = z.object({
  /**
   * Spool transport toggle. `spool` appends events to the repo-local
   * `.harness/spool/` JSONL segments. Shipping spooled events to a hosted
   * ingest is out of scope for this layer (pnyon owns ingest).
   */
  transport: z.literal('spool'),
  /**
   * Emitting scope URI stamped on every event's `source`, e.g.
   * `harness://outpost/<uuid>/repo/<name>`. Defaults to
   * `harness://repo/<basename of project root>`.
   */
  source: z.string().min(1).optional(),
  /** Segment bound; drop-oldest beyond it. Default 10 000 events/segment. */
  maxEventsPerSegment: z.number().int().positive().optional(),
  /**
   * Accountable human principal stamped as `actor.onBehalfOf` on
   * agent-authored events, e.g. `user://chad`. Defaults to
   * `user://<os user name>`.
   */
  onBehalfOf: z.string().min(1).optional(),
});
export type WaypointSinkConfig = z.infer<typeof WaypointSinkConfigSchema>;

/** The `waypoint` block of `harness.config.json`. */
export const WaypointConfigSchema = z.object({
  /** Opt-in sink. Absent (or undefined) disables the emission layer. */
  sink: WaypointSinkConfigSchema.optional(),
});
export type WaypointConfig = z.infer<typeof WaypointConfigSchema>;
