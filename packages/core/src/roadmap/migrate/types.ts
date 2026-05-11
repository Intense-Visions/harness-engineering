import type { NewFeatureInput, FeaturePatch, HistoryEvent } from '../tracker';
import type { Roadmap } from '@harness-engineering/types';

export interface MigrationPlan {
  /** Features to create via client.create(). */
  toCreate: Array<{ name: string; input: NewFeatureInput }>;
  /** Features whose body-block differs from canonical; will be updated via client.update(). */
  toUpdate: Array<{ externalId: string; name: string; patch: FeaturePatch; diff: string }>;
  /** Features whose body already matches; no-op at step 4. */
  unchanged: Array<{ externalId: string; name: string }>;
  /** History events to append, deduplicated by hash against existing comments. */
  historyToAppend: Array<{ externalId: string; event: HistoryEvent; hash: string }>;
  /** Features in `roadmap.md` with no External-ID AND a same-titled existing issue (D-P5-E). */
  ambiguous: Array<{ name: string; existingIssueRef: string }>;
}

export interface MigrationOptions {
  /** Project root containing harness.config.json + docs/. */
  projectRoot: string;
  /** When true, run plan-only (steps 1-4 in-memory; no writes; no archive; no config rewrite). */
  dryRun: boolean;
}

export interface MigrationReport {
  created: number;
  updated: number;
  unchanged: number;
  historyAppended: number;
  archivedFrom: string | null;
  archivedTo: string | null;
  configBackup: string | null;
  mode: 'dry-run' | 'applied' | 'already-migrated' | 'aborted';
  abortReason?: string;
  /**
   * Features that WERE created (with their new externalIds) when an abort
   * happened during step 3 (create). Empty in the happy path. Operators use
   * this to hand-record partial state.
   */
  createdSoFar?: Array<{ name: string; externalId: string }>;
}

export type { Roadmap };
