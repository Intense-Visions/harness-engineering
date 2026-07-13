import type { SecurityScanner } from '@harness-engineering/core';
import type { OutcomeVerdict } from '@harness-engineering/intelligence';

/**
 * AMR 4c: a single-agent quality-verdict source (ADR 0069). The escalation
 * mechanism + seam are complete; this supplies the *sound* signal that was
 * missing — a BASELINE-RELATIVE scan of the diff the agent introduced. Only the
 * ADDED lines are scanned, so a pre-existing pattern never counts against the
 * agent. This is sound (not approximate) because every security rule is
 * single-line, so per-added-line matching yields exactly the introduced findings.
 */

/** One hunk of added lines from a unified diff, with its true start line. */
export interface IntroducedHunk {
  /** Repo-relative path of the changed file. */
  file: string;
  /** The added lines (leading `+` stripped), joined with `\n`. */
  addedContent: string;
  /** New-file line number the first added line sits at (for accurate findings). */
  startLine: number;
}

/** True iff `file` is at or under one of the excluded path prefixes. */
function isExcluded(file: string, excludePaths: string[]): boolean {
  return excludePaths.some((p) => {
    const prefix = p.endsWith('/') ? p : `${p}/`;
    return file === p || file.startsWith(prefix);
  });
}

/**
 * Parse a `git diff --unified=0` unified diff into per-hunk ADDED lines. Files
 * under `excludePaths` (the seeded handoff overlay — not the agent's work) are
 * dropped. Pure; no git, no I/O — unit-testable with a synthetic diff.
 */
export function parseIntroducedHunks(rawDiff: string, excludePaths: string[]): IntroducedHunk[] {
  const hunks: IntroducedHunk[] = [];
  let file: string | null = null;
  let startLine = 1;
  let added: string[] = [];
  // `+++ `/`--- ` are file headers ONLY in a file's pre-hunk region; once inside a
  // hunk, a line rendered as `+++ x` is an ADDED line whose content is `++ x`
  // (git prefixes added lines with `+`). Track hunk state so an added source line
  // that looks like a header is never misread as one. `diff --git` starts a new file.
  let inHunk = false;

  const flush = (): void => {
    if (file !== null && added.length > 0 && !isExcluded(file, excludePaths)) {
      hunks.push({ file, addedContent: added.join('\n'), startLine });
    }
    added = [];
  };

  for (const line of rawDiff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flush();
      inHunk = false;
      file = null;
      continue;
    }
    if (line.startsWith('@@')) {
      flush();
      // @@ -a[,b] +c[,d] @@ → c is the new-file start line.
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
      startLine = m ? Number(m[1]) : 1;
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      // File-header region: parse the new-file path, skip the old-file header.
      if (line.startsWith('+++ ')) {
        const p = line.slice(4).trim();
        file = p === '/dev/null' ? null : p.replace(/^b\//, '');
      }
      // `--- ` and other metadata (index, mode, Binary files …) ignored.
      continue;
    }
    // Inside a hunk: collect added lines (strip the single `+`). With
    // --unified=0 there are no context lines; removed (`-`) lines are ignored.
    if (line.startsWith('+')) added.push(line.slice(1));
  }
  flush();
  return hunks;
}

/**
 * True iff the agent introduced an ERROR-severity security finding on an added
 * line. Error-severity only (injection, hardcoded secrets, command injection,
 * …) so warnings never escalate — a conservative, sound quality-fail signal.
 * The scanner is expected to be pre-`configureForProject`'d for the worktree.
 */
export function hasIntroducedSecurityDefect(
  hunks: IntroducedHunk[],
  scanner: SecurityScanner
): boolean {
  for (const h of hunks) {
    const findings = scanner.scanFileContent(h.addedContent, h.file, h.startLine);
    if (findings.some((f) => f.severity === 'error')) return true;
  }
  return false;
}

/**
 * AMR 4c v2: map an outcome-eval spec-satisfaction verdict to the single-agent
 * escalation quality class. Only a BLOCKING verdict escalates — `authority` is
 * TS-derived (`deriveAuthority`) as `'blocking'` iff a high-confidence
 * NOT_SATISFIED, so SATISFIED / INCONCLUSIVE / any lower-confidence verdict
 * maps to `undefined` (neutral) and never a premature `quality-pass`. Trusting the
 * TS-derived `authority` (not the raw verdict/confidence) keeps the blocking rule
 * in one place and immune to an LLM-injected `authority` (the evaluator strips it
 * at a `.strict()` parse boundary).
 */
export function outcomeVerdictToQualityFail(verdict: OutcomeVerdict): 'quality-fail' | undefined {
  return verdict.authority === 'blocking' ? 'quality-fail' : undefined;
}
