/**
 * Client role → navigation-lane mapping.
 *
 * Groups the flat {@link SYSTEM_PAGES} registry into per-role lanes and picks a
 * default landing route per role. This is PRESENTATION-ONLY: it decides which
 * system pages the sidebar renders and where a role lands by default. It does
 * NOT prevent a viewer from reaching a page they can still hand-type the route
 * for — real per-role authorization is a server concern that arrives with
 * multi-user hosting and authenticated sessions.
 */
import { SYSTEM_PAGES, type SystemPage } from './thread';
import {
  DASHBOARD_ROLES,
  DEFAULT_ROLE,
  coerceRole,
  isDashboardRole,
  type DashboardRole,
} from '../../shared/roles';

export { DASHBOARD_ROLES, DEFAULT_ROLE, coerceRole, isDashboardRole };
export type { DashboardRole };

/** One entry of the {@link SYSTEM_PAGES} registry. */
export type SystemPageEntry = (typeof SYSTEM_PAGES)[number];

/** A navigation lane for one role. */
export interface RoleLane {
  role: DashboardRole;
  /** Short human label for the lane (used by the lane switcher). */
  label: string;
  /** One-line description of who the lane is for. */
  description: string;
  /**
   * Ordered allowlist of system pages visible in this lane, or `null` to mean
   * "every page" (the developer lane — unchanged from the flat registry).
   */
  pages: readonly SystemPage[] | null;
  /** Route this role lands on from `/`. */
  defaultRoute: string;
}

/**
 * Per-role lanes.
 *
 * - `dev`    — every page, lands on Signals (unchanged default experience).
 * - `pm-ba`  — Roadmap, Work in Flight, live agents/streams, and the proposal
 *              review queue: author intent, watch agents, adjudicate.
 * - `client` — a curated pair for progress and traceability: Roadmap plus
 *              Traceability. Presentation-only, like every lane: it does not
 *              enforce read-only access (a Claim write action still ships on
 *              the Roadmap page).
 */
export const ROLE_LANES: Record<DashboardRole, RoleLane> = {
  dev: {
    role: 'dev',
    label: 'Developer',
    description: 'Full dashboard — every signal, panel, and operator surface.',
    pages: null,
    defaultRoute: '/s/signals',
  },
  'pm-ba': {
    role: 'pm-ba',
    label: 'PM / BA',
    description: 'Author intent, watch agents, and adjudicate at decision points.',
    pages: ['roadmap', 'kanban', 'orchestrator', 'streams', 'proposals'],
    defaultRoute: '/s/roadmap',
  },
  client: {
    role: 'client',
    label: 'Client',
    description: 'A curated view of progress and traceability.',
    pages: ['roadmap', 'traceability'],
    defaultRoute: '/s/roadmap',
  },
};

/** The lane for a role, defaulting to the developer lane for unknown input. */
export function laneForRole(role: DashboardRole): RoleLane {
  return ROLE_LANES[role] ?? ROLE_LANES[DEFAULT_ROLE];
}

/**
 * The ordered list of {@link SYSTEM_PAGES} entries visible in a role's lane.
 * Developer sees the full registry in its canonical order; other lanes see
 * their allowlist in the order declared on the lane. Unknown page ids in a
 * lane allowlist are skipped.
 */
export function pagesForRole(role: DashboardRole): SystemPageEntry[] {
  const lane = laneForRole(role);
  if (lane.pages === null) return [...SYSTEM_PAGES];
  const byPage = new Map<SystemPage, SystemPageEntry>(SYSTEM_PAGES.map((e) => [e.page, e]));
  return lane.pages
    .map((page) => byPage.get(page))
    .filter((entry): entry is SystemPageEntry => entry !== undefined);
}

/** The default landing route for a role. */
export function defaultRouteForRole(role: DashboardRole): string {
  return laneForRole(role).defaultRoute;
}
