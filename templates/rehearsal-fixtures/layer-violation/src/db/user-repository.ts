// FIXTURE (deliberately broken): rehearse against `harness check-arch`.
// db layer — persistence only. See ../../rehearsal.json.

export interface UserRow {
  id: string;
  displayName: string;
}

const ROWS: Record<string, UserRow> = {
  u1: { id: 'u1', displayName: 'Ada Lovelace' },
};

export function findUserRow(id: string): UserRow | undefined {
  return ROWS[id];
}
