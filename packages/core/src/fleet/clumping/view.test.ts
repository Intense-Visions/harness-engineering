// THE PROPERTY: the clump set a seam SERIALIZES must not re-serialize the
// records it grouped.
//
// Stated before any encoding, because the encoding is what made this a defect:
// `ClumpableItem.ref` is an opaque passthrough to the seam's native record, the
// craft MCP tools emit `JSON.stringify(result, null, 2)` over an object that
// carries a `ClumpResult`, and conservation puts every item in EXACTLY ONE
// bucket — so every record crossed the wire twice, once under `findings` and
// once inside the clump that grouped it. Measured on the spec's worked example
// (28 findings, 4 peer files, 7 clumps of 4): 21,496 -> 63,930 bytes, 2.97x.
//
// So: no `ref` on the wire is the property, the surviving conservation law is
// what proves nothing was dropped in the process, and the `ClumpResult` that
// still carries `ref` is the positive control — without it, "no ref on the
// wire" is also true of a projection that returns an empty object.

import { describe, expect, it } from 'vitest';

import { formClumps } from './form';
import type { ClumpableItem } from './types';
import { toClumpView } from './view';

/** Two kinds over one scope, each on distinct files, plus one sub-floor item. */
function items(): ClumpableItem[] {
  const out: ClumpableItem[] = [];
  for (const kind of ['CODE', 'NAME']) {
    for (let i = 0; i < 3; i += 1) {
      out.push({
        id: `${kind}-R001:src/a${i}.ts:${10 + i}#0`,
        scope: 'src',
        kind,
        grade: { kind: 'axes', tier: 'foundational', impact: 'large', confidence: 'high' },
        weight: 1045,
        conflictKeys: [`src/a${i}.ts`],
        ref: { secret: 'THE WHOLE NATIVE RECORD', message: 'x'.repeat(200) },
      });
    }
  }
  out.push({
    id: 'CODE-R009:src/z.ts:1#0',
    scope: 'src',
    kind: 'CODE',
    grade: { kind: 'axes', tier: 'aspirational', impact: 'small', confidence: 'low' },
    weight: 11,
    conflictKeys: ['src/z.ts'],
    ref: { secret: 'THE WHOLE NATIVE RECORD' },
  });
  return out;
}

describe('toClumpView — what crosses the wire', () => {
  it('carries NO native record anywhere, in any bucket', () => {
    const result = formClumps(items());
    const wire = JSON.stringify(toClumpView(result));
    expect(wire).not.toContain('THE WHOLE NATIVE RECORD');
    expect(wire).not.toContain('"ref"');
    // POSITIVE CONTROL: the in-process result DOES carry it, so the assertion
    // above is about the projection and not about a fixture with no refs.
    expect(JSON.stringify(result)).toContain('THE WHOLE NATIVE RECORD');
  });

  it('keeps the member ids, in clump order', () => {
    const result = formClumps(items());
    const view = toClumpView(result);
    expect(view.clumps).toHaveLength(result.clumps.length);
    for (const [i, clump] of result.clumps.entries()) {
      expect(view.clumps[i]!.id).toBe(clump.id);
      expect(view.clumps[i]!.members.map((m) => m.id)).toEqual(clump.members.map((m) => m.id));
    }
  });

  it('keeps the conservation law CHECKABLE from the view alone', () => {
    // The view is the only form most consumers ever see, so a partition that is
    // only verifiable in-process is not verifiable at all. Counted off the view
    // ITSELF rather than copied from `counts`, so a projection that dropped a
    // bucket while copying the tally cannot pass.
    const result = formClumps(items());
    const view = toClumpView(result);
    const clumped = view.clumps.reduce((n, c) => n + c.members.length, 0);
    const sum =
      clumped + view.floored.length + view.overCap.length + view.ungraded.length + view.solo.length;
    expect(sum).toBe(view.counts.input);
    expect(view.counts.input).toBe(items().length);
    // …and the sub-floor item kept BOTH halves of its verdict, which is the
    // part a bare id array would have silently dropped.
    expect(view.floored).toHaveLength(1);
    expect(view.floored[0]!.id).toBe('CODE-R009:src/z.ts:1#0');
    expect(view.floored[0]!.resolution).toBe('file');
    expect(view.floored[0]!.reason).toMatch(/small impact/);
  });

  it('measures smaller than the result it projects, on a payload that has refs', () => {
    // The whole reason the projection exists. Not a tautology: a projection
    // that kept every item field but dropped `ref` also satisfies "no ref on
    // the wire" and measured 1.78x on the worked example, against 1.28x here.
    const result = formClumps(items());
    expect(JSON.stringify(toClumpView(result)).length).toBeLessThan(
      JSON.stringify(result).length / 2
    );
  });
});
