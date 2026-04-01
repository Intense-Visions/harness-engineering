import { Command } from 'commander';
import { clearTaint, listTaintedSessions, checkTaint } from '@harness-engineering/core';
import { logger } from '../output/logger';

function getProjectRoot(): string {
  return process.cwd();
}

function registerClearCommand(taint: Command): void {
  taint
    .command('clear [sessionId]')
    .description(
      'Clear session taint — removes taint file(s) and re-enables destructive operations'
    )
    .action((sessionId?: string) => {
      const projectRoot = getProjectRoot();
      const count = clearTaint(projectRoot, sessionId);
      if (count === 0) {
        if (sessionId) {
          logger.info(`No taint found for session "${sessionId}".`);
        } else {
          logger.info('No active taint files found.');
        }
      } else if (sessionId) {
        logger.info(
          `Sentinel: taint cleared for session "${sessionId}". Destructive operations re-enabled.`
        );
      } else {
        logger.info(
          `Sentinel: cleared ${count} taint file${count === 1 ? '' : 's'}. Destructive operations re-enabled.`
        );
      }
    });
}

function registerStatusCommand(taint: Command): void {
  taint
    .command('status [sessionId]')
    .description('Show current taint status for a session or all sessions')
    .action((sessionId?: string) => {
      const projectRoot = getProjectRoot();
      if (sessionId) {
        const result = checkTaint(projectRoot, sessionId);
        if (result.expired) {
          logger.info(`Session "${sessionId}": taint expired (cleared).`);
        } else if (result.tainted && result.state) {
          const state = result.state;
          const expiresAt = new Date(state.expiresAt);
          const remaining = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000 / 60));
          logger.info(`Session "${sessionId}": TAINTED (${state.severity})`);
          logger.info(`  Reason: ${state.reason}`);
          logger.info(`  Expires in: ~${remaining} minute${remaining === 1 ? '' : 's'}`);
          logger.info(`  Findings: ${state.findings.length}`);
        } else {
          logger.info(`Session "${sessionId}": clean (no taint).`);
        }
      } else {
        const sessions = listTaintedSessions(projectRoot);
        if (sessions.length === 0) {
          logger.info('No active taint sessions.');
        } else {
          logger.info(`Active taint sessions (${sessions.length}):`);
          for (const id of sessions) {
            const result = checkTaint(projectRoot, id);
            if (result.tainted && result.state) {
              const remaining = Math.max(
                0,
                Math.round((new Date(result.state.expiresAt).getTime() - Date.now()) / 1000 / 60)
              );
              logger.info(`  ${id}: ${result.state.severity} — expires in ~${remaining}m`);
            }
          }
        }
      }
    });
}

export function createTaintCommand(): Command {
  const taint = new Command('taint').description('Manage sentinel session taint state');

  registerClearCommand(taint);
  registerStatusCommand(taint);

  return taint;
}
