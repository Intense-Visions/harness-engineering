import type {
  RecoveryRecord,
  RehearsalManifest,
  RehearsalScore,
  RehearsalTier,
  ScoreDimension,
} from './types';

/**
 * Per-dimension weights (sum to 100). Detection + fix carry the most weight —
 * a rehearsal that neither notices nor repairs the planted defect has failed
 * regardless of process. `correctCheck` rewards reaching for the RIGHT harness
 * gate (the point of the rehearsal is to exercise a real capability), and
 * `noCollateral` penalises a fix that breaks unrelated code.
 */
export const REHEARSAL_WEIGHTS = {
  detected: 30,
  correctCheck: 20,
  fixed: 35,
  noCollateral: 15,
} as const;

/** Pass at >= 80, partial at >= 50, fail below. Exported so the boundary is testable. */
export function rehearsalTierFor(score: number): RehearsalTier {
  if (score >= 80) return 'pass';
  if (score >= 50) return 'partial';
  return 'fail';
}

/**
 * Normalise a harness check string for comparison: lowercase, collapse
 * whitespace, drop a leading "harness " so "check-security" and
 * "harness check-security" compare equal.
 */
function normalizeCheck(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^harness\s+/, '');
}

/**
 * detected — the agent noticed a defect was planted. If it also NAMED a failure
 * mode, that name must match the manifest (a confident wrong diagnosis does not
 * earn detection credit); if it named none, the boolean is trusted.
 */
function scoreDetected(manifest: RehearsalManifest, record: RecoveryRecord): ScoreDimension {
  if (!record.detected) {
    return dim('detected', false, 'Agent did not report any planted defect.');
  }
  if (record.identifiedFailureMode === undefined) {
    return dim('detected', true, 'Agent reported a planted defect.');
  }
  const matches = record.identifiedFailureMode === manifest.failureMode;
  return dim(
    'detected',
    matches,
    matches
      ? `Agent correctly identified the failure mode as "${manifest.failureMode}".`
      : `Agent misdiagnosed the failure mode ("${record.identifiedFailureMode}" vs planted "${manifest.failureMode}").`
  );
}

/**
 * correctCheck — the agent reached for the harness check this fixture exists to
 * exercise. Compared normalised so "harness check-security" matches
 * "check-security". The citation must CONTAIN the expected token (so a
 * "harness "-prefixed form still credits), but we do NOT credit the reverse:
 * a bare/short citation like "check" or "arch" must not satisfy "check-arch"
 * — that direction would credit almost any fixture.
 */
function scoreCorrectCheck(manifest: RehearsalManifest, record: RecoveryRecord): ScoreDimension {
  const expected = normalizeCheck(manifest.expectedCheck);
  const cited = record.checkCited !== undefined ? normalizeCheck(record.checkCited) : '';
  const credited = cited.length > 0 && (cited === expected || cited.includes(expected));
  const reason = credited
    ? `Agent used the expected check ("${manifest.expectedCheck}").`
    : record.checkCited
      ? `Agent cited "${record.checkCited}" but the fixture exercises "${manifest.expectedCheck}".`
      : `Agent cited no harness check (expected "${manifest.expectedCheck}").`;
  return dim('correctCheck', credited, reason);
}

/** Build one scored dimension, looking up its fixed weight by name. */
function dim(name: ScoreDimension['name'], credited: boolean, reason: string): ScoreDimension {
  return { name, weight: REHEARSAL_WEIGHTS[name], credited, reason };
}

/**
 * Pure, deterministic scoring of one recovery attempt against a fixture manifest.
 * No IO, no Date, no randomness — the fixture is ground truth, so a given
 * (manifest, record) pair always yields the same score. Each dimension is
 * credited independently and its rationale recorded, so the score is auditable.
 */
export function scoreRecovery(manifest: RehearsalManifest, record: RecoveryRecord): RehearsalScore {
  const dimensions: ScoreDimension[] = [
    scoreDetected(manifest, record),
    scoreCorrectCheck(manifest, record),
    dim(
      'fixed',
      record.fixed,
      record.fixed ? 'Planted defect resolved.' : 'Planted defect not resolved.'
    ),
    dim(
      'noCollateral',
      !record.collateralDamage,
      record.collateralDamage
        ? 'Recovery introduced unrelated breakage.'
        : 'No unrelated breakage reported.'
    ),
  ];

  const score = dimensions.reduce((sum, d) => sum + (d.credited ? d.weight : 0), 0);

  return {
    fixtureId: manifest.id,
    failureMode: manifest.failureMode,
    score,
    tier: rehearsalTierFor(score),
    dimensions,
  };
}
