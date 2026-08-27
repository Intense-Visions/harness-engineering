import { Command } from 'commander';
import type { Command as CommanderCommand } from 'commander';
import {
  ALL_RULES,
  buildProvenanceReport,
  collectSolutionEnforcements,
  type ProvenanceReport,
  type RuleProvenanceInput,
} from '@harness-engineering/core';

/**
 * `harness rules provenance` — advisory rule-to-failure provenance reporter
 * (ADR 0100). Joins the typed rule registry (each rule's optional `origin`)
 * with `harness-compound` solution docs (each doc's optional `enforces:`) and
 * reports unexplained constraints and candidate dead rules.
 *
 * Advisory by design: this command NEVER exits non-zero on findings. The link
 * is metadata, not a gate — authority stays with the existing enforcement gates.
 */

export interface RulesProvenanceOptions {
  cwd?: string;
  json?: boolean;
}

export async function computeRulesProvenance(cwd: string): Promise<ProvenanceReport> {
  const rules: RuleProvenanceInput[] = ALL_RULES.map((r) => ({ id: r.id, origin: r.origin }));
  const solutions = await collectSolutionEnforcements(cwd);
  return buildProvenanceReport(rules, solutions);
}

export function formatProvenanceReport(report: ProvenanceReport): string {
  const lines: string[] = [];
  lines.push('Rule-to-failure provenance (advisory — ADR 0100)');
  lines.push(
    `  ${report.explainedRules}/${report.totalRules} rules explained · ${report.totalSolutions} solution link(s)`
  );

  if (report.unexplained.length === 0) {
    lines.push('  Unexplained constraints: none');
  } else {
    lines.push(`  Unexplained constraints (${report.unexplained.length}):`);
    for (const u of report.unexplained) {
      lines.push(`    - ${u.ruleId}: no origin, not claimed by any solution's enforces`);
    }
  }

  if (report.deadRuleCandidates.length === 0) {
    lines.push('  Candidate dead rules: none');
  } else {
    lines.push(`  Candidate dead rules (${report.deadRuleCandidates.length}):`);
    for (const d of report.deadRuleCandidates) {
      lines.push(`    - ${d.ruleId} [${d.reason}]: ${d.detail}`);
    }
  }

  return lines.join('\n') + '\n';
}

export async function runRulesProvenanceCommand(
  opts: RulesProvenanceOptions
): Promise<ProvenanceReport> {
  const cwd = opts.cwd ?? process.cwd();
  const report = await computeRulesProvenance(cwd);
  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(formatProvenanceReport(report));
  }
  return report;
}

export function createRulesProvenanceCommand(): Command {
  return new Command('provenance')
    .description(
      'Advisory report joining enforced rules to the incidents that motivated them (ADR 0100); never blocks'
    )
    .action(async (_options: unknown, cmd: CommanderCommand) => {
      // `--json` is a global program option (index.ts), read via optsWithGlobals.
      const json = cmd.optsWithGlobals().json === true;
      await runRulesProvenanceCommand({ json });
      // Advisory only — always succeed regardless of findings.
      process.exitCode = 0;
    });
}
