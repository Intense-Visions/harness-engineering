/**
 * Waypoint `sdlc.*` verdict emission for MCP tool handlers (opt-in,
 * pnyon/pnyon#124).
 *
 * Each helper lazily initializes the core Waypoint emitter for the project
 * (a memoized no-op unless `harness.config.json` declares `waypoint.sink`)
 * and spools one `sdlc.verify.graded.v1` event surfacing an EXISTING
 * persisted verdict — emission, never new judgment. Every helper is
 * fire-and-forget: it never throws and never alters the handler's response
 * (PRD Story 1: emission failure must not fail the operation).
 */

import * as path from 'node:path';

/**
 * Derives the work-item identifier a verdict grades from its spec path:
 * `docs/changes/<slug>/…` yields the slug; anything else falls back to the
 * spec file's basename without extension.
 */
export function specSlug(specPath: string): string {
  const normalized = specPath.replaceAll('\\', '/');
  const match = /docs\/changes\/([^/]+)\//.exec(normalized);
  if (match) return match[1] as string;
  return path.basename(normalized).replace(/\.md$/, '');
}

interface VerdictShape {
  verdict?: string;
  measurability?: string;
  confidence?: string;
}

/** Spools an outcome_eval verdict (`SATISFIED` asserts V2). */
export async function emitOutcomeVerdictEvent(
  projectRoot: string,
  verdict: unknown,
  specPath: string
): Promise<void> {
  await emitEvalVerdict(projectRoot, 'outcome', verdict, specPath);
}

/** Spools an acceptance_eval verdict (`MEASURABLE` asserts V1). */
export async function emitAcceptanceVerdictEvent(
  projectRoot: string,
  verdict: unknown,
  specPath: string
): Promise<void> {
  await emitEvalVerdict(projectRoot, 'acceptance', verdict, specPath);
}

async function emitEvalVerdict(
  projectRoot: string,
  kind: 'outcome' | 'acceptance',
  verdict: unknown,
  specPath: string
): Promise<void> {
  try {
    const { ensureWaypointEmitter, emitVerdictPersisted } =
      await import('@harness-engineering/core');
    if (ensureWaypointEmitter(projectRoot) === null) return;
    const shape = (verdict ?? {}) as VerdictShape;
    const verdictText = kind === 'acceptance' ? shape.measurability : shape.verdict;
    if (typeof verdictText !== 'string' || verdictText.length === 0) return;
    emitVerdictPersisted({
      kind,
      verdict: verdictText,
      ...(typeof shape.confidence === 'string' ? { confidence: shape.confidence } : {}),
      item: specSlug(specPath),
      detail: { specPath },
    });
  } catch {
    /* Waypoint emission failure is non-fatal */
  }
}

/** Spools a human UAT sign-off (`ACCEPTED` asserts V3; human actor). */
export async function emitUatSignoffEvent(
  projectRoot: string,
  signoff: { slug: string; decision: string; signedOffBy: string }
): Promise<void> {
  try {
    const { ensureWaypointEmitter, emitVerdictPersisted } =
      await import('@harness-engineering/core');
    if (ensureWaypointEmitter(projectRoot) === null) return;
    emitVerdictPersisted({
      kind: 'uat',
      verdict: signoff.decision,
      item: signoff.slug,
      actor: { kind: 'human', id: `user://${signoff.signedOffBy}` },
    });
  } catch {
    /* Waypoint emission failure is non-fatal */
  }
}
