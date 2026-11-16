#!/usr/bin/env node
// Union-merge architecture timelines (`.harness/arch/timeline.json`) for the
// Architecture Snapshot workflow's PR fallback (#2266).
//
//   node scripts/merge-arch-timeline.mjs <out> <input> [<input>...]
//
// Every input is a timeline file (`{ version: 1, snapshots: [...] }`); a missing
// or empty input is skipped, so callers can pass `git show <ref>:<path>` dumps
// for refs that may not carry the file yet. The output carries every distinct
// snapshot from every input — keyed by `capturedAt` + `commitHash`, which is
// unique per capture — sorted chronologically, in the same
// `JSON.stringify(t, null, 2)` shape TimelineManager.save() writes.
//
// Why a union and not "ours wins": the snapshot workflow used to copy its own
// capture over the base. That is only safe when the capture is a superset of
// every other copy of the series. It is not once an unmerged snapshot PR exists:
// that PR's branch carries points main lacks, and a fresh capture (taken from
// main) lacks them too. Copying either side over the other silently DROPS
// points; a union keeps every week. Pure, deterministic and idempotent:
// merging a timeline with itself yields the same file.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function mergeTimelines(timelines) {
  const byKey = new Map();
  for (const t of timelines) {
    if (!t || !Array.isArray(t.snapshots)) continue;
    for (const s of t.snapshots) {
      if (!s || typeof s.capturedAt !== 'string') continue;
      const key = `${s.capturedAt}\u0000${s.commitHash ?? ''}`;
      if (!byKey.has(key)) byKey.set(key, s);
    }
  }
  const snapshots = [...byKey.values()].sort((a, b) =>
    a.capturedAt < b.capturedAt ? -1 : a.capturedAt > b.capturedAt ? 1 : 0
  );
  return { version: 1, snapshots };
}

function readTimeline(file) {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, 'utf8');
  if (raw.trim() === '') return null;
  // A corrupt input is a hard error, never a silent skip: skipping it would
  // emit a timeline that quietly lost that input's points.
  return JSON.parse(raw);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const [out, ...inputs] = process.argv.slice(2);
  if (!out || inputs.length === 0) {
    console.error('usage: merge-arch-timeline.mjs <out> <input> [<input>...]');
    process.exit(2);
  }
  const merged = mergeTimelines(inputs.map(readTimeline));
  writeFileSync(out, JSON.stringify(merged, null, 2));
  console.log(
    `Merged ${inputs.length} timeline(s) into ${out}: ${merged.snapshots.length} point(s).`
  );
}
