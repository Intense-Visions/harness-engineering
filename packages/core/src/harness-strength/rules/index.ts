import type { StrengthRule } from '../types';
import { strength001NonblockingHooks } from './strength-001-nonblocking-hooks';
import { strength002Autobaseline } from './strength-002-autobaseline';
import { strength003SkipList } from './strength-003-skip-list';
import { strength004EmptyThresholds } from './strength-004-empty-thresholds';
import { strength005LowestTier } from './strength-005-lowest-tier';
import { strength006AutoapproveBaseline } from './strength-006-autoapprove-baseline';
import { strength007SnapshotSignalMismatch } from './strength-007-snapshot-signal-mismatch';

/** Registry of all StrengthRule modules, in ascending id order. */
export const ALL_RULES: StrengthRule[] = [
  strength001NonblockingHooks,
  strength002Autobaseline,
  strength003SkipList,
  strength004EmptyThresholds,
  strength005LowestTier,
  strength006AutoapproveBaseline,
  strength007SnapshotSignalMismatch,
];
