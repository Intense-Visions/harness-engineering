/**
 * Emission-point mapping helpers — one tiny function per sanctioned harness
 * emission family, each translating an already-committed harness fact into
 * one pinned `sdlc.*.v1` event and routing it through {@link emitSdlc}.
 *
 * Every helper is a guaranteed no-op when no Waypoint sink is configured
 * (PRD Story 1), never throws, and emits at most one event per committed
 * fact. This is emission, not new judgment: helpers carry existing payloads
 * (statuses, verdicts, quality gates, fleet records) and never compute new
 * ones.
 *
 * Vocabulary mapping (documented in the change proposal):
 * - roadmap `setStatus` → `sdlc.intent.updated.v1` (`sdlc.intent.closed.v1`
 *   when the new status is `done`)
 * - roadmap `claim` → `sdlc.claim.opened.v1`
 * - roadmap `release` → `sdlc.claim.released.v1`
 * - skill phase transition (`emit_interaction`) → `sdlc.build.finished.v1`
 *   (the completed phase is the finished run; `qualityGate` rides in `data`)
 * - outcome/acceptance/UAT verdict persistence → `sdlc.verify.graded.v1`
 * - fleet `provenance.json` write → `sdlc.build.finished.v1`
 * - fleet handoff record: `done` → `sdlc.review.requested.v1` (the item now
 *   awaits the human PR gate); otherwise → `sdlc.intent.updated.v1`
 */

import type {
  FeatureStatus,
  FleetHandoffRecord,
  SdlcActor,
  SdlcVerificationGrade,
} from '@harness-engineering/types';
import { emitSdlc } from './emitter';

/** Stable subject for a roadmap feature. */
function itemSubject(featureName: string): string {
  return `item/${featureName}`;
}

/**
 * A committed `setStatus` mutation. `done` closes the intent; every other
 * status is an intent update.
 */
export function emitRoadmapStatusChange(
  featureName: string,
  status: FeatureStatus,
  previousStatus: FeatureStatus
): string | null {
  return emitSdlc({
    type: status === 'done' ? 'sdlc.intent.closed.v1' : 'sdlc.intent.updated.v1',
    subject: itemSubject(featureName),
    component: 'roadmap',
    data: { mutator: 'setStatus', status, previousStatus },
  });
}

/** A committed `claim` mutation (execution start; first claim wins). */
export function emitRoadmapClaim(featureName: string, assignee: string): string | null {
  return emitSdlc({
    type: 'sdlc.claim.opened.v1',
    subject: itemSubject(featureName),
    component: 'roadmap',
    data: { mutator: 'claim', assignee },
  });
}

/** A committed `release` mutation (claim released without completion). */
export function emitRoadmapRelease(
  featureName: string,
  previousAssignee: string | null
): string | null {
  return emitSdlc({
    type: 'sdlc.claim.released.v1',
    subject: itemSubject(featureName),
    component: 'roadmap',
    data: { mutator: 'release', ...(previousAssignee !== null ? { previousAssignee } : {}) },
  });
}

/** The `qualityGate` payload shape carried by `emit_interaction` transitions. */
export interface SkillTransitionQualityGate {
  readonly checks: readonly {
    readonly name: string;
    readonly passed: boolean;
    readonly detail?: string | undefined;
  }[];
  readonly allPassed: boolean;
}

/** One skill phase transition surfaced through the `emit_interaction` path. */
export interface SkillPhaseTransition {
  readonly completedPhase: string;
  readonly suggestedNext: string;
  readonly reason: string;
  readonly artifacts: readonly string[];
  readonly qualityGate?: SkillTransitionQualityGate;
}

/**
 * A skill phase transition: the completed phase is a finished execution run;
 * the transition's `qualityGate` fields are preserved verbatim in `data`.
 */
export function emitSkillPhaseTransition(transition: SkillPhaseTransition): string | null {
  return emitSdlc({
    type: 'sdlc.build.finished.v1',
    subject: `phase/${transition.completedPhase}`,
    component: 'skills',
    data: {
      completedPhase: transition.completedPhase,
      suggestedNext: transition.suggestedNext,
      reason: transition.reason,
      artifacts: transition.artifacts,
      ...(transition.qualityGate !== undefined ? { qualityGate: transition.qualityGate } : {}),
    },
  });
}

/** Which existing judgment artifact a verdict event surfaces. */
export type VerdictKind = 'outcome' | 'acceptance' | 'uat';

/** A persisted eval/UAT verdict (existing judgment — never recomputed here). */
export interface PersistedVerdict {
  readonly kind: VerdictKind;
  /** The verdict string exactly as persisted (e.g. `SATISFIED`, `MEASURABLE`, `ACCEPTED`). */
  readonly verdict: string;
  /** Verdict confidence when the source artifact carries one. */
  readonly confidence?: string;
  /** The work item the verdict grades (feature name, spec slug, PR ref). */
  readonly item: string;
  /** Extra source-artifact fields worth carrying (rationale refs, spec path). */
  readonly detail?: Readonly<Record<string, unknown>>;
  /**
   * Explicit actor — a UAT sign-off is a HUMAN verdict and carries the human
   * principal; eval verdicts default to the emitter's agent actor.
   */
  readonly actor?: SdlcActor;
}

const PASSING_VERDICTS: Readonly<
  Record<VerdictKind, { pass: string; grade: SdlcVerificationGrade }>
> = {
  acceptance: { pass: 'MEASURABLE', grade: 'V1' },
  outcome: { pass: 'SATISFIED', grade: 'V2' },
  uat: { pass: 'ACCEPTED', grade: 'V3' },
};

/**
 * Verification-grade mapping (an explicit, documented projection of existing
 * verdicts — not new judgment): a passing acceptance verdict asserts V1, a
 * passing outcome verdict V2, a UAT approval V3; anything else asserts V0.
 */
export function verdictGrade(kind: VerdictKind, verdict: string): SdlcVerificationGrade {
  return PASSING_VERDICTS[kind].pass === verdict ? PASSING_VERDICTS[kind].grade : 'V0';
}

/** A persisted OutcomeVerdict / AcceptanceVerdict / UAT sign-off. */
export function emitVerdictPersisted(persisted: PersistedVerdict): string | null {
  return emitSdlc({
    type: 'sdlc.verify.graded.v1',
    subject: itemSubject(persisted.item),
    component: 'eval',
    grade: verdictGrade(persisted.kind, persisted.verdict),
    ...(persisted.actor !== undefined ? { actor: persisted.actor } : {}),
    data: {
      kind: persisted.kind,
      verdict: persisted.verdict,
      ...(persisted.confidence !== undefined ? { confidence: persisted.confidence } : {}),
      ...(persisted.detail !== undefined ? { detail: persisted.detail } : {}),
    },
  });
}

/** A written per-item fleet `provenance.json` artifact. */
export interface FleetProvenanceArtifact {
  /** The item the provenance belongs to (slug / issue ref). */
  readonly item: string;
  /** Pipeline stages the artifact records. */
  readonly stages: readonly string[];
  /** Repo-relative path of the written artifact. */
  readonly artifactPath: string;
}

/** A fleet pipeline wrote a `provenance.json` for an item. */
export function emitFleetProvenanceWritten(artifact: FleetProvenanceArtifact): string | null {
  return emitSdlc({
    type: 'sdlc.build.finished.v1',
    subject: itemSubject(artifact.item),
    component: 'fleet',
    data: {
      artifact: 'provenance',
      artifactPath: artifact.artifactPath,
      stages: artifact.stages,
    },
  });
}

/**
 * A fleet worker's handoff record was written. A `done` handoff means the
 * item now awaits the human PR gate (`sdlc.review.requested.v1`); every
 * other disposition is an intent update carrying the blocker. The full
 * record rides in `data` so an ingest can reconstruct the handoff without
 * reading the repo (PRD Story 4).
 */
export function emitFleetHandoffWritten(record: FleetHandoffRecord): string | null {
  return emitSdlc({
    type: record.status === 'done' ? 'sdlc.review.requested.v1' : 'sdlc.intent.updated.v1',
    subject: itemSubject(record.item),
    component: 'fleet',
    data: {
      artifact: 'handoff',
      status: record.status,
      fleet: record.fleet,
      summary: record.summary,
      evidence: record.evidence,
      next_steps: record.next_steps,
      ...(record.blocker !== undefined ? { blocker: record.blocker } : {}),
    },
  });
}
