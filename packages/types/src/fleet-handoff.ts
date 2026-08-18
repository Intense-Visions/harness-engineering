// packages/types/src/fleet-handoff.ts
//
// The ONE canonical bounded handoff record every fleet-family worker emits (#1396).
//
// Each fleet family member (bug-fleet, roadmap-fleet, pr-fleet, cicd-fleet,
// cleanup-fleet, security-fleet, test-fleet, issue-fleet, adr-fleet) fans out
// worktree-isolated workers that each complete ONE item and hand a structured
// report back to the fleet orchestrator (and up to fleet-command). Historically
// each fleet invented its own ad hoc report shape, forcing fleet-command to
// special-case every fleet's worker output.
//
// This module defines ONE shared, bounded envelope — modeled on a Ralph-loop
// bounded structured report (the normalized report passed from one continuing
// round to the next): a fixed set of documented fields, validated so a malformed
// record is rejected rather than silently misread. Every fleet emits THIS record
// from each worker so fleet-command can parse any fleet's output uniformly.
//
// It lives in `@harness-engineering/types` — the shared package the fleets and
// the orchestrator already depend on — so the shape cannot drift between the
// worker that EMITS it and the orchestrator that PARSES it.

import { z } from 'zod';

/** Current version of the fleet handoff record envelope. Bump only on a breaking
 * shape change; parsers tolerate an absent or unknown `v`. */
export const FLEET_HANDOFF_RECORD_VERSION = 1;

/**
 * The terminal disposition of a fleet worker's item, mirroring the fleet-family
 * DISPATCH contract (a worker returns a branch, parks on an unforeseen fork, or
 * fails):
 * - `done`    — the item completed; `evidence` carries the proof (branch, PR,
 *               artifact paths, CI signal).
 * - `parked`  — the worker hit a genuinely unforeseen decision fork and stopped
 *               without guessing; `blocker` states the fork for the human.
 * - `blocked` — the item could not proceed due to an external/environmental
 *               obstacle (not a decision fork); `blocker` states the obstacle.
 * - `failed`  — the pipeline ran but did not produce a shippable result;
 *               `blocker` states why.
 */
export const FleetHandoffStatusSchema = z.enum(['done', 'parked', 'blocked', 'failed']);

export type FleetHandoffStatus = z.infer<typeof FleetHandoffStatusSchema>;

/** The status values that REQUIRE a `blocker` to be present. A `done` record
 * never carries a blocker; every non-`done` status must explain itself. */
export const FLEET_HANDOFF_BLOCKER_REQUIRED_STATUSES: readonly FleetHandoffStatus[] = [
  'parked',
  'blocked',
  'failed',
];

/**
 * A single piece of verifiable evidence a worker leaves behind. The fleet
 * orchestrator independently confirms these rather than trusting the worker's
 * self-report, so each item names WHAT the evidence is and points AT it.
 */
export const FleetHandoffEvidenceSchema = z
  .object({
    /** What this evidence is, e.g. `'plan-artifact'`, `'provenance'`, `'pr'`,
     * `'branch'`, `'ci'`, `'reproducing-test'`. Free-form but non-empty. */
    kind: z.string().min(1),
    /** A pointer to the evidence: a path, URL, branch name, SHA, or check name. */
    ref: z.string().min(1),
    /** Optional human note about the evidence (advisory only). */
    note: z.string().optional(),
  })
  .strict();

export type FleetHandoffEvidence = z.infer<typeof FleetHandoffEvidenceSchema>;

/**
 * The ONE canonical bounded handoff record a fleet worker emits for its item.
 *
 * Bounded means: a fixed, documented set of fields with enforced semantics —
 * `.strict()` rejects unknown keys so a fleet cannot smuggle an ad hoc field
 * back in, and {@link validateFleetHandoffRecord} rejects a record whose status
 * demands a `blocker` but omits it. Field semantics:
 * - `status`     — terminal disposition ({@link FleetHandoffStatusSchema}).
 * - `fleet`      — which fleet produced this record (e.g. `'roadmap-fleet'`).
 * - `item`       — the item identifier the worker handled (issue number, PR
 *                  number, slug, area id — whatever the fleet's queue keys on).
 * - `summary`    — one-line human-readable outcome of the item.
 * - `evidence`   — verifiable artifacts/pointers backing the outcome (may be
 *                  empty for a `parked`/`blocked` item that produced none).
 * - `next_steps` — what a following round (or the human) should do next.
 * - `blocker`    — the fork/obstacle/failure reason; REQUIRED unless `done`.
 * - `v`          — envelope version for forward-compatibility.
 */
export const FleetHandoffRecordSchema = z
  .object({
    status: FleetHandoffStatusSchema,
    /** The fleet that produced this record (provenance). */
    fleet: z.string().min(1),
    /** The item identifier the worker handled. */
    item: z.string().min(1),
    /** One-line human-readable outcome. */
    summary: z.string().min(1),
    /** Verifiable evidence backing the outcome. Defaults to an empty list. */
    evidence: z.array(FleetHandoffEvidenceSchema).default([]),
    /** What a following round or the human should do next. Defaults to empty. */
    next_steps: z.array(z.string().min(1)).default([]),
    /** The blocking fork/obstacle/failure reason. Required unless `status` is
     * `done` (enforced by {@link validateFleetHandoffRecord}). */
    blocker: z.string().min(1).optional(),
    /** Envelope version ({@link FLEET_HANDOFF_RECORD_VERSION}). */
    v: z.number().int().positive().optional(),
  })
  .strict();

export type FleetHandoffRecord = z.infer<typeof FleetHandoffRecordSchema>;

/** The shape of a validation failure: which check failed and a human message. */
export interface FleetHandoffValidationError {
  /** A stable machine code for the failure class. */
  code: 'SCHEMA' | 'BLOCKER_REQUIRED';
  /** Human-readable explanation of what is malformed. */
  message: string;
  /** Zod issues when `code` is `SCHEMA` (absent for cross-field failures). */
  issues?: z.ZodIssue[];
}

/** Discriminated result of validating a candidate fleet handoff record. */
export type FleetHandoffValidationResult =
  | { ok: true; record: FleetHandoffRecord }
  | { ok: false; error: FleetHandoffValidationError };

/**
 * Validate an untrusted value into a {@link FleetHandoffRecord}. This is the
 * bounded-record guarantee: it rejects a record with a wrong-typed or missing
 * required field (via the schema, including unknown extra keys) AND enforces the
 * cross-field invariant that any non-`done` status carries a `blocker`. Returns
 * a discriminated result rather than throwing, so a fleet orchestrator can route
 * a malformed worker report without a try/catch.
 */
export function validateFleetHandoffRecord(input: unknown): FleetHandoffValidationResult {
  const parsed = FleetHandoffRecordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA',
        message: `fleet handoff record failed schema validation: ${parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ')}`,
        issues: parsed.error.issues,
      },
    };
  }
  const record = parsed.data;
  if (FLEET_HANDOFF_BLOCKER_REQUIRED_STATUSES.includes(record.status) && !record.blocker) {
    return {
      ok: false,
      error: {
        code: 'BLOCKER_REQUIRED',
        message: `fleet handoff record with status '${record.status}' must carry a non-empty 'blocker'`,
      },
    };
  }
  return { ok: true, record };
}

/**
 * Parse an untrusted value into a {@link FleetHandoffRecord}, throwing on a
 * malformed record. The throwing counterpart to {@link validateFleetHandoffRecord}
 * for call sites that prefer exceptions (e.g. a test or a fail-fast producer).
 */
export function parseFleetHandoffRecord(input: unknown): FleetHandoffRecord {
  const result = validateFleetHandoffRecord(input);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.record;
}
