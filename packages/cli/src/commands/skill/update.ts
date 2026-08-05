import { Command } from 'commander';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolveCommunityBase } from '../install';
import {
  probeProviders,
  updateProviders,
  type LockfileRef,
  type ProbedProvider,
} from './provider-update';

interface SkillUpdateOptions {
  check?: boolean;
  global?: boolean;
  yes?: boolean;
}

/** Which lockfiles to probe: global-only with --global, else project + global. */
function resolveLockfiles(global: boolean): LockfileRef[] {
  if (global) return [{ path: resolveCommunityBase(true).lockfilePath, global: true }];
  return [
    { path: resolveCommunityBase(false).lockfilePath, global: false },
    { path: resolveCommunityBase(true).lockfilePath, global: true },
  ];
}

function matchesName(providerName: string, name: string): boolean {
  return providerName === name || providerName === `@harness-skills/${name}`;
}

function printTable(providers: ProbedProvider[]): void {
  for (const p of providers) {
    // A failed probe (latest === null) is fail-safe (never outdated, never
    // auto-repulled) but must NOT masquerade as "(up to date)" — a green
    // --check offline/CI would otherwise falsely imply the upstream was
    // verified. Render it as visually distinct "could not check".
    let detail: string;
    if (p.latest === null) {
      detail = `${p.current} (could not check)`;
    } else if (p.outdated) {
      detail = `${p.current} -> ${p.latest}`;
    } else {
      detail = `${p.current} (up to date)`;
    }
    console.log(`  ${p.name} [${p.kind}] ${detail}`);
  }
}

export function createUpdateCommand(): Command {
  return new Command('update')
    .description('Check and update external skill providers (github/npm) to their latest upstream')
    .argument('[name]', 'Only consider the provider with this short name')
    .option('--check', 'Report only; exit non-zero if any provider is outdated')
    .option('--global', 'Operate on the global (~/.harness) skill lockfile only')
    .option('--yes', 'Skip per-provider confirmation and update all outdated providers')
    .action(async (name: string | undefined, opts: SkillUpdateOptions) => {
      const { providers, sourceless } = probeProviders(resolveLockfiles(opts.global ?? false));

      for (const s of sourceless) {
        if (name && !matchesName(s.name, name)) continue;
        logger.info(`${s.name}: source unknown — reinstall to enable freshness`);
      }

      const filtered = name ? providers.filter((p) => matchesName(p.name, name)) : providers;
      if (filtered.length === 0) {
        logger.info('No freshness-eligible skill providers found.');
        process.exit(ExitCode.SUCCESS);
      }

      printTable(filtered);
      const outdated = filtered.filter((p) => p.outdated);

      if (opts.check) {
        process.exit(outdated.length > 0 ? ExitCode.VALIDATION_FAILED : ExitCode.SUCCESS);
      }

      if (outdated.length === 0) {
        logger.success('All skill providers are up to date.');
        process.exit(ExitCode.SUCCESS);
      }

      const outcomes = await updateProviders(outdated, { yes: opts.yes ?? false });
      const updated = outcomes.filter((o) => o.updated).length;
      logger.success(`Updated ${updated} of ${outdated.length} skill provider(s).`);
      process.exit(ExitCode.SUCCESS);
    });
}
