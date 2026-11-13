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

/** Invocation flag. `at` is the session start (ISO) used for the flag-vs-override recency tie (D3). */
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
