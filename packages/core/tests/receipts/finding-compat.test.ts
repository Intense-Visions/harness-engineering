import { describe, it, expect, expectTypeOf } from 'vitest';
import type { ReviewFinding } from '../../src/review/types/fan-out';
import type { ReceiptFinding } from '../../src/receipts/schema';

/**
 * `ReceiptFinding` (receipts/schema.ts) is declared structurally instead of as a `Pick` of
 * `ReviewFinding`, because importing review/types from the receipts module raised its dependency
 * depth. Nothing in `src/` therefore ties the two together. This file does: it is listed in
 * tsconfig.type-tests.json, so `pnpm --filter @harness-engineering/core typecheck` fails when a
 * shared field is renamed, removed or retyped on either side.
 */
type SharedKey =
  | 'id'
  | 'file'
  | 'lineRange'
  | 'severity'
  | 'title'
  | 'findingClass'
  | 'escapedFrom';

describe('ReceiptFinding stays compatible with ReviewFinding', () => {
  it('has exactly the seven shared fields', () => {
    expectTypeOf<keyof ReceiptFinding>().toEqualTypeOf<SharedKey>();
  });

  it('types each shared field as ReviewFinding does', () => {
    // Fails to compile when ReceiptFinding names a field ReviewFinding does not have, and fails
    // the equality when a field's type or optionality differs.
    expectTypeOf<Pick<ReviewFinding, keyof ReceiptFinding>>().toEqualTypeOf<ReceiptFinding>();
  });

  it('accepts a ReviewFinding where a ReceiptFinding is expected', () => {
    expectTypeOf<ReviewFinding>().toExtend<ReceiptFinding>();
    const finding: ReviewFinding = {
      id: 'bug-src/a.ts-1',
      file: 'src/a.ts',
      lineRange: [1, 2],
      domain: 'bug',
      severity: 'critical',
      title: 't',
      rationale: 'r',
      evidence: [],
      validatedBy: 'heuristic',
      findingClass: 'stale-claim',
      escapedFrom: 'plan',
    };
    const receiptFinding: ReceiptFinding = finding;
    expect(receiptFinding.title).toBe('t');
  });
});
