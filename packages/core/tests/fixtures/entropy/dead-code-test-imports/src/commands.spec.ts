import { runVerify } from './commands';

// This spec is the ONLY importer of runVerify. It exists purely so the
// dead-export detector has a test-file import edge to harvest. It is named
// `.spec.ts` (not `.test.ts`) so the core vitest suite does not collect it as a
// real test, while the detector's test-file matcher still recognizes it.
describe('runVerify', () => {
  it('runs', () => {
    expect(runVerify()).toBe('verify');
  });
});
