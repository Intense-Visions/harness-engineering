import { describe, it, expect } from 'vitest';

const E2E_ENABLED = process.env.HARNESS_E2E_GITHUB === '1';
const repo = process.env.HARNESS_E2E_GITHUB_REPO; // "owner/test-repo"

describe.skipIf(!E2E_ENABLED || !repo)(
  'GitHubIssuesTrackerAdapter — real-network E2E (gated)',
  () => {
    it('TODO(phase-5): create → claim → complete on a real test repo', () => {
      // Placeholder body fails explicitly so a caller who flips
      // HARNESS_E2E_GITHUB=1 against an unpopulated suite gets a loud
      // failure instead of a vacuous green. Phase 5 / Phase 7 follow-up
      // populates the suite.
      expect.fail('Phase 2 E2E body not implemented — see Phase 5 / Phase 7 follow-up');
    });
  }
);
