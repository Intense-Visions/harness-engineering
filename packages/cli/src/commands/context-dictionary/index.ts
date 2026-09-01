import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import {
  buildCodebookReport,
  emptyCodebook,
  type Codebook,
  type CodebookReport,
} from '@harness-engineering/core';

import { logger } from '../../output/logger';
import { readComprehensionCorpus } from './corpus';

/**
 * `harness context-dictionary report` — trained context dictionaries (#1635).
 *
 * Mines recurring spans over the committed comprehension corpus, scores each
 * candidate by `frequency × length` against an amortization threshold, and emits
 * a governed, versioned codebook (verified definition + deterministic expansion,
 * version bump on definition change) plus the enter/retain/retire membership
 * report and the projected token savings the codebook WOULD yield.
 *
 * Read-only and report-only: nothing is substituted into served context (that
 * wiring is deferred, #1635). `--write` optionally persists the trained codebook
 * to `.harness/dictionary/codebook.json` so the next run governs drift (version
 * bumps) against it — the codebook is a produced artifact, not a serving change.
 */

const CODEBOOK_PATH = join('.harness', 'dictionary', 'codebook.json');

interface ReportOptions {
  json?: boolean;
  write?: boolean;
}

function readPriorCodebook(cwd: string): Codebook {
  const path = join(cwd, CODEBOOK_PATH);
  if (!existsSync(path)) return emptyCodebook();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Codebook;
    if (parsed && Array.isArray(parsed.entries) && Array.isArray(parsed.history)) return parsed;
  } catch {
    // Corrupt or unreadable prior book — start fresh rather than throw.
  }
  return emptyCodebook();
}

function writeCodebook(cwd: string, codebook: Codebook): string {
  const path = join(cwd, CODEBOOK_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(codebook, null, 2) + '\n', 'utf8');
  return path;
}

function pct(fraction: number): string {
  return (fraction * 100).toFixed(1) + '%';
}

function formatCount(count: number): string {
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
  return String(count);
}

/** Render the report as styled terminal lines. */
export function renderReport(report: CodebookReport): string[] {
  const out: string[] = [
    '',
    `  ${chalk.bold('trained context dictionary')} ${chalk.dim('— recurring-knowledge codebook (report-only, #1635)')}`,
    chalk.dim('  source: committed comprehension corpus (.harness/comprehension)'),
    `  ${'corpus documents'.padEnd(22)}${String(report.corpusSize).padStart(8)}`,
    `  ${'mined candidates'.padEnd(22)}${String(report.mined.length).padStart(8)}`,
    `  ${'entered'.padEnd(22)}${String(report.membershipCounts.enter).padStart(8)}`,
    `  ${'retained'.padEnd(22)}${String(report.membershipCounts.retain).padStart(8)}`,
    `  ${'retired'.padEnd(22)}${String(report.membershipCounts.retire).padStart(8)}`,
    `  ${'codebook terms'.padEnd(22)}${String(report.codebook.entries.length).padStart(8)}`,
    `  ${'version bumps (drift)'.padEnd(22)}${String(report.driftBumps).padStart(8)}`,
    '',
    `  ${chalk.bold('projected savings')} ${chalk.dim('(if substitution were wired — deferred)')}`,
    `  ${'verbatim baseline'.padEnd(22)}${formatCount(report.savings.baselineChars).padStart(8)} chars`,
    `  ${'as codebook'.padEnd(22)}${formatCount(report.savings.dictionaryChars).padStart(8)} chars`,
    `  ${'saved'.padEnd(22)}${formatCount(report.savings.savedChars).padStart(8)} chars ${chalk.dim(
      `(${pct(report.savings.savedFraction)}, ~${formatCount(report.savings.savedTokensEstimate)} tokens)`
    )}`,
  ];

  const top = report.codebook.entries
    .map((e) => ({ e, term: report.mined.find((m) => m.label === e.label) }))
    .filter((x) => x.term)
    .sort((a, b) => b.term!.frequencyTimesLength - a.term!.frequencyTimesLength)
    .slice(0, 10);

  if (top.length > 0) {
    out.push('', `  ${chalk.dim('top codebook terms (handle v# — freq×len — definition)')}`);
    for (const { e, term } of top) {
      const def =
        term!.definition.length > 56 ? term!.definition.slice(0, 53) + '...' : term!.definition;
      out.push(
        `  ${chalk.cyan(e.handle)} ${chalk.dim('v' + e.version)} ${chalk.dim(
          `(${term!.frequency}×${term!.length}=${term!.frequencyTimesLength})`
        )} ${def}`
      );
    }
  }
  return out;
}

/** Load the corpus, prior codebook, and build the report. */
export async function loadReport(cwd: string): Promise<CodebookReport> {
  const corpus = await readComprehensionCorpus(cwd);
  const priorCodebook = readPriorCodebook(cwd);
  return buildCodebookReport({ corpus, priorCodebook });
}

export function createContextDictionaryCommand(): Command {
  const command = new Command('context-dictionary')
    .alias('dictionary')
    .description(
      'Train a governed, versioned codebook of recurring knowledge over the comprehension corpus (report-only, #1635)'
    );

  command
    .command('report', { isDefault: true })
    .description('Mine recurring spans, score membership, and report the trained codebook')
    .option('--json', 'Emit machine-readable JSON')
    .option('--write', 'Persist the trained codebook to .harness/dictionary/codebook.json')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as ReportOptions;
      const cwd = process.cwd();
      const report = await loadReport(cwd);

      let writtenPath: string | undefined;
      if (opts.write) {
        writtenPath = writeCodebook(cwd, report.codebook);
      }

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        if (writtenPath) logger.info(`Codebook written to ${writtenPath}`);
        return;
      }

      if (report.corpusSize === 0) {
        logger.info(
          'No comprehension corpus found (.harness/comprehension). Run `harness comprehend` first.'
        );
        return;
      }

      for (const line of renderReport(report)) console.log(line);
      if (writtenPath) console.log('', chalk.dim(`  codebook written to ${writtenPath}`));
    });

  return command;
}
