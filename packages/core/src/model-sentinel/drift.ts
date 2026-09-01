/**
 * Model-update regression sentinel (#1617) — drift detection.
 *
 * Pure diff between two {@link ModelSnapshot}s. A change to any backend's resolved
 * model set — or a backend appearing/vanishing — is `material` drift (a trust
 * event: the model changed before the team noticed). Benign is reserved for the
 * (rare) case where digests differ only because of non-identity metadata; today
 * the snapshot carries only identity, so any digest change with real deltas is
 * material.
 */

import type { BackendModelDelta, DriftSeverity, ModelDriftResult, ModelSnapshot } from './types';

function diffModels(
  before: string[],
  after: string[]
): {
  addedModels: string[];
  removedModels: string[];
} {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    addedModels: after.filter((m) => !beforeSet.has(m)),
    removedModels: before.filter((m) => !afterSet.has(m)),
  };
}

function sameModels(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Classify a single backend's change between two snapshots. */
function classifyStatus(
  prev: { models: string[] } | undefined,
  curr: { models: string[] } | undefined,
  changed: boolean
): BackendModelDelta['status'] {
  if (prev === undefined) return 'added';
  if (curr === undefined) return 'removed';
  return changed ? 'changed' : 'unchanged';
}

/** Build the delta for one backend, or null when it is unchanged. */
function backendDelta(
  name: string,
  prev: { models: string[] } | undefined,
  curr: { models: string[] } | undefined
): BackendModelDelta | null {
  const before = prev?.models ?? [];
  const after = curr?.models ?? [];
  const status = classifyStatus(prev, curr, !sameModels(before, after));
  if (status === 'unchanged') return null;
  const { addedModels, removedModels } = diffModels(before, after);
  return { backend: name, status, before, after, addedModels, removedModels };
}

/**
 * Compute the drift between the previous snapshot (or null on first run) and the
 * current one. Returns every backend delta that is not `unchanged`.
 */
export function detectModelDrift(
  previous: ModelSnapshot | null,
  current: ModelSnapshot
): ModelDriftResult {
  if (previous === null) {
    return {
      kind: 'initial',
      severity: 'none',
      deltas: [],
      previousDigest: null,
      currentDigest: current.digest,
    };
  }

  if (previous.digest === current.digest) {
    return {
      kind: 'unchanged',
      severity: 'none',
      deltas: [],
      previousDigest: previous.digest,
      currentDigest: current.digest,
    };
  }

  const prevByName = new Map(previous.backends.map((b) => [b.backend, b]));
  const currByName = new Map(current.backends.map((b) => [b.backend, b]));
  const names = [...new Set([...prevByName.keys(), ...currByName.keys()])].sort();

  const deltas: BackendModelDelta[] = [];
  for (const name of names) {
    const delta = backendDelta(name, prevByName.get(name), currByName.get(name));
    if (delta !== null) deltas.push(delta);
  }

  // Digests differed. If we found no identity delta (e.g. only a `type` label
  // shifted with the same models) treat it as benign; otherwise material.
  const severity: DriftSeverity = deltas.length > 0 ? 'material' : 'benign';

  return {
    kind: 'changed',
    severity,
    deltas,
    previousDigest: previous.digest,
    currentDigest: current.digest,
  };
}
