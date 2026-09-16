// packages/cli/src/commands/public-outposts.ts
//
// `harness public-outposts` — discover PUBLIC pnyon Outposts you can read comprehension from
// (proposal public-outpost-directory). Prints each Outpost's id (for HARNESS_COMPREHENSION_OUTPOST),
// name, and knowledge count. Reads the pnyon-core URL + your serve token from the environment — it
// does NOT require HARNESS_COMPREHENSION_OUTPOST (that's what you're trying to discover).
import { Command } from 'commander';
import { DEFAULT_REMOTE_URL } from '@harness-engineering/core';
import { logger } from '../output/logger';

/** The env the discovery command reads — URL + serve token only (no Outpost id yet). */
interface DiscoveryEnv {
  readonly baseUrl: string;
  readonly token: string;
}

/**
 * Resolve the pnyon-core URL + serve token from the environment. The URL is OPTIONAL — it defaults
 * to {@link DEFAULT_REMOTE_URL} (pnyon), so discovery needs only a serve token. Returns the missing
 * keys when the token is absent. Deliberately does NOT require `HARNESS_COMPREHENSION_OUTPOST`
 * (unlike the read path) — the whole point is to find one.
 */
export function resolveDiscoveryEnv(
  env: Record<string, string | undefined> = process.env
): DiscoveryEnv | { missing: string[] } {
  const baseUrl = (env.HARNESS_COMPREHENSION_REMOTE_URL ?? '').trim() || DEFAULT_REMOTE_URL;
  const token = (env.PNYON_COMPREHENSION_SERVE_TOKEN ?? '').trim();
  if (token === '') return { missing: ['PNYON_COMPREHENSION_SERVE_TOKEN'] };
  return { baseUrl, token };
}

export function createPublicOutpostsCommand(): Command {
  return new Command('public-outposts')
    .description(
      'List public pnyon Outposts you can read comprehension from (discovery directory).'
    )
    .option('--json', 'Emit JSON to stdout instead of a table')
    .action(async (opts: { json?: boolean }) => {
      const resolved = resolveDiscoveryEnv();
      if ('missing' in resolved) {
        logger.error(
          `Set ${resolved.missing.join(' and ')} first — a serve token minted from the pnyon ` +
            'dashboard. The host defaults to pnyon (override with HARNESS_COMPREHENSION_REMOTE_URL); ' +
            'you do NOT need HARNESS_COMPREHENSION_OUTPOST to discover one.'
        );
        process.exitCode = 1;
        return;
      }

      const { fetchPublicOutposts } = await import('@harness-engineering/core');
      let outposts;
      try {
        outposts = await fetchPublicOutposts(resolved);
      } catch (err) {
        // The error carries a status/kind only (never the token) by construction.
        logger.error(err instanceof Error ? err.message : 'public-outposts request failed');
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify({ outposts }, null, 2));
        return;
      }
      if (outposts.length === 0) {
        logger.info('No public Outposts found.');
        return;
      }
      logger.info(`Public Outposts (${outposts.length}):\n`);
      for (const o of outposts) {
        const name = o.name ?? '(unnamed)';
        const count =
          o.knowledgeCount !== undefined ? `${o.knowledgeCount} indexed` : 'no comprehension yet';
        console.log(`  ${o.outpostId}  ${name}  —  ${count}`);
      }
      console.log('\nCopy an id into HARNESS_COMPREHENSION_OUTPOST to read it (see harness docs).');
    });
}
