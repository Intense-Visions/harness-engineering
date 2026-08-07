// FIXTURE (deliberately broken): rehearse against `harness check-arch`.
// service layer — the ONLY layer the ui is allowed to depend on. See
// ../../rehearsal.json.

import { findUserRow } from '../db/user-repository';

export interface User {
  id: string;
  name: string;
}

export function getUser(id: string): User | undefined {
  const row = findUserRow(id);
  if (!row) return undefined;
  return { id: row.id, name: row.displayName };
}
