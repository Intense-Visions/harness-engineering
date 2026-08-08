/**
 * @harness-engineering/types — immutable ULID identity for sessions & worktrees.
 *
 * An additive metadata record: the ULID is the durable, sortable, collision-free
 * key assigned once at creation; `number` is a human-friendly sequential label
 * assigned only at completion.
 *
 * Spec: docs/changes/ulid-identity-sessions-worktrees/proposal.md
 */
export type IdentityDomain = 'session' | 'worktree';

export interface HarnessIdentity {
  /** Immutable collision-free ULID, assigned once at creation. */
  ulid: string;
  /** Human-facing label — session slug or worktree identifier. */
  slug: string;
  domain: IdentityDomain;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** Sequential human-friendly number; null until completion. */
  number: number | null;
  /** ISO-8601 completion timestamp; null until completion. */
  completedAt: string | null;
}
