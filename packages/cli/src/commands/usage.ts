import { Command } from 'commander';
import { logger } from '../output/logger';

function formatMicroUSD(microUSD: number | null): string {
  if (microUSD == null) return 'N/A';
  return '$' + (microUSD / 1_000_000).toFixed(4);
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + 'M';
  if (count >= 1_000) return (count / 1_000).toFixed(1) + 'K';
  return String(count);
}

function formatModels(models: string[]): string {
  if (models.length === 0) return 'unknown';
  if (models.length === 1) return models[0];
  return `${models[0]} and ${models.length - 1} other${models.length - 1 > 1 ? 's' : ''}`;
}

function registerDailyCommand(usage: Command): void {
  usage
    .command('daily')
    .description('Show per-day token usage and cost')
    .option('--days <n>', 'Number of days to show (default: 7, max: 90)', '7')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const days = Math.min(Math.max(parseInt(opts.days, 10) || 7, 1), 90);
      const cwd = process.cwd();

      const { readCostRecords, aggregateByDay } = await import('@harness-engineering/core');
      const { loadPricingData, calculateCost } = await import('@harness-engineering/core');

      const records = readCostRecords(cwd);
      if (records.length === 0) {
        if (globalOpts.json) {
          console.log(JSON.stringify([]));
        } else {
          logger.info('No usage data found. Run some harness sessions first.');
        }
        return;
      }

      // Calculate costs at read time
      const pricingData = await loadPricingData(cwd);
      for (const record of records) {
        if (record.model && record.costMicroUSD == null) {
          record.costMicroUSD = calculateCost(record, pricingData);
        }
      }

      const dailyData = aggregateByDay(records);
      const limited = dailyData.slice(0, days);

      if (globalOpts.json) {
        console.log(JSON.stringify(limited, null, 2));
        return;
      }

      // Table header
      const header =
        'Date         | Sessions | Input     | Output    | Model(s)                     | Cost';
      const divider =
        '-------------|----------|-----------|-----------|------------------------------|--------';
      logger.info(header);
      logger.info(divider);

      for (const day of limited) {
        const date = day.date.padEnd(12);
        const sessions = String(day.sessionCount).padStart(8);
        const input = formatTokenCount(day.tokens.inputTokens).padStart(9);
        const output = formatTokenCount(day.tokens.outputTokens).padStart(9);
        const models = formatModels(day.models).padEnd(28);
        const cost = formatMicroUSD(day.costMicroUSD);
        logger.info(`${date} | ${sessions} | ${input} | ${output} | ${models} | ${cost}`);
      }
    });
}

function registerSessionsCommand(usage: Command): void {
  usage
    .command('sessions')
    .description('List recent sessions with token usage and cost')
    .option('--limit <n>', 'Number of sessions to show (default: 10, max: 100)', '10')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 10, 1), 100);
      const cwd = process.cwd();

      const { readCostRecords, aggregateBySession } = await import('@harness-engineering/core');
      const { loadPricingData, calculateCost } = await import('@harness-engineering/core');

      const records = readCostRecords(cwd);
      if (records.length === 0) {
        if (globalOpts.json) {
          console.log(JSON.stringify([]));
        } else {
          logger.info('No usage data found. Run some harness sessions first.');
        }
        return;
      }

      const pricingData = await loadPricingData(cwd);
      for (const record of records) {
        if (record.model && record.costMicroUSD == null) {
          record.costMicroUSD = calculateCost(record, pricingData);
        }
      }

      const sessionData = aggregateBySession(records);
      const limited = sessionData.slice(0, limit);

      if (globalOpts.json) {
        console.log(JSON.stringify(limited, null, 2));
        return;
      }

      const header =
        'Session ID           | Started              | Duration  | Tokens    | Model                | Cost';
      const divider =
        '---------------------|----------------------|-----------|-----------|----------------------|--------';
      logger.info(header);
      logger.info(divider);

      for (const s of limited) {
        const id = s.sessionId.slice(0, 20).padEnd(20);
        const started = s.firstTimestamp.slice(0, 19).padEnd(20);
        const durationMs =
          new Date(s.lastTimestamp).getTime() - new Date(s.firstTimestamp).getTime();
        const durationMin = Math.max(1, Math.round(durationMs / 60000));
        const duration = `${durationMin}m`.padStart(9);
        const tokens = formatTokenCount(s.tokens.totalTokens).padStart(9);
        const model = (s.model ?? 'unknown').slice(0, 20).padEnd(20);
        const cost = formatMicroUSD(s.costMicroUSD);
        logger.info(`${id} | ${started} | ${duration} | ${tokens} | ${model} | ${cost}`);
      }
    });
}

function registerSessionCommand(usage: Command): void {
  usage
    .command('session <id>')
    .description('Show detailed token breakdown for a specific session')
    .action(async (id: string, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();

      const { readCostRecords, aggregateBySession } = await import('@harness-engineering/core');
      const { loadPricingData, calculateCost } = await import('@harness-engineering/core');

      const records = readCostRecords(cwd);
      const pricingData = await loadPricingData(cwd);
      for (const record of records) {
        if (record.model && record.costMicroUSD == null) {
          record.costMicroUSD = calculateCost(record, pricingData);
        }
      }

      const sessionData = aggregateBySession(records);
      const match = sessionData.find((s) => s.sessionId === id);

      if (!match) {
        // Fuzzy match: find sessions containing the given id as substring
        const fuzzy = sessionData.filter(
          (s) => s.sessionId.includes(id) || id.includes(s.sessionId.slice(0, 8))
        );

        const errMsg = `Session "${id}" not found.`;
        if (fuzzy.length > 0) {
          const suggestions = fuzzy.slice(0, 3).map((s) => s.sessionId);
          if (globalOpts.json) {
            console.log(JSON.stringify({ error: errMsg, suggestions }));
          } else {
            logger.error(errMsg);
            logger.info('Did you mean:');
            for (const s of suggestions) {
              logger.info(`  ${s}`);
            }
          }
        } else {
          if (globalOpts.json) {
            console.log(JSON.stringify({ error: errMsg, suggestions: [] }));
          } else {
            logger.error(errMsg);
          }
        }
        process.exitCode = 1;
        return;
      }

      if (globalOpts.json) {
        console.log(JSON.stringify(match, null, 2));
        return;
      }

      logger.info(`Session: ${match.sessionId}`);
      logger.info(`Started: ${match.firstTimestamp}`);
      logger.info(`Ended:   ${match.lastTimestamp}`);
      logger.info(`Model:   ${match.model ?? 'unknown'}`);
      logger.info(`Source:  ${match.source}`);
      logger.info('');
      logger.info('Token Breakdown:');
      logger.info(`  Input tokens:          ${formatTokenCount(match.tokens.inputTokens)}`);
      logger.info(`  Output tokens:         ${formatTokenCount(match.tokens.outputTokens)}`);
      logger.info(`  Total tokens:          ${formatTokenCount(match.tokens.totalTokens)}`);
      if (match.cacheReadTokens != null) {
        logger.info(`  Cache read tokens:     ${formatTokenCount(match.cacheReadTokens)}`);
      }
      if (match.cacheCreationTokens != null) {
        logger.info(`  Cache creation tokens: ${formatTokenCount(match.cacheCreationTokens)}`);
      }
      logger.info('');
      logger.info(`Cost: ${formatMicroUSD(match.costMicroUSD)}`);
    });
}

function registerLatestCommand(usage: Command): void {
  usage
    .command('latest')
    .description('Show the most recently completed session cost summary')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();

      const { readCostRecords, aggregateBySession } = await import('@harness-engineering/core');
      const { loadPricingData, calculateCost } = await import('@harness-engineering/core');

      const records = readCostRecords(cwd);
      if (records.length === 0) {
        if (globalOpts.json) {
          console.log(JSON.stringify({ error: 'No usage data found' }));
        } else {
          logger.info('No usage data found. Run some harness sessions first.');
        }
        return;
      }

      const pricingData = await loadPricingData(cwd);
      for (const record of records) {
        if (record.model && record.costMicroUSD == null) {
          record.costMicroUSD = calculateCost(record, pricingData);
        }
      }

      const sessionData = aggregateBySession(records);
      // Already sorted descending by firstTimestamp
      const latest = sessionData[0];

      if (globalOpts.json) {
        console.log(JSON.stringify(latest, null, 2));
        return;
      }

      logger.info(`Session: ${latest.sessionId}`);
      logger.info(`Started: ${latest.firstTimestamp}`);
      logger.info(`Ended:   ${latest.lastTimestamp}`);
      logger.info(`Model:   ${latest.model ?? 'unknown'}`);
      logger.info(
        `Tokens:  ${formatTokenCount(latest.tokens.totalTokens)} (${formatTokenCount(latest.tokens.inputTokens)} in / ${formatTokenCount(latest.tokens.outputTokens)} out)`
      );
      logger.info(`Cost:    ${formatMicroUSD(latest.costMicroUSD)}`);
    });
}

export function createUsageCommand(): Command {
  const usage = new Command('usage').description('Token usage and cost tracking');

  // Stub flag for Phase 4 CC parser integration
  usage.option('--include-claude-sessions', 'Include Claude Code session data (requires Phase 4)');

  registerDailyCommand(usage);
  registerSessionsCommand(usage);
  registerSessionCommand(usage);
  registerLatestCommand(usage);

  return usage;
}
