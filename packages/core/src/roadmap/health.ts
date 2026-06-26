import type { Roadmap, RoadmapFeature, RoadmapMilestone } from '@harness-engineering/types';
import { assigneeInvariantHolds } from './assignee-lifecycle';

/**
 * Roadmap maintenance: health checks (read-only diagnostics) and grooming
 * (pure state transitions) that keep `docs/roadmap.md` tidy over time.
 *
 * The same predicates power two consumers:
 *  - `checkRoadmapHealth` — surfaced by `harness validate` as a regression guard.
 *  - `groomRoadmap` — applied by the roadmap skill's `--groom` mode to remediate.
 *
 * Design principle these encode: **a milestone is a theme, a status is a
 * lifecycle stage.** Lifecycle catch-all milestones ("Backlog", "Current Work")
 * are an anti-pattern; done work belongs in an archive; and a `planned` row with
 * neither a spec nor a plan is invisible-but-noisy to the orchestrator (it infers
 * `full-exploration` scope and always escalates to a human).
 *
 * @see docs/knowledge/roadmap/roadmap-maintenance.md
 */

export type RoadmapHealthSeverity = 'error' | 'warning';

export type RoadmapHealthRuleId = 'RMH001' | 'RMH002' | 'RMH003' | 'RMH004' | 'RMH005';

export interface RoadmapHealthFinding {
  ruleId: RoadmapHealthRuleId;
  severity: RoadmapHealthSeverity;
  milestone: string;
  /** Feature name when the finding is feature-scoped; absent for milestone-scoped findings. */
  feature?: string;
  message: string;
  suggestion?: string;
}

export interface RoadmapHealthOptions {
  /**
   * Returns true for milestones that legitimately hold `done` work (version
   * archives + the Shipped lane). Done items here are not flagged.
   * Default: names starting `v<digit>`, plus "Shipped" and "Hermes Adoption".
   */
  isArchive?: (milestoneName: string) => boolean;
  /** Max features in an active (non-archive) milestone before RMH004 fires. Default 25. */
  maxActiveMilestoneSize?: number;
  /** Milestone names that must never exist (lifecycle catch-alls). Default ["Backlog", "Current Work"]. */
  catchAllMilestones?: string[];
  /** The single intake lane; exempt from done/size rules. Default "Intake". */
  intakeMilestone?: string;
}

const DEFAULT_CATCH_ALL = ['Backlog', 'Current Work'];
const DEFAULT_INTAKE = 'Intake';
const DEFAULT_MAX_ACTIVE = 25;

/** Default archive predicate: version milestones + the Shipped lane + Hermes. */
export function defaultIsArchive(name: string): boolean {
  return /^v\d/.test(name) || name === 'Shipped' || name === 'Hermes Adoption';
}

/** A `planned` row the orchestrator cannot act on: no spec AND no plan. */
export function isUnactionablePlanned(feature: RoadmapFeature): boolean {
  return feature.status === 'planned' && feature.spec === null && feature.plans.length === 0;
}

function resolveOptions(options?: RoadmapHealthOptions): Required<RoadmapHealthOptions> {
  return {
    isArchive: options?.isArchive ?? defaultIsArchive,
    maxActiveMilestoneSize: options?.maxActiveMilestoneSize ?? DEFAULT_MAX_ACTIVE,
    catchAllMilestones: options?.catchAllMilestones ?? DEFAULT_CATCH_ALL,
    intakeMilestone: options?.intakeMilestone ?? DEFAULT_INTAKE,
  };
}

/**
 * Diagnose roadmap hygiene. Pure and read-only — returns findings, never mutates.
 *
 * Rules:
 *  - RMH001 (warning): a `done` feature sits in an active (non-archive) milestone.
 *  - RMH002 (warning): a `planned` feature has neither spec nor plan (orchestrator-invisible).
 *  - RMH003 (error):   a lifecycle catch-all milestone ("Backlog"/"Current Work") exists.
 *  - RMH004 (warning): an active milestone exceeds the size cap (itself a mini-dump).
 *  - RMH005 (error):   the assignee invariant is broken — a feature has an assignee
 *                      but is not `in-progress`, or is `in-progress` with no assignee.
 */
export function checkRoadmapHealth(
  roadmap: Roadmap,
  options?: RoadmapHealthOptions
): RoadmapHealthFinding[] {
  const opts = resolveOptions(options);
  const findings: RoadmapHealthFinding[] = [];

  for (const milestone of roadmap.milestones) {
    const archive = opts.isArchive(milestone.name);
    const isIntake = milestone.name === opts.intakeMilestone;

    // RMH003 — catch-all milestone present (regression).
    if (opts.catchAllMilestones.some((n) => n.toLowerCase() === milestone.name.toLowerCase())) {
      findings.push({
        ruleId: 'RMH003',
        severity: 'error',
        milestone: milestone.name,
        message: `Lifecycle catch-all milestone "${milestone.name}" exists. Milestones should be themes, not stages.`,
        suggestion: `Rename to a theme or run the roadmap skill's --groom mode to drain it into themed milestones.`,
      });
    }

    // RMH004 — oversized active milestone.
    if (!archive && !isIntake && milestone.features.length > opts.maxActiveMilestoneSize) {
      findings.push({
        ruleId: 'RMH004',
        severity: 'warning',
        milestone: milestone.name,
        message: `Active milestone "${milestone.name}" has ${milestone.features.length} features (cap ${opts.maxActiveMilestoneSize}); it is becoming a dump.`,
        suggestion: `Split it into sub-themes.`,
      });
    }

    for (const feature of milestone.features) {
      // RMH001 — done work outside an archive.
      if (feature.status === 'done' && !archive && !isIntake) {
        findings.push({
          ruleId: 'RMH001',
          severity: 'warning',
          milestone: milestone.name,
          feature: feature.name,
          message: `Completed feature "${feature.name}" is still in active milestone "${milestone.name}".`,
          suggestion: `Archive it (move to Shipped) — run the roadmap skill's --groom mode.`,
        });
      }

      // RMH002 — unactionable planned (no spec, no plan).
      if (isUnactionablePlanned(feature)) {
        findings.push({
          ruleId: 'RMH002',
          severity: 'warning',
          milestone: milestone.name,
          feature: feature.name,
          message: `"${feature.name}" is "planned" with no spec and no plan; the orchestrator cannot auto-execute it (it escalates to a human).`,
          suggestion: `Link a spec/plan to make it actionable, or demote it to "backlog".`,
        });
      }

      // RMH005 — the assignee invariant: assignee ≠ null ⟺ in-progress.
      if (!assigneeInvariantHolds(feature)) {
        const orphaned = feature.status === 'in-progress' && feature.assignee === null;
        findings.push({
          ruleId: 'RMH005',
          severity: 'error',
          milestone: milestone.name,
          feature: feature.name,
          message: orphaned
            ? `"${feature.name}" is "in-progress" with no assignee; an in-progress row must name who is executing it.`
            : `"${feature.name}" has assignee "${feature.assignee}" but status "${feature.status}"; an assignee means in-progress (set at execution start, cleared otherwise).`,
          suggestion: orphaned
            ? `Demote it to "planned" (or claim it) — run the roadmap skill's --groom mode.`
            : `Clear the assignee (or move it to "in-progress") — run the roadmap skill's --groom mode.`,
        });
      }
    }
  }

  return findings;
}

export type RoadmapGroomChangeKind = 'archived' | 'demoted' | 'unassigned';

export interface RoadmapGroomChange {
  kind: RoadmapGroomChangeKind;
  feature: string;
  /** Milestone the feature was in before grooming. */
  from: string;
  /**
   * For 'demoted': the new status. For 'archived': the archive milestone name.
   * For 'unassigned': the assignee that was cleared.
   */
  to: string;
}

export interface RoadmapGroomOptions extends RoadmapHealthOptions {
  /**
   * When true, `done` features in active milestones are removed from the active
   * roadmap and returned in `archived` for the caller to append to the archive
   * file. When false, archiving is skipped (only demotion runs). Default true.
   */
  archiveDone?: boolean;
}

export interface RoadmapGroomResult {
  /** The groomed active roadmap (demotions applied, archived features removed). */
  roadmap: Roadmap;
  /** Features removed for archival — the caller appends these to docs/roadmap-archive.md. */
  archived: RoadmapFeature[];
  /** Human-readable record of every change made. */
  changes: RoadmapGroomChange[];
}

/**
 * Groom the active roadmap. Pure: clones input, never mutates it.
 *
 * Three mechanical, safe transforms:
 *  1. Demote every unactionable `planned` row (no spec & no plan) to `backlog`,
 *     so the orchestrator stops bouncing it.
 *  2. Restore the assignee invariant (`assignee ≠ null ⟺ in-progress`): clear the
 *     assignee on any non-in-progress row, and demote an orphaned `in-progress`
 *     row (no assignee) back to `planned`.
 *  3. Lift every `done` feature out of an active milestone into `archived`
 *     (caller persists to the archive file).
 *
 * Draining the Intake lane into themed milestones is intentionally NOT automated
 * — that routing is a human/semantic decision the skill walks through.
 */
export function groomRoadmap(roadmap: Roadmap, options?: RoadmapGroomOptions): RoadmapGroomResult {
  const opts = resolveOptions(options);
  const archiveDone = options?.archiveDone ?? true;
  const next: Roadmap = structuredClone(roadmap);
  const archived: RoadmapFeature[] = [];
  const changes: RoadmapGroomChange[] = [];

  for (const milestone of next.milestones) {
    const archive = opts.isArchive(milestone.name);
    const isIntake = milestone.name === opts.intakeMilestone;
    const kept: RoadmapFeature[] = [];

    for (const feature of milestone.features) {
      // 1. Demote unactionable planned rows (applies everywhere).
      if (isUnactionablePlanned(feature)) {
        feature.status = 'backlog';
        changes.push({
          kind: 'demoted',
          feature: feature.name,
          from: milestone.name,
          to: 'backlog',
        });
      }

      // 2. Restore the assignee invariant (assignee ≠ null ⟺ in-progress).
      if (feature.status !== 'in-progress' && feature.assignee !== null) {
        changes.push({
          kind: 'unassigned',
          feature: feature.name,
          from: milestone.name,
          to: feature.assignee,
        });
        feature.assignee = null;
      } else if (feature.status === 'in-progress' && feature.assignee === null) {
        feature.status = 'planned';
        changes.push({
          kind: 'demoted',
          feature: feature.name,
          from: milestone.name,
          to: 'planned',
        });
      }

      // 3. Archive done work that sits in an active milestone.
      if (archiveDone && feature.status === 'done' && !archive && !isIntake) {
        archived.push(feature);
        changes.push({
          kind: 'archived',
          feature: feature.name,
          from: milestone.name,
          to: 'Shipped',
        });
        continue; // drop from the active milestone
      }

      kept.push(feature);
    }

    milestone.features = kept;
  }

  // Drop milestones that grooming emptied — but never the intake lane.
  next.milestones = next.milestones.filter(
    (m: RoadmapMilestone) => m.features.length > 0 || m.name === opts.intakeMilestone
  );

  return { roadmap: next, archived, changes };
}
