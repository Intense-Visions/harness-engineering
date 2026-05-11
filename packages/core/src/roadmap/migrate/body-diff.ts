import type { BodyMeta } from '../tracker/body-metadata';

/** Field-by-field canonical comparison. Treats null/undefined/missing as equivalent. */
export function bodyMetaMatches(a: BodyMeta, b: BodyMeta): boolean {
  return (
    eqOpt(a.spec, b.spec) &&
    eqOpt(a.plan, b.plan) &&
    eqOpt(a.priority, b.priority) &&
    eqOpt(a.milestone, b.milestone) &&
    eqList(a.blocked_by, b.blocked_by)
  );
}

function eqOpt(x: string | null | undefined, y: string | null | undefined): boolean {
  const xx = x ?? null;
  const yy = y ?? null;
  return xx === yy;
}

function eqList(x: string[] | undefined, y: string[] | undefined): boolean {
  const xx = (x ?? []).slice().sort();
  const yy = (y ?? []).slice().sort();
  if (xx.length !== yy.length) return false;
  for (let i = 0; i < xx.length; i++) if (xx[i] !== yy[i]) return false;
  return true;
}
