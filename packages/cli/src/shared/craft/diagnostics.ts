// packages/cli/src/shared/craft/diagnostics.ts
//
// Shared diagnostic surface for the craft skill family (copy / spec /
// security / naming / …). One canonical formatter — not four copies — so
// every craft summary can state WHY a result is empty.
//
// Motivation (issue #896): a craft skill can return `findings: []` for
// reasons that have nothing to do with the code being clean — no backend
// resolved (defaulted to in-session in a non-interactive context), an
// unsupported-language project (0 analyzable files), or no extractable
// signal. Without a diagnostic, "analyzed 0 items because X" is
// indistinguishable from "analyzed 200 items, 0 findings", and a user reads
// the empty result as a passing grade when no analysis actually ran.

import type { CraftLlmResolution } from './llm/provider.js';

/**
 * Human-readable label for the resolved provider/mode, including the named
 * backend when one was selected. Makes a silent in-session default visible.
 */
export function describeCraftResolution(resolution: CraftLlmResolution): string {
  if (resolution.backendName !== undefined && resolution.backendName.length > 0) {
    return `${resolution.mode} (backend "${resolution.backendName}")`;
  }
  return resolution.mode;
}

export interface CraftScanTally {
  /** Plural unit noun for what was analyzed, e.g. "files", "docs", "items". */
  unit: string;
  /** Count of units actually fed to the critique/rubric loop. */
  analyzed: number;
  /** Count of units discovered but skipped before analysis. */
  skipped: number;
  /**
   * Short reason units were skipped, or why nothing was analyzable. Shown
   * verbatim so "analyzed 0 items because X" never reads like "0 findings".
   */
  skipReason?: string;
}

export interface CraftDiagnosticInput {
  resolution: CraftLlmResolution;
  scan?: CraftScanTally;
}

/**
 * One-line diagnostic that distinguishes an empty result caused by "nothing
 * to analyze" from a clean "analyzed N, found nothing". Always names the
 * resolved provider/mode.
 */
export function formatCraftDiagnostic(input: CraftDiagnosticInput): string {
  const parts = [`provider=${describeCraftResolution(input.resolution)}`];
  const scan = input.scan;
  if (scan !== undefined) {
    if (scan.analyzed === 0 && scan.skipped === 0) {
      const reason = scan.skipReason !== undefined ? ` (${scan.skipReason})` : '';
      parts.push(`0 analyzable ${scan.unit}${reason}`);
    } else {
      const reason = scan.skipReason !== undefined ? ` — ${scan.skipReason}` : '';
      parts.push(`analyzed ${scan.analyzed} ${scan.unit}, skipped ${scan.skipped}${reason}`);
    }
  }
  return `Diagnostic: ${parts.join('; ')}`;
}
