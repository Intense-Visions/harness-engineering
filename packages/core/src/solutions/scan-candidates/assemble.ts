import type { ScannedCommit } from './git-scan';
import type { Hotspot } from './hotspot';
import type { IsoWeek } from './iso-week';
import { formatIsoWeek } from './iso-week';
import type { StabilityReport, RankTier } from '../../ranking';

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
  /**
   * Stability report from the two-window hotspot gate. When present, the
   * emitted ranking carries its rank correlation and both window definitions.
   */
  hotspotStability?: StabilityReport | undefined;
  /**
   * Tier bands for the hotspot ranking, present only when the ranking degraded
   * to tiers (unstable). When present, hotspots are grouped by tier rather than
   * presented as a precise order.
   */
  hotspotTiers?: RankTier<Hotspot>[] | undefined;
}

function stabilityLine(report: StabilityReport): string {
  const rho = report.correlation.toFixed(2);
  const mode =
    report.presentation === 'ordered'
      ? 'stable — presented as an order'
      : 'unstable — degraded to tiers';
  return (
    `_Ranking stability: ${mode}. Spearman ρ=${rho} over ${report.sampleSize} file(s) shared by ` +
    `${report.windows.primary} vs ${report.windows.secondary} (threshold ${report.correlationThreshold.toFixed(2)})._`
  );
}

function hotspotBullet(h: Hotspot, lookback: string, lines: string[]): void {
  lines.push(
    `- File \`${h.path}\` has ${h.churn} commits in ${lookback}; no docs/solutions/ entry`
  );
  lines.push('  - Suggested category: knowledge-track/architecture-patterns');
  lines.push(`  - Run: \`/harness:compound "${h.path} pattern"\``);
}

function renderUndocumentedFixes(input: AssembleInput, lines: string[]): void {
  lines.push(`## Undocumented fixes (from \`git log\` past ${input.lookback})`, '');
  if (input.undocumentedFixes.length === 0) {
    lines.push('_(none this week)_', '');
    return;
  }
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

function renderTiers(tiers: readonly RankTier<Hotspot>[], lookback: string, lines: string[]): void {
  // Unstable ranking: present tiers, not a spurious order.
  for (const tier of tiers) {
    if (tier.items.length === 0) continue;
    lines.push(`### Tier ${tier.tier}`, '');
    for (const h of tier.items) hotspotBullet(h, lookback, lines);
    lines.push('');
  }
}

function renderPatternCandidates(input: AssembleInput, lines: string[]): void {
  lines.push('## Pattern candidates (from churn + hotspot analysis)', '');
  if (input.hotspotStability) {
    lines.push(stabilityLine(input.hotspotStability), '');
  }
  const tiered = input.hotspotTiers && input.hotspotTiers.length > 0;
  if (input.hotspotCandidates.length === 0) {
    lines.push('_(none this week)_', '');
  } else if (tiered) {
    renderTiers(input.hotspotTiers!, input.lookback, lines);
  } else {
    for (const h of input.hotspotCandidates) hotspotBullet(h, input.lookback, lines);
    lines.push('');
  }
}

export function assembleCandidateReport(input: AssembleInput): string {
  const week = formatIsoWeek(input.isoWeek);
  const lines: string[] = [];
  lines.push(`# Compound candidates — week ${week}`, '');
  renderUndocumentedFixes(input, lines);
  renderPatternCandidates(input, lines);
  return lines.join('\n');
}
