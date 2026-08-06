// FIXTURE (deliberately broken): rehearse against `harness check-arch`.
// ui layer — may depend on the SERVICE layer only. See ../../rehearsal.json.

// PLANTED DEFECT: the ui layer imports the db layer directly, skipping the
// service boundary. The correct import is `../service/user-service`.
import { findUserRow } from '../db/user-repository';

export function renderUserCard(id: string): string {
  const row = findUserRow(id);
  if (!row) return '<div class="user-card user-card--missing">Unknown user</div>';
  return `<div class="user-card">${row.displayName}</div>`;
}
