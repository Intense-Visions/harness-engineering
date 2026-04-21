import { Command } from 'commander';
import type { SkillAdoptionSummary } from '@harness-engineering/types';
import { logger } from '../output/logger';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function registerSkillsCommand(adoption: Command): void {
  adoption
    .command('skills')
    .description('Show top skills by invocation count')
    .option('--limit <n>', 'Number of skills to show (default: 20)', '20')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const limit = Math.max(parseInt(opts.limit, 10) || 20, 1);
      const cwd = process.cwd();

      const { readAdoptionRecords, aggregateBySkill } = await import('@harness-engineering/core');
      const records = readAdoptionRecords(cwd);

      if (records.length === 0) {
        if (globalOpts.json) {
          console.log(JSON.stringify([]));
        } else {
          logger.info('No adoption data found. Skills will be tracked after your next session.');
        }
        return;
      }

      const summaries = aggregateBySkill(records).slice(0, limit);

      if (globalOpts.json) {
        console.log(JSON.stringify(summaries, null, 2));
        return;
      }

      const header =
        'Skill                              | Invocations | Success | Avg Duration | Last Used';
      const divider =
        '-----------------------------------|-------------|---------|--------------|----------';
      console.log(header);
      console.log(divider);

      for (const s of summaries) {
        const name = padRight(s.skill, 35);
        const count = padRight(String(s.invocations), 11);
        const rate = padRight(formatRate(s.successRate), 7);
        const dur = padRight(formatDuration(s.avgDuration), 12);
        const last = s.lastUsed.slice(0, 10);
        console.log(`${name} | ${count} | ${rate} | ${dur} | ${last}`);
      }

      console.log(`\nTotal: ${records.length} invocations across ${summaries.length} skill(s)`);
    });
}

function registerRecentCommand(adoption: Command): void {
  adoption
    .command('recent')
    .description('Show recent skill invocations')
    .option('--limit <n>', 'Number of invocations to show (default: 20)', '20')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const limit = Math.max(parseInt(opts.limit, 10) || 20, 1);
      const cwd = process.cwd();

      const { readAdoptionRecords } = await import('@harness-engineering/core');
      const records = readAdoptionRecords(cwd);

      if (records.length === 0) {
        if (globalOpts.json) {
          console.log(JSON.stringify([]));
        } else {
          logger.info('No adoption data found. Skills will be tracked after your next session.');
        }
        return;
      }

      // Sort by startedAt descending, take limit
      const sorted = [...records].sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );
      const limited = sorted.slice(0, limit);

      if (globalOpts.json) {
        console.log(JSON.stringify(limited, null, 2));
        return;
      }

      const header = 'Date       | Skill                              | Outcome   | Duration';
      const divider = '-----------|------------------------------------|-----------|---------';
      console.log(header);
      console.log(divider);

      for (const r of limited) {
        const date = r.startedAt.slice(0, 10);
        const skill = padRight(r.skill, 35);
        const outcome = padRight(r.outcome, 9);
        const dur = formatDuration(r.duration);
        console.log(`${date}  | ${skill}| ${outcome} | ${dur}`);
      }

      console.log(`\nShowing ${limited.length} of ${records.length} invocations`);
    });
}

type AdoptionRecord = Awaited<
  ReturnType<typeof import('@harness-engineering/core').readAdoptionRecords>
>[number];

function computePhaseRates(skillRecords: AdoptionRecord[]) {
  const phaseMap = new Map<string, number>();
  for (const r of skillRecords) {
    for (const phase of r.phasesReached) {
      phaseMap.set(phase, (phaseMap.get(phase) ?? 0) + 1);
    }
  }
  return Array.from(phaseMap.entries())
    .map(([phase, count]) => ({ phase, count, rate: count / skillRecords.length }))
    .sort((a, b) => b.count - a.count);
}

function computeOutcomes(skillRecords: AdoptionRecord[]) {
  const outcomes = { completed: 0, failed: 0, abandoned: 0 };
  for (const r of skillRecords) {
    if (r.outcome in outcomes) {
      outcomes[r.outcome as keyof typeof outcomes]++;
    }
  }
  return outcomes;
}

function printSkillDetail(
  name: string,
  summary: SkillAdoptionSummary,
  phaseRates: ReturnType<typeof computePhaseRates>,
  skillRecords: AdoptionRecord[]
): void {
  console.log(`Skill: ${name}`);
  console.log(`Invocations: ${summary.invocations}`);
  console.log(`Success rate: ${formatRate(summary.successRate)}`);
  console.log(`Avg duration: ${formatDuration(summary.avgDuration)}`);
  console.log(`Last used: ${summary.lastUsed.slice(0, 10)}`);
  if (summary.tier != null) {
    console.log(`Tier: ${summary.tier}`);
  }

  if (phaseRates.length > 0) {
    console.log('\nPhase completion rates:');
    for (const p of phaseRates) {
      console.log(
        `  ${padRight(p.phase, 20)} ${formatRate(p.rate)} (${p.count}/${skillRecords.length})`
      );
    }
  }

  const outcomes = computeOutcomes(skillRecords);
  console.log('\nOutcome breakdown:');
  console.log(`  Completed: ${outcomes.completed}`);
  console.log(`  Failed: ${outcomes.failed}`);
  console.log(`  Abandoned: ${outcomes.abandoned}`);
}

function registerSkillCommand(adoption: Command): void {
  adoption
    .command('skill <name>')
    .description('Show detail for a specific skill')
    .action(async (name: string, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();

      const { readAdoptionRecords, aggregateBySkill } = await import('@harness-engineering/core');
      const records = readAdoptionRecords(cwd);
      const skillRecords = records.filter((r) => r.skill === name);

      if (skillRecords.length === 0) {
        if (globalOpts.json) console.log(JSON.stringify(null));
        else logger.info(`No adoption data found for skill "${name}".`);
        return;
      }

      const summary = aggregateBySkill(skillRecords)[0] as SkillAdoptionSummary;
      const phaseRates = computePhaseRates(skillRecords);

      if (globalOpts.json) {
        console.log(
          JSON.stringify({ summary, phaseRates, totalRecords: skillRecords.length }, null, 2)
        );
        return;
      }

      printSkillDetail(name, summary, phaseRates, skillRecords);
    });
}

export function createAdoptionCommand(): Command {
  const adoption = new Command('adoption')
    .description('View skill adoption telemetry')
    .option('--json', 'Output in JSON format');

  registerSkillsCommand(adoption);
  registerRecentCommand(adoption);
  registerSkillCommand(adoption);

  return adoption;
}
