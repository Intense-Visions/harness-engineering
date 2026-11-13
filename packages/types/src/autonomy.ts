/**
 * Trusted Autonomy Mode: contract types (docs/changes/trusted-autonomy-mode/proposal.md).
 * Unrelated to the roadmap auto-triage "autonomy ratchet" (ratchetStage).
 */

export const AUTONOMY_LEVELS = ['supervised', 'trusted'] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

/** Resolution sources, highest precedence first (D3). */
export const AUTONOMY_SOURCES = ['flag', 'session', 'env', 'user-config', 'default'] as const;
export type AutonomySource = (typeof AUTONOMY_SOURCES)[number];

/** Effective audit when no source sets it (D9). */
export const DEFAULT_AUTONOMY_AUDIT: Readonly<Record<AutonomyLevel, boolean>> = {
  trusted: true,
  supervised: false,
};

export interface AutonomySetting {
  level?: AutonomyLevel;
  audit?: boolean;
}

/**
 * An invocation flag. Lower-only (D17): resolveAutonomy honours only `level: 'supervised'` and
 * `audit: true`; any other value is ignored with a warning. `at` is the invocation time (D3 recency).
 */
export interface AutonomyFlag extends AutonomySetting {
  at?: string;
}

export type AutonomyOverrideOrigin = 'cli' | 'mcp';

export interface AutonomyOverrideField<T> {
  value: T;
  setAt: string;
  origin: AutonomyOverrideOrigin;
  /** Set on raised values only (D14): after this instant the field is ignored. */
  expiresAt?: string;
}

/**
 * Session override stored at ~/.harness/session-overrides/<repoKey>/<slug>.json (D12).
 * Each field carries its own timestamp so updating one field never re-dates the other.
 */
export interface AutonomySessionOverride {
  level?: AutonomyOverrideField<AutonomyLevel>;
  audit?: AutonomyOverrideField<boolean>;
}

/** The user-level ~/.harness/config.json shape (autonomy portion). */
export interface AutonomyUserConfig {
  autonomy?: {
    level?: AutonomyLevel;
    audit?: { trusted?: boolean; supervised?: boolean };
  };
}

export interface ResolvedAutonomy {
  level: AutonomyLevel;
  /** Effective audit for the resolved level. */
  audit: boolean;
  source: { level: AutonomySource; audit: AutonomySource };
  /** Non-fatal problems met while resolving (malformed config, unrecognised env value). */
  warnings: string[];
}

/** Pause classes an auto-decision can carry (D1). irreversible and gate never auto-proceed. */
export const AUTO_DECISION_PAUSE_CLASSES = ['ceremony', 'judgment'] as const;
export type AutoDecisionPauseClass = (typeof AUTO_DECISION_PAUSE_CLASSES)[number];

export const AUTO_DECISION_AUDIT_STATUSES = ['agreed', 'escalated', 'unavailable', 'off'] as const;
export type AutoDecisionAuditStatus = (typeof AUTO_DECISION_AUDIT_STATUSES)[number];

/** Self-audit outcome for a judgment fork (D7, D8, D11). */
export type AutoDecisionAudit =
  | {
      status: 'agreed';
      blindPick: string;
      objection?: { severity: 'non-blocking'; text: string };
    }
  | {
      status: 'escalated';
      blindPick: string;
      objection?: { severity: 'blocking' | 'non-blocking'; text: string };
      humanChoice: string;
    }
  | { status: 'unavailable' | 'off' };

/** What a caller supplies. `ts` and `autonomySource` are stamped by the writer, never the caller. */
export interface AutoDecisionInput {
  skill: string;
  phase: string;
  pauseClass: AutoDecisionPauseClass;
  question: string;
  options: string[];
  chosen: string;
  rationale: string;
  /** Required for judgment, absent for ceremony. */
  audit?: AutoDecisionAudit;
}

/** One line of .harness/sessions/<slug>/auto-decisions.jsonl (D6). */
export interface AutoDecision extends AutoDecisionInput {
  ts: string;
  autonomySource: AutonomySource;
}

export interface AutoDecisionSummary {
  total: number;
  byClass: Record<AutoDecisionPauseClass, number>;
  /** M: every judgment decision, including audit unavailable/off (SC9). */
  judgments: number;
  /** N: judgment decisions whose audit actually ran (agreed + escalated). */
  audited: number;
  agreed: number;
  escalations: number;
  unavailable: number;
  off: number;
  /** agreed / audited; null when nothing was audited (never shown as 100%). */
  agreementRate: number | null;
}
