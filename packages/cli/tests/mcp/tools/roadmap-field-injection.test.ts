/**
 * `manage_roadmap` refuses field values that would inject lines into the
 * roadmap markdown (#2623).
 *
 * The roadmap is line-oriented (`### <name>`, then one `- **Field:** value`
 * bullet per line), so a value carrying a line break used to be written as a NEW
 * line: `plans: ['x\n- **Status:** done']` flipped a planned row to done, and a
 * heading-shaped name made every later read fail. JS `^`/`$` under the `m` flag
 * also break on U+2028 / U+2029, which the summary codec does not escape.
 *
 * Each attempt must be refused with an error naming the field, and NOTHING may be
 * written — in both storage layouts. Ordinary values (including a multi-line
 * summary, which the summary codec supports) must still write and read back.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseRoadmap,
  roadmapToShards,
  serializeShard,
  serializeMeta,
} from '@harness-engineering/core';
import { handleManageRoadmap } from '../../../src/mcp/tools/roadmap';
import * as autoSync from '../../../src/mcp/tools/roadmap-auto-sync';

const FIXTURE = `---
project: test-project
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Project Roadmap

## Milestone: MVP Release

### Feature: Target Row
- **Status:** planned
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** The row an attacker tries to flip
`;

const FORGED = '- **Status:** done';

type Layout = 'monolith' | 'sharded';

let dir: string;

function setup(layout: Layout): void {
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  if (layout === 'monolith') {
    fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), FIXTURE, 'utf-8');
    return;
  }
  const parsed = parseRoadmap(FIXTURE);
  if (!parsed.ok) throw parsed.error;
  const { shards, meta } = roadmapToShards(parsed.value);
  const d = path.join(dir, 'docs', 'roadmap.d');
  fs.mkdirSync(d, { recursive: true });
  for (const shard of shards) {
    fs.writeFileSync(path.join(d, `${shard.slug}.md`), serializeShard(shard), 'utf-8');
  }
  fs.writeFileSync(path.join(d, '_meta.md'), serializeMeta(meta), 'utf-8');
}

/** Every file under docs/, keyed by posix-relative path, for a nothing-written check. */
function snapshotDocs(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (abs: string, rel: string): void => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const a = path.join(abs, entry.name);
      const r = rel ? path.posix.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) walk(a, r);
      else out[r] = fs.readFileSync(a, 'utf-8');
    }
  };
  walk(path.join(dir, 'docs'), '');
  return out;
}

async function readFeatures(): Promise<Array<Record<string, unknown>>> {
  const res = await handleManageRoadmap({ path: dir, action: 'show' });
  expect(res.isError ? res.content[0].text : null).toBeNull();
  const parsed = JSON.parse(res.content[0].text);
  return parsed.milestones.flatMap((m: { features: Array<Record<string, unknown>> }) => m.features);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-injection-'));
  vi.spyOn(autoSync, 'triggerExternalSync').mockResolvedValue(undefined);
  vi.spyOn(autoSync, 'triggerScopedExternalSync').mockResolvedValue({ kind: 'not-configured' });
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const UPDATE_ATTEMPTS: Array<[string, Record<string, unknown>, string]> = [
  ['plans LF', { plans: [`docs/p.md\n${FORGED}`] }, 'plans[0]'],
  ['blocked_by LF', { blocked_by: [`Other\n${FORGED}`] }, 'blockedBy[0]'],
  ['spec LF', { spec: `docs/s.md\n${FORGED}` }, 'spec'],
  ['assignee LF', { assignee: `alice\n${FORGED}` }, 'assignee'],
  ['spec CR', { spec: `docs/s.md\r${FORGED}` }, 'spec'],
  ['plans U+2028', { plans: [`docs/p.md\u2028${FORGED}`] }, 'plans[0]'],
  ['summary U+2028', { summary: `x\u2028${FORGED}` }, 'summary'],
  ['summary U+2029', { summary: `x\u2029${FORGED}` }, 'summary'],
  // Not a line break, so the serializer would emit it; the API boundary refuses
  // every control character no roadmap field has a use for.
  ['assignee ESC', { assignee: 'alice\u001b[31m' }, 'assignee'],
];

const ADD_ATTEMPTS: Array<[string, Record<string, unknown>, string]> = [
  ['feature name LF', { feature: `New Row\n${FORGED}` }, 'name'],
  ['feature name heading', { feature: 'New Row\n### Evil' }, 'name'],
  ['summary U+2028', { summary: `x\u2028${FORGED}` }, 'summary'],
  ['plans LF', { plans: [`docs/p.md\n${FORGED}`] }, 'plans[0]'],
];

describe.each<Layout>(['monolith', 'sharded'])('manage_roadmap field injection (%s)', (layout) => {
  beforeEach(() => setup(layout));

  it.each(UPDATE_ATTEMPTS)('update refuses %s and writes nothing', async (_l, fields, label) => {
    const before = snapshotDocs();
    const res = await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'Target Row',
      ...fields,
    } as never);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain(`"${label}"`);
    expect(res.content[0].text).toContain('nothing written');
    expect(snapshotDocs()).toEqual(before);
    const target = (await readFeatures()).find((f) => f.name === 'Target Row');
    expect(target?.status).toBe('planned');
  });

  it.each(ADD_ATTEMPTS)('add refuses %s and writes nothing', async (_l, fields, label) => {
    const before = snapshotDocs();
    const res = await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'New Row',
      milestone: 'MVP Release',
      status: 'planned',
      summary: 'ok',
      ...fields,
    } as never);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain(`"${label}"`);
    expect(res.content[0].text).toContain('nothing written');
    expect(snapshotDocs()).toEqual(before);
    expect((await readFeatures()).map((f) => f.name)).toEqual(['Target Row']);
  });

  it('positive control: ordinary values and a multi-line summary still write and read back', async () => {
    const add = await handleManageRoadmap({
      path: dir,
      action: 'add',
      feature: 'Billing, phase 2',
      milestone: 'MVP Release',
      status: 'planned',
      summary: 'line one\nline two\twith tab',
      plans: ['docs/plans/billing.md'],
      blocked_by: ['Target Row'],
    });
    expect(add.isError ? add.content[0].text : null).toBeNull();
    const upd = await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'Target Row',
      summary: 'updated\r\nsummary',
      spec: 'docs/changes/target/proposal.md',
    });
    expect(upd.content[0].text && upd.isError ? upd.content[0].text : null).toBeNull();

    const features = await readFeatures();
    const billing = features.find((f) => f.name === 'Billing, phase 2');
    expect(billing).toMatchObject({
      status: 'planned',
      summary: 'line one\nline two\twith tab',
      plans: ['docs/plans/billing.md'],
      blockedBy: ['Target Row'],
    });
    const target = features.find((f) => f.name === 'Target Row');
    expect(target).toMatchObject({
      status: 'planned',
      summary: 'updated\r\nsummary',
      spec: 'docs/changes/target/proposal.md',
    });
  });
});
