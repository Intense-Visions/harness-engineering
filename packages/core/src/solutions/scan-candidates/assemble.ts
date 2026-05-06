import type { ScannedCommit } from './git-scan';
import type { Hotspot } from './hotspot';
import type { IsoWeek } from './iso-week';
import { formatIsoWeek } from './iso-week';

// Order matters: security ahead of database biases ambiguous co-occurrences
// (e.g. "deadlock" in a security context) toward the more critical category.
const KEYWORD_TO_CATEGORY: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(test|flaky|spec)\b/i, 'bug-track/test-failures'],
  [/\b(perf|slow|latency|throughput|timeout|deadlock|n\+1|oom)\b/i, 'bug-track/performance-issues'],
  [
    /\b(security|sqli|injection|xss|csrf|jwt|oauth|auth(?:n|z|entication)?|crypt(?:o|ographic|ography)?|encrypt(?:ion)?|decrypt(?:ion)?|password|token|session|tls|ssl)\b/i,
    'bug-track/security-issues',
  ],
  [/\b(ui|css|color|contrast|layout|render)\b/i, 'bug-track/ui-bugs'],
  [/\b(build|compile|tsc|webpack|tsup)\b/i, 'bug-track/build-errors'],
  [
    /\b(db|database|sql|postgres|mysql|query|migration|transaction|deadlock)\b/i,
    'bug-track/database-issues',
  ],
  [/\b(runtime|crash|exception|panic)\b/i, 'bug-track/runtime-errors'],
  [/\(orchestrator\)|\bintegrat|\blease\b|\brace\b|\bconcurren/i, 'bug-track/integration-issues'],
];

export function suggestCategory(subject: string): string {
  for (const [re, cat] of KEYWORD_TO_CATEGORY) if (re.test(subject)) return cat;
  return 'bug-track/logic-errors';
}

function descriptor(subject: string): string {
  // Strip the conventional-commit prefix; trim.
  return subject.replace(/^fix(\([^)]+\))?:\s*/i, '').trim();
}

export interface AssembleInput {
  undocumentedFixes: ScannedCommit[];
  hotspotCandidates: Hotspot[];
  isoWeek: IsoWeek;
  lookback: string;
}

export function assembleCandidateReport(input: AssembleInput): string {
  const week = formatIsoWeek(input.isoWeek);
  const lines: string[] = [];
  lines.push(`# Compound candidates — week ${week}`, '');
  lines.push(`## Undocumented fixes (from \`git log\` past ${input.lookback})`, '');
  if (input.undocumentedFixes.length === 0) {
    lines.push('_(none this week)_', '');
  } else {
    for (const c of input.undocumentedFixes) {
      const d = descriptor(c.subject);
      const cat = suggestCategory(c.subject);
      lines.push(
        `- **${c.subject}** (commit ${c.sha.slice(0, 7)}, ${c.filesChanged} file(s), ${c.branchIterations} related commits)`
      );
      lines.push(`  - Suggested category: ${cat}`);
      lines.push(`  - Run: \`/harness:compound "${d}"\``);
    }
    lines.push('');
  }
  lines.push('## Pattern candidates (from churn + hotspot analysis)', '');
  if (input.hotspotCandidates.length === 0) {
    lines.push('_(none this week)_', '');
  } else {
    for (const h of input.hotspotCandidates) {
      lines.push(
        `- File \`${h.path}\` has ${h.churn} commits in ${input.lookback}; no docs/solutions/ entry`
      );
      lines.push('  - Suggested category: knowledge-track/architecture-patterns');
      lines.push(`  - Run: \`/harness:compound "${h.path} pattern"\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}
