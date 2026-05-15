import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { WebhookSubscriptionSchema, type WebhookSubscription } from '@harness-engineering/types';
import { eventMatches } from './signer';

export interface CreateSubscriptionInput {
  tokenId: string;
  url: string;
  events: string[];
}

function genId(): string {
  return `whk_${randomBytes(8).toString('hex')}`;
}
function genSecret(): string {
  // 32 bytes of entropy → base64url (44 chars). Plaintext at rest per
  // plan decision (A); file mode locked to 0600.
  return randomBytes(32).toString('base64url');
}

/**
 * Persists webhook subscriptions to .harness/webhooks.json. In-memory cache
 * + atomic-rename-on-write matches the TokenStore pattern (tokens.ts:60-80).
 */
export class WebhookStore {
  private cache: WebhookSubscription[] | null = null;
  constructor(private readonly path: string) {}

  private async load(): Promise<WebhookSubscription[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      const list = Array.isArray(parsed) ? parsed : [];
      this.cache = list
        .map((entry) => {
          const r = WebhookSubscriptionSchema.safeParse(entry);
          return r.success ? r.data : null;
        })
        .filter((x): x is WebhookSubscription => x !== null);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') this.cache = [];
      else throw err;
    }
    return this.cache;
  }

  private async persist(records: WebhookSubscription[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await writeFile(tmp, JSON.stringify(records, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, this.path);
    // chmod after rename: on some filesystems rename preserves the mode of
    // the renamed-to path. Explicit chmod is the defensive guarantee.
    try {
      await chmod(this.path, 0o600);
    } catch (err) {
      // ENOENT means the file was removed between rename and chmod (e.g. by
      // a parallel test-cleanup rmSync). The data is gone either way — no
      // production caller racing against persist() should still trust this
      // store. Swallowing here avoids an unhandled-rejection on test teardown.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    this.cache = records;
  }

  async create(input: CreateSubscriptionInput): Promise<WebhookSubscription> {
    const id = genId();
    const secret = genSecret();
    const record: WebhookSubscription = {
      id,
      tokenId: input.tokenId,
      url: input.url,
      events: input.events,
      secret,
      createdAt: new Date().toISOString(),
    };
    const records = await this.load();
    await this.persist([...records, record]);
    return record;
  }

  async list(): Promise<WebhookSubscription[]> {
    return [...(await this.load())];
  }

  async delete(id: string): Promise<boolean> {
    const records = await this.load();
    const next = records.filter((r) => r.id !== id);
    if (next.length === records.length) return false;
    await this.persist(next);
    return true;
  }

  /** Returns subs whose events list contains a pattern matching `eventType`. */
  async listForEvent(eventType: string): Promise<WebhookSubscription[]> {
    const records = await this.load();
    return records.filter((r) => r.events.some((p) => eventMatches(p, eventType)));
  }
}
