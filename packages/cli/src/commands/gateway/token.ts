import { Command } from 'commander';
import { resolve } from 'node:path';
import { TokenStore } from '@harness-engineering/orchestrator';
import type { TokenScope } from '@harness-engineering/types';

function getStore(): TokenStore {
  const p = process.env['HARNESS_TOKENS_PATH'] ?? resolve('.harness', 'tokens.json');
  return new TokenStore(p);
}

export async function runTokenCreate(opts: {
  name: string;
  scopes: TokenScope[];
  bridgeKind?: 'slack' | 'discord' | 'github-app' | 'custom';
  tenantId?: string;
  expiresAt?: string;
}): Promise<{ id: string; token: string }> {
  const store = getStore();
  const result = await store.create(opts);
  return { id: result.id, token: result.token };
}

export async function runTokenList(): Promise<unknown[]> {
  const store = getStore();
  return store.list();
}

export async function runTokenRevoke(id: string): Promise<boolean> {
  const store = getStore();
  return store.revoke(id);
}

export function createTokenCommand(): Command {
  const cmd = new Command('token').description('Manage Gateway API tokens');

  cmd
    .command('create')
    .description('Create a new auth token. Secret is shown ONCE.')
    .requiredOption('--name <name>', 'Human label')
    .requiredOption('--scopes <scopes>', 'Comma-separated scopes')
    .option('--bridge <kind>', 'slack | discord | github-app | custom')
    .option('--tenant <id>', 'Tenant identifier')
    .option('--expires <iso>', 'Expiry ISO-8601')
    .action(
      async (opts: {
        name: string;
        scopes: string;
        bridge?: string;
        tenant?: string;
        expires?: string;
      }) => {
        const scopes = opts.scopes.split(',').map((s) => s.trim()) as TokenScope[];
        const input: Parameters<typeof runTokenCreate>[0] = { name: opts.name, scopes };
        if (opts.bridge) input.bridgeKind = opts.bridge as NonNullable<typeof input.bridgeKind>;
        if (opts.tenant) input.tenantId = opts.tenant;
        if (opts.expires) input.expiresAt = opts.expires;
        const out = await runTokenCreate(input);
        console.log(JSON.stringify(out, null, 2));
        console.log('\nWARNING: Save this token now — it will NEVER be shown again.');
      }
    );

  cmd
    .command('list')
    .description('List all tokens (secrets redacted)')
    .action(async () => {
      const tokens = await runTokenList();
      console.log(JSON.stringify(tokens, null, 2));
    });

  cmd
    .command('revoke <id>')
    .description('Delete a token by id')
    .action(async (id: string) => {
      const ok = await runTokenRevoke(id);
      if (ok) console.log(`Revoked ${id}`);
      else {
        console.error(`No such token: ${id}`);
        process.exitCode = 1;
      }
    });

  return cmd;
}
