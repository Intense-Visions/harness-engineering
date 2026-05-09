import { describe, it } from 'vitest';

const E2E_ENABLED = process.env.HARNESS_E2E_GITHUB === '1';
const repo = process.env.HARNESS_E2E_GITHUB_REPO; // "owner/test-repo"

describe.skipIf(!E2E_ENABLED || !repo)(
  'GitHubIssuesTrackerAdapter — real-network E2E (gated)',
  () => {
    it('TODO(phase-5): create → claim → complete on a real test repo', () => {
      // Intentionally a placeholder. Phase 5 (or a follow-up) will
      // populate this suite. Documented in the migration guide so
      // teams can run a "smoke" before adopting file-less mode.
    });
  }
);
