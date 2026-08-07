/**
 * Dashboard role taxonomy — shared by server (identity/preference resolution)
 * and client (role-scoped navigation lanes).
 *
 * A role is a PRESENTATION preference, not a security boundary. It selects
 * which navigation lane the dashboard renders for a viewer; it does not, on
 * its own, prevent a viewer from reaching any surface (see the client router
 * and the orchestrator proxy for where real, session-backed authorization
 * would eventually live).
 */

/**
 * Front-door lanes:
 * - `dev`    — the full operator surface (default; unchanged behavior).
 * - `pm-ba`  — product / business-analyst lane: author intent, watch agents,
 *              adjudicate at decision points.
 * - `client` — a curated lane for progress and traceability (presentation-only,
 *              like every lane — not a read-only access guarantee).
 */
export type DashboardRole = 'dev' | 'pm-ba' | 'client';

/** All roles, in canonical order. */
export const DASHBOARD_ROLES: readonly DashboardRole[] = ['dev', 'pm-ba', 'client'] as const;

/** The role assumed when none is configured or a stored value is invalid. */
export const DEFAULT_ROLE: DashboardRole = 'dev';

/** Type guard: is `value` one of the known dashboard roles? */
export function isDashboardRole(value: unknown): value is DashboardRole {
  return typeof value === 'string' && (DASHBOARD_ROLES as readonly string[]).includes(value);
}

/** Coerce any input to a valid role, falling back to {@link DEFAULT_ROLE}. */
export function coerceRole(value: unknown): DashboardRole {
  return isDashboardRole(value) ? value : DEFAULT_ROLE;
}
