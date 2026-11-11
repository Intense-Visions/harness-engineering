// packages/core/src/fleet/clumping/form.ts
//
// Formation: N like findings become ONE work item rather than N
// (docs/changes/clumping/proposal.md, "Formation").
//
// Pure — no fs, no network, no clock. `node:crypto` is used only for a
// deterministic content hash, matching core/src/security/security-timeline-types.ts.
//
// Order of operations, and why each step sits where it does:
//   0. Reject duplicate ids. Silently collapsing two items is exactly the silent
//      drop this control exists to prevent.
//   1. Grade. Ungraded leaves to its own TERMINAL bucket (D8 — never floored, never
//      guessed); sub-floor items leave with a resolution. Flooring FIRST means the
//      cap is never spent on items that were never going to be filed.
//   2. Group survivors by (scope, kind).
//   3. Split on conflict — greedy graph coloring, deterministic via the tiebreak.
//   4. Split on size.
//   5. Solo rule — a one-member clump is an item wearing extra ceremony.
//   6. Rank and cap EMITTED WORK UNITS (clumps + solos), never findings (D9).
//   7. Count every bucket (D5).

import { createHash } from 'node:crypto';

import { resolveClumpPolicy, resolveFloor } from './floor';
import type {
  Clump,
  ClumpCounts,
  ClumpPolicy,
  ClumpResult,
  ClumpableItem,
  FloorContext,
  FlooredItem,
} from './types';

/** Weight desc, tiebreak id asc. The tiebreak is what makes formation deterministic. */
function byWeightDescIdAsc(a: ClumpableItem, b: ClumpableItem): number {
  if (b.weight !== a.weight) return b.weight - a.weight;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** ` ` cannot appear in a scope or kind, so the key is unambiguous. */
function groupKey(scope: string, kind: string): string {
  return `${scope} ${kind}`;
}

/**
 * Greedy graph coloring: members in weight-desc order, each placed in the FIRST
 * sub-clump whose key set is disjoint from its own, else a new one. Greedy is
 * sufficient here and, with the id tiebreak upstream, deterministic. An item with
 * no conflict keys is vacuously disjoint and joins the first sub-clump.
 */
function splitOnConflict(ordered: readonly ClumpableItem[]): ClumpableItem[][] {
  const subs: Array<{ members: ClumpableItem[]; keys: Set<string> }> = [];
  for (const item of ordered) {
    const target = subs.find((sub) => item.conflictKeys.every((k) => !sub.keys.has(k)));
    if (target) {
      target.members.push(item);
      for (const k of item.conflictKeys) target.keys.add(k);
    } else {
      subs.push({ members: [item], keys: new Set(item.conflictKeys) });
    }
  }
  return subs.map((sub) => sub.members);
}

function buildClump(members: readonly ClumpableItem[]): Clump {
  const head = members[0]!;
  // Hash over SORTED ids so the id is stable no matter how members were ordered.
  const sortedIds = members
    .map((m) => m.id)
    .slice()
    .sort();
  const digest = createHash('sha256')
    .update(`${head.scope}|${head.kind}|${sortedIds.join(',')}`)
    .digest('hex')
    .slice(0, 16);
  return {
    id: `clump-${digest}`,
    scope: head.scope,
    kind: head.kind,
    members: [...members],
    weight: members.reduce((max, m) => (m.weight > max ? m.weight : max), -Infinity),
    conflictKeys: [...new Set(members.flatMap((m) => [...m.conflictKeys]))].sort(),
  };
}

/** Form clumps. `ctx.touched` is what lets a sub-floor item resolve to `'act'` (D4). */
export function formClumps(
  items: readonly ClumpableItem[],
  policy?: Partial<ClumpPolicy>,
  ctx: FloorContext = {}
): ClumpResult {
  const resolved = resolveClumpPolicy(policy);

  // 0. Duplicate ids: reject loudly.
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new Error(
        `formClumps: duplicate ClumpableItem id ${JSON.stringify(item.id)} — refusing to collapse two distinct items into one`
      );
    }
    seen.add(item.id);
  }

  // 1. Grade.
  const ungraded: ClumpableItem[] = [];
  const floored: FlooredItem[] = [];
  const survivors: ClumpableItem[] = [];
  for (const item of items) {
    if (item.grade.kind === 'ungraded') {
      ungraded.push(item);
      continue;
    }
    const verdict = resolveFloor(item, ctx, resolved);
    if (verdict.below) {
      floored.push({ item, resolution: verdict.resolution, reason: verdict.reason });
      continue;
    }
    survivors.push(item);
  }

  // 2. Group. Keys are sorted so output is independent of input ORDER, not just
  //    stable for identical input.
  const groups = new Map<string, ClumpableItem[]>();
  for (const item of survivors) {
    const key = groupKey(item.scope, item.kind);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  // 3-5.
  let conflictSplits = 0;
  const clumps: Clump[] = [];
  const solo: ClumpableItem[] = [];
  for (const key of [...groups.keys()].sort()) {
    const ordered = [...groups.get(key)!].sort(byWeightDescIdAsc);
    const subs = splitOnConflict(ordered);
    if (subs.length > 1) conflictSplits += subs.length - 1;
    for (const sub of subs) {
      // NOTE: the helper is `chunkBy`, not `chunk`. `for (const chunk of chunk(...))`
      // puts the loop binding in TDZ across the loop HEAD and throws a
      // ReferenceError at the first iteration — do not "simplify" the name.
      for (const part of chunkBy(sub, resolved.maxPerClump)) {
        if (part.length < resolved.minToClump) solo.push(...part);
        else clumps.push(buildClump(part));
      }
    }
  }

  // 6. Rank and cap EMITTED WORK UNITS (clumps + solos), never findings (D9) —
  //    counting findings would let the cap be bypassed by scattering.
  type Unit =
    | { readonly kind: 'clump'; readonly clump: Clump }
    | { readonly kind: 'solo'; readonly item: ClumpableItem };
  const units: Unit[] = [
    ...clumps.map((clump) => ({ kind: 'clump' as const, clump })),
    ...solo.map((item) => ({ kind: 'solo' as const, item })),
  ];
  const unitWeight = (u: Unit): number => (u.kind === 'clump' ? u.clump.weight : u.item.weight);
  const unitId = (u: Unit): string => (u.kind === 'clump' ? u.clump.id : u.item.id);
  units.sort((a, b) => {
    const delta = unitWeight(b) - unitWeight(a);
    if (delta !== 0) return delta;
    // The tiebreak is load-bearing for determinism (criterion 7): without it,
    // two equal-weight units could swap places between runs.
    const ia = unitId(a);
    const ib = unitId(b);
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });

  const cap = Math.max(0, resolved.maxClumps);
  const keptClumps: Clump[] = [];
  const keptSolo: ClumpableItem[] = [];
  // An over-cap unit is FLATTENED to its member ITEMS: `overCap` is an item bucket
  // and conservation (criterion 6) partitions ITEMS, not units. Pushing a clump here
  // as a unit would lose its members from the partition — a silent drop.
  const overCap: ClumpableItem[] = [];
  units.forEach((unit, index) => {
    const kept = index < cap;
    if (unit.kind === 'clump') {
      if (kept) keptClumps.push(unit.clump);
      else overCap.push(...unit.clump.members);
    } else if (kept) keptSolo.push(unit.item);
    else overCap.push(unit.item);
  });

  // 7. Count every bucket (D5): shed items are counted and reported, never silently
  //    discarded — a zero and a silent drop look identical in output.
  const clumped = keptClumps.reduce((n, c) => n + c.members.length, 0);
  const counts: ClumpCounts = {
    input: items.length,
    clumps: keptClumps.length,
    clumped,
    floored: floored.length,
    flooredAct: floored.filter((f) => f.resolution === 'act').length,
    flooredFile: floored.filter((f) => f.resolution === 'file').length,
    overCap: overCap.length,
    ungraded: ungraded.length,
    solo: keptSolo.length,
    conflictSplits,
  };
  return {
    clumps: keptClumps,
    floored,
    overCap,
    ungraded,
    solo: keptSolo,
    conflictSplits,
    counts,
  };
}

/** Fixed-size chunks. A non-positive size would loop forever, so it is a no-split. */
function chunkBy<T>(xs: readonly T[], size: number): T[][] {
  if (size <= 0) return xs.length > 0 ? [[...xs]] : [];
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
