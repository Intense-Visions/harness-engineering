import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_ROLE, isDashboardRole, type DashboardRole } from '../types/roles';

/**
 * Presentation-only dashboard role.
 *
 * Resolution order: a persisted client preference (localStorage) wins; else the
 * server's `/api/identity` role (env-configured default); else `dev`. Switching
 * lanes persists the choice locally. This is not a security boundary — it only
 * selects which navigation lane the client renders.
 */
const STORAGE_KEY = 'harness.dashboard.role';

interface RoleContextValue {
  role: DashboardRole;
  /** Persist and apply a new lane. */
  setRole: (role: DashboardRole) => void;
  /** True once the initial role has been resolved (storage or identity fetch). */
  ready: boolean;
}

const RoleContext = createContext<RoleContextValue>({
  role: DEFAULT_ROLE,
  setRole: () => {},
  ready: true,
});

function readStoredRole(): DashboardRole | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  return isDashboardRole(stored) ? stored : null;
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const storedRole = readStoredRole();
  const [role, setRoleState] = useState<DashboardRole>(storedRole ?? DEFAULT_ROLE);
  // A stored preference is authoritative and already resolved; otherwise we
  // wait for the identity fetch before reporting ready so role-aware landing
  // can honor the server-configured default on first load.
  const [ready, setReady] = useState<boolean>(storedRole !== null);

  useEffect(() => {
    if (storedRole !== null) return; // client preference wins; skip the fetch
    let cancelled = false;
    fetch('/api/identity')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { role?: unknown } | null) => {
        if (cancelled) return;
        if (data && isDashboardRole(data.role)) setRoleState(data.role);
      })
      .catch(() => {
        // Identity unavailable — keep the default lane.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storedRole]);

  const setRole = (next: DashboardRole) => {
    setRoleState(next);
    setReady(true);
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
  };

  return <RoleContext.Provider value={{ role, setRole, ready }}>{children}</RoleContext.Provider>;
}

export const useRole = () => useContext(RoleContext);
