/**
 * DRIFT-T004 suggestion — emit a precise migration suggestion for a
 * deprecated token reference. v1 never auto-applies.
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Technical Design → Suggestion implementation).
 */

import type { DriftFinding } from '../../drift/findings/finding.js';
import type { FixSuggestion } from '../findings/outcome.js';

export function emitT004Suggestion(finding: DriftFinding): FixSuggestion {
  // The finding's fix.description already includes the deprecated token
  // and any $description-derived guidance from detect-design-drift. We
  // wrap it in an action-oriented suggestion shape align consumers expect.
  return {
    description: `Migrate ${finding.evidence.snippet.trim()} away from the deprecated token. ${finding.fix.description}`,
    preview: `(suggestion only — v1 align does not auto-apply deprecated-token migration)`,
  };
}
