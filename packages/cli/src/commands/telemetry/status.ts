import { Command } from 'commander';
import { resolveConsent, readIdentity, getOrCreateInstallId } from '@harness-engineering/core';
import { logger } from '../../output/logger';

interface StatusResult {
  consent: { allowed: boolean; reason?: string };
  installId: string | null;
  identity: { project?: string; team?: string; alias?: string };
  envOverrides: { DO_NOT_TRACK?: string; HARNESS_TELEMETRY_OPTOUT?: string };
}

function gatherEnvOverrides(): StatusResult['envOverrides'] {
  const overrides: StatusResult['envOverrides'] = {};
  if (process.env.DO_NOT_TRACK) overrides.DO_NOT_TRACK = process.env.DO_NOT_TRACK;
  if (process.env.HARNESS_TELEMETRY_OPTOUT)
    overrides.HARNESS_TELEMETRY_OPTOUT = process.env.HARNESS_TELEMETRY_OPTOUT;
  return overrides;
}

function resolveDisabledReason(): string {
  if (process.env.DO_NOT_TRACK === '1') return 'DO_NOT_TRACK=1';
  if (process.env.HARNESS_TELEMETRY_OPTOUT === '1') return 'HARNESS_TELEMETRY_OPTOUT=1';
  return 'telemetry.enabled is false in config';
}

function printHumanStatus(result: StatusResult): void {
  logger.info(`Telemetry: ${result.consent.allowed ? 'enabled' : 'disabled'}`);
  if (!result.consent.allowed && result.consent.reason) {
    logger.info(`  Reason:  ${result.consent.reason}`);
  }
  logger.info(`Install ID: ${result.installId ?? 'not yet created'}`);

  const { identity } = result;
  const hasIdentity = identity.project || identity.team || identity.alias;
  if (hasIdentity) {
    logger.info('Identity:');
    for (const [key, value] of Object.entries(identity)) {
      if (value) logger.info(`  ${key.padEnd(7)}: ${value}`);
    }
  } else {
    logger.info('Identity: not configured');
  }

  const overrideKeys = Object.keys(result.envOverrides);
  if (overrideKeys.length > 0) {
    logger.info('Env overrides:');
    for (const key of overrideKeys) {
      logger.info(`  ${key}=${result.envOverrides[key as keyof typeof result.envOverrides]}`);
    }
  }
}

export function createStatusCommand(): Command {
  const cmd = new Command('status')
    .description('Show current telemetry consent state, install ID, and identity')
    .option('--json', 'Output as JSON')
    .action((opts) => {
      const cwd = process.cwd();

      const envOverrides = gatherEnvOverrides();
      const consent = resolveConsent(cwd, undefined);

      // Only read identity and install ID when consent allows — showing
      // this data when the user opted out undermines the privacy contract.
      let installId: string | null = null;
      let identity: StatusResult['identity'] = {};

      if (consent.allowed) {
        identity = readIdentity(cwd);
        try {
          installId = getOrCreateInstallId(cwd);
        } catch {
          // may fail if .harness dir cannot be created
        }
      }

      const result: StatusResult = {
        consent: {
          allowed: consent.allowed,
          ...(!consent.allowed ? { reason: resolveDisabledReason() } : {}),
        },
        installId,
        identity,
        envOverrides,
      };

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      printHumanStatus(result);
    });

  return cmd;
}
