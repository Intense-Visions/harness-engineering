/**
 * Project-level telemetry configuration stored in harness.config.json.
 * Only the on/off toggle lives here -- identity is in .harness/telemetry.json.
 */
export interface TelemetryConfig {
  /** Whether telemetry collection is enabled. Default: true. */
  enabled: boolean;
}

/**
 * Optional identity fields stored in .harness/telemetry.json (gitignored).
 * Each field is independently opt-in.
 */
export interface TelemetryIdentity {
  project?: string;
  team?: string;
  alias?: string;
}

/**
 * Resolved consent state after merging env vars, config, and identity file.
 */
export interface ConsentState {
  /** false if DO_NOT_TRACK, HARNESS_TELEMETRY_OPTOUT, or config disabled */
  allowed: boolean;
  /** Only populated when allowed is true */
  identity: TelemetryIdentity;
  /** UUIDv4 install ID -- only populated when allowed is true */
  installId: string;
}

/**
 * A single telemetry event payload for PostHog HTTP batch API.
 */
export interface TelemetryEvent {
  /** Event name, e.g. "skill_invocation", "session_end" */
  event: string;
  /** installId (anonymous) or alias (identified) */
  distinctId: string;
  properties: {
    installId: string;
    os: string;
    nodeVersion: string;
    harnessVersion: string;
    skillName?: string;
    duration?: number;
    outcome?: 'success' | 'failure';
    phasesReached?: string[];
    project?: string;
    team?: string;
  };
  /** ISO 8601 timestamp */
  timestamp: string;
}
