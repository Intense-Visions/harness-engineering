import type { ProjectContext, StrengthFinding, StrengthRule } from '../types';

/**
 * STRENGTH-006 — auto-approved baseline PR.
 *
 * A workflow that auto-approves or auto-merges a PR using a PAT/token, with no
 * independent-review gate, lets the bot rubber-stamp its own changes (e.g. an
 * auto-generated baseline bump) — defeating code review.
 *
 * Implementation note: this matches RAW workflow text with regexes (no YAML
 * dependency), consistent with the SecurityScanner regex-rule precedent and the
 * spec's YAGNI stance. Caveat: a review gate located in a SEPARATE job may cause a
 * false positive; documented as a known v1 limitation (revisit in dogfood).
 */

const AUTO_PATTERN = /auto-?approve|auto-?merge|--auto\b|enable-pull-request-automerge/i;
// Lines that are NOT real auto-approve/merge steps even when they match
// AUTO_PATTERN. We must still catch auto commands living inside a `run: |` shell
// block (each on its own shell line, e.g. `gh pr merge --auto`), so we do NOT
// require the match to sit on a `uses:`/`run:`/`with:` directive. Instead we
// exclude the two original false-positive sources:
//   - a YAML/shell comment line (e.g. `# once auto-merge is wired up`)
//   - a job/step `name:` value (e.g. `name: auto-approve baseline`)
const COMMENT_LINE = /^\s*#/;
const NAME_VALUE_LINE = /^\s*(?:-\s*)?name\s*:/i;
// A PAT/token reference, EXCLUDING the default `GITHUB_TOKEN` (which is scoped
// to the workflow and is not a personal access token).
const PAT_GATING = /secrets\.(?!GITHUB_TOKEN\b)\w*(?:PAT|TOKEN)\w*/;
// A real review mechanism — a configured approval gate or a workflow trigger
// that is conditioned on a submitted human review. Keys on STRUCTURED signals,
// NOT arbitrary comment text (so a comment like `# once review is approved`
// cannot suppress a finding). Note: an auto-approve action's own name contains
// "approve", so we deliberately do not treat bare `uses:` lines as review gates.
const REVIEW_SIGNAL =
  /required_reviewers|approvals?\s*:\s*[1-9]|CODEOWNERS|github\.event\.review\.state\s*==\s*['"]approved['"]/i;

/**
 * True when a line carries an actual auto-approve/merge command: it matches
 * AUTO_PATTERN and is neither a comment line nor a YAML `name:` value (the two
 * known false-positive sources). This catches auto commands both on step
 * directives (`run: gh pr merge --auto`) and on shell lines inside a `run: |`
 * block.
 */
function isAutoLine(line: string): boolean {
  return AUTO_PATTERN.test(line) && !COMMENT_LINE.test(line) && !NAME_VALUE_LINE.test(line);
}

/**
 * True when any line in the workflow carries a real auto-approve/merge command.
 */
function hasAutoStep(text: string): boolean {
  return text.split('\n').some(isAutoLine);
}

export const strength006AutoapproveBaseline: StrengthRule = {
  id: 'STRENGTH-006',
  gearPiece: 'review-gate',
  defaultSeverity: 'error',
  appliesIn: () => true,
  evaluable: (ctx) => ctx.workflows.length > 0,
  detect(ctx: ProjectContext): Omit<StrengthFinding, 'severity'>[] {
    const findings: Omit<StrengthFinding, 'severity'>[] = [];
    for (const wf of ctx.workflows) {
      const hasAuto = hasAutoStep(wf.text);
      const hasPat = PAT_GATING.test(wf.text);
      const hasReview = REVIEW_SIGNAL.test(wf.text);
      if (hasAuto && hasPat && !hasReview) {
        const lines = wf.text.split('\n');
        const idx = lines.findIndex(isAutoLine);
        findings.push({
          id: 'STRENGTH-006',
          gearPiece: 'review-gate',
          file: wf.path,
          ...(idx >= 0 ? { line: idx + 1 } : {}),
          message:
            'Workflow auto-approves/auto-merges a PR using a token with no independent-review gate — the bot can rubber-stamp its own changes.',
          remediation:
            'Gate auto-merge behind a human review (e.g. require an approved review, required_reviewers, or CODEOWNERS) instead of a PAT alone.',
        });
      }
    }
    return findings;
  },
};
