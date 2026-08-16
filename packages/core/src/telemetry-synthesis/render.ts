/**
 * Aggregate-telemetry synthesis — Markdown renderer (#563).
 *
 * Renders a `TelemetrySynthesis` as one unified report: a headline block, one
 * section per PRESENT source (reusing familiar per-surface table shapes), and
 * an explicit "Sources with no data" footer listing every absent source. No
 * section is ever silently dropped — an absent source is footered, never hidden.
 *
 * Spec: docs/changes/aggregate-telemetry-synthesis/proposal.md
 */
import type {
  TelemetrySynthesis,
  TelemetrySynthesisSection,
  SynthesisSection,
} from '@harness-engineering/types';
import { TELEMETRY_SYNTHESIS_SECTIONS } from '@harness-engineering/types';

/** Human-readable label per section, for headings and the footer. */
const SECTION_LABELS: Record<TelemetrySynthesisSection, string> = {
  adoption: 'Skill adoption',
  effectiveness: 'Skill effectiveness',
  usage: 'Usage & cost',
  insights: 'Code-health insights',
  outcomes: 'Execution outcomes',
};

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function formatUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function formatBool(value: boolean | null): string {
  if (value === null) return 'n/a';
  return value ? 'pass' : 'fail';
}

function orNa(value: number | null, render: (v: number) => string = String): string {
  return value == null ? 'n/a' : render(value);
}

/** The headline block — cross-source figures, each honestly `n/a` when absent. */
function renderHeadline(synthesis: TelemetrySynthesis): string {
  const h = synthesis.headline;
  const windowLabel =
    synthesis.windowDays == null ? 'all-time' : `trailing ${synthesis.windowDays} days`;
  const lines = [
    '## Headline',
    '',
    `- **Generated:** ${synthesis.generatedAt}`,
    `- **Window:** ${windowLabel}`,
    `- **Skill invocations:** ${orNa(h.totalSkillInvocations)}`,
    `- **Skill success rate:** ${orNa(h.skillSuccessRate, formatRate)}`,
    `- **Outcome satisfied rate:** ${orNa(h.outcomeSatisfiedRate, formatRate)}`,
    `- **Total cost:** ${orNa(h.totalCostUsd, formatUsd)}`,
    `- **Structural health:** ${formatBool(h.healthPassed)}`,
  ];
  return lines.join('\n');
}

/** A heading + Markdown table (or an italic empty note when there are no rows). */
function table(heading: string, columns: string[], rows: string[][], emptyNote: string): string {
  const out = [`### ${heading}`, ''];
  if (rows.length === 0) {
    out.push(`_${emptyNote}_`);
  } else {
    out.push(`| ${columns.join(' | ')} |`);
    out.push(`| ${columns.map(() => '---').join(' | ')} |`);
    out.push(...rows.map((cells) => `| ${cells.join(' | ')} |`));
  }
  return out.join('\n');
}

function renderAdoption(
  section: SynthesisSection<import('@harness-engineering/types').AdoptionSection>
): string {
  if (!section.present) return '';
  const header = [
    `## ${SECTION_LABELS.adoption}`,
    '',
    `${section.totalInvocations} invocation(s) across ${section.distinctSkills} skill(s) · success rate ${formatRate(section.successRate)}`,
    '',
    table(
      'Top skills by invocations',
      ['Skill', 'Invocations', 'Success', 'Last used'],
      section.topSkills.map((s) => [
        `\`${s.skill}\``,
        `${s.invocations}`,
        formatRate(s.successRate),
        s.lastUsed.slice(0, 10),
      ]),
      'No skill invocations recorded.'
    ),
  ];
  return header.join('\n');
}

function renderEffectiveness(
  section: SynthesisSection<import('@harness-engineering/types').EffectivenessSection>
): string {
  if (!section.present) return '';
  return [
    `## ${SECTION_LABELS.effectiveness}`,
    '',
    'Laplace-smoothed success rate (α = 1) — a skill invoked once cannot claim 0% or 100%.',
    '',
    table(
      'Least effective skills',
      ['Skill', 'Invocations', 'Completed', 'Failed', 'Abandoned', 'Smoothed success rate'],
      section.leastEffective.map((s) => [
        `\`${s.skill}\``,
        `${s.invocations}`,
        `${s.completed}`,
        `${s.failed}`,
        `${s.abandonedMidWorkflow}`,
        formatRate(s.successRate),
      ]),
      'No skill telemetry to score.'
    ),
    '',
    table(
      'Failing skills',
      ['Skill', 'Invocations', 'Failed', 'Failure rate'],
      section.failing.map((s) => [
        `\`${s.skill}\``,
        `${s.invocations}`,
        `${s.failed}`,
        formatRate(s.failureRate),
      ]),
      'No skill meets the failing-rate threshold.'
    ),
    '',
    table(
      'Abandoned mid-workflow',
      ['Skill', 'Invocations', 'Abandoned', 'Abandonment rate'],
      section.abandoned.map((s) => [
        `\`${s.skill}\``,
        `${s.invocations}`,
        `${s.abandonedMidWorkflow}`,
        formatRate(s.abandonmentRate),
      ]),
      'No skill meets the abandonment-rate threshold.'
    ),
  ].join('\n');
}

function renderUsage(
  section: SynthesisSection<import('@harness-engineering/types').UsageSection>
): string {
  if (!section.present) return '';
  const cost =
    section.totalCostMicroUSD == null
      ? 'unknown (missing pricing)'
      : formatUsd(section.totalCostMicroUSD / 1_000_000);
  return [
    `## ${SECTION_LABELS.usage}`,
    '',
    `- **Total cost:** ${cost}`,
    `- **Total tokens:** ${section.totalTokens}`,
    `- **Active days:** ${section.activeDays}`,
    `- **Sessions:** ${section.sessionCount}`,
  ].join('\n');
}

function renderInsights(
  section: SynthesisSection<import('@harness-engineering/types').InsightsSection>
): string {
  if (!section.present) return '';
  const lines = [
    `## ${SECTION_LABELS.insights}`,
    '',
    `- **Structural health:** ${formatBool(section.healthPassed)}${section.healthSummary ? ` — ${section.healthSummary}` : ''}`,
    `- **Drift findings:** ${orNa(section.driftCount)}`,
    `- **Dead files:** ${orNa(section.deadFiles)}`,
    `- **Dead exports:** ${orNa(section.deadExports)}`,
  ];
  if (section.warnings.length > 0) {
    lines.push('', '_Warnings:_ ' + section.warnings.map((w) => `\`${w}\``).join(', '));
  }
  return lines.join('\n');
}

function renderOutcomes(
  section: SynthesisSection<import('@harness-engineering/types').OutcomeSection>
): string {
  if (!section.present) return '';
  return [
    `## ${SECTION_LABELS.outcomes}`,
    '',
    `- **Satisfied:** ${section.satisfied}`,
    `- **Not satisfied:** ${section.notSatisfied}`,
    `- **Inconclusive:** ${section.inconclusive}`,
    `- **Satisfied rate:** ${orNa(section.satisfiedRate, formatRate)} (${section.total} outcome node(s))`,
  ].join('\n');
}

/** The "Sources with no data" footer — every absent source, with its reason. */
function renderAbsentFooter(synthesis: TelemetrySynthesis): string {
  const absent = TELEMETRY_SYNTHESIS_SECTIONS.filter((key) => !synthesis.sources[key].present);
  if (absent.length === 0) return '';
  const rows = absent.map((key) => {
    const section = synthesis.sources[key];
    const reason = section.present ? '' : section.reason;
    return `- **${SECTION_LABELS[key]}:** ${reason}`;
  });
  return ['## Sources with no data', '', ...rows].join('\n');
}

/** Render a full synthesis report as Markdown. */
export function renderSynthesisMarkdown(synthesis: TelemetrySynthesis): string {
  const sections = [
    '# Telemetry Synthesis',
    renderHeadline(synthesis),
    renderAdoption(synthesis.sources.adoption),
    renderEffectiveness(synthesis.sources.effectiveness),
    renderUsage(synthesis.sources.usage),
    renderInsights(synthesis.sources.insights),
    renderOutcomes(synthesis.sources.outcomes),
    renderAbsentFooter(synthesis),
  ].filter((s) => s.length > 0);
  return sections.join('\n\n').trimEnd() + '\n';
}
