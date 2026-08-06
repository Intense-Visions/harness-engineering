import { describe, it, expect } from 'vitest';
import { SYSTEM_PAGES, type SystemPage } from '../../../src/client/types/thread';
import {
  DASHBOARD_ROLES,
  DEFAULT_ROLE,
  ROLE_LANES,
  coerceRole,
  defaultRouteForRole,
  isDashboardRole,
  laneForRole,
  pagesForRole,
  type DashboardRole,
} from '../../../src/client/types/roles';

const ALL_PAGES = new Set<SystemPage>(SYSTEM_PAGES.map((e) => e.page));

describe('dashboard role taxonomy', () => {
  it('exposes exactly three roles with dev as the default', () => {
    expect([...DASHBOARD_ROLES]).toEqual(['dev', 'pm-ba', 'client']);
    expect(DEFAULT_ROLE).toBe('dev');
  });

  it('isDashboardRole accepts known roles and rejects everything else', () => {
    expect(isDashboardRole('dev')).toBe(true);
    expect(isDashboardRole('pm-ba')).toBe(true);
    expect(isDashboardRole('client')).toBe(true);
    expect(isDashboardRole('admin')).toBe(false);
    expect(isDashboardRole('')).toBe(false);
    expect(isDashboardRole(null)).toBe(false);
    expect(isDashboardRole(undefined)).toBe(false);
    expect(isDashboardRole(42)).toBe(false);
  });

  it('coerceRole passes through valid roles and defaults invalid ones', () => {
    expect(coerceRole('pm-ba')).toBe('pm-ba');
    expect(coerceRole('client')).toBe('client');
    expect(coerceRole('nope')).toBe('dev');
    expect(coerceRole(undefined)).toBe('dev');
  });
});

describe('role → visible-pages mapping', () => {
  it('dev sees the entire flat registry in canonical order', () => {
    const pages = pagesForRole('dev').map((e) => e.page);
    expect(pages).toEqual(SYSTEM_PAGES.map((e) => e.page));
  });

  it('pm-ba sees the author/watch/adjudicate lane and nothing more', () => {
    const pages = pagesForRole('pm-ba').map((e) => e.page);
    expect(pages).toEqual(['roadmap', 'kanban', 'orchestrator', 'streams', 'proposals']);
    // Operator-only surfaces are excluded.
    expect(pages).not.toContain('tokens');
    expect(pages).not.toContain('webhooks');
    expect(pages).not.toContain('local-models');
  });

  it('client sees only the curated read-only pair', () => {
    const pages = pagesForRole('client').map((e) => e.page);
    expect(pages).toEqual(['roadmap', 'traceability']);
  });

  it('every lane allowlist references pages that exist in the registry', () => {
    for (const role of DASHBOARD_ROLES) {
      const lane = ROLE_LANES[role];
      if (lane.pages === null) continue;
      for (const page of lane.pages) {
        expect(ALL_PAGES.has(page)).toBe(true);
      }
      // A non-dev lane is a strict, non-empty subset of the full registry.
      expect(lane.pages.length).toBeGreaterThan(0);
      expect(lane.pages.length).toBeLessThan(SYSTEM_PAGES.length);
    }
  });

  it('pagesForRole returns entries with intact label and route', () => {
    const [first] = pagesForRole('client');
    expect(first?.page).toBe('roadmap');
    expect(first?.label).toBe('Roadmap');
    expect(first?.route).toBe('/s/roadmap');
  });

  it('falls back to the developer lane for an unknown role', () => {
    const unknown = 'ghost' as unknown as DashboardRole;
    expect(laneForRole(unknown)).toBe(ROLE_LANES.dev);
    expect(pagesForRole(unknown).map((e) => e.page)).toEqual(SYSTEM_PAGES.map((e) => e.page));
  });
});

describe('default landing per role', () => {
  it('lands each role on its lane default', () => {
    expect(defaultRouteForRole('dev')).toBe('/s/signals');
    expect(defaultRouteForRole('pm-ba')).toBe('/s/roadmap');
    expect(defaultRouteForRole('client')).toBe('/s/roadmap');
  });

  it('every default route points at a page inside that role lane', () => {
    for (const role of DASHBOARD_ROLES) {
      const route = defaultRouteForRole(role);
      const landingPage = route.replace('/s/', '') as SystemPage;
      const lanePages = pagesForRole(role).map((e) => e.page);
      expect(lanePages).toContain(landingPage);
    }
  });

  it('falls back to the developer landing for an unknown role', () => {
    const unknown = 'ghost' as unknown as DashboardRole;
    expect(defaultRouteForRole(unknown)).toBe('/s/signals');
  });
});
