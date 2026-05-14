import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import bcrypt from 'bcryptjs';
import {
  AuthTokenSchema,
  AuthTokenPublicSchema,
  type AuthToken,
  type AuthTokenPublic,
  type TokenScope,
} from '@harness-engineering/types';

const BCRYPT_ROUNDS = 12;
const LEGACY_ENV_ID = 'tok_legacy_env';

export interface CreateTokenInput {
  name: string;
  scopes: TokenScope[];
  bridgeKind?: AuthToken['bridgeKind'];
  tenantId?: string;
  expiresAt?: string;
}

export interface CreateTokenResult {
  id: string;
  token: string; // shown once
  record: AuthToken;
}

function genId(): string {
  return `tok_${randomBytes(8).toString('hex')}`;
}

function genSecret(): string {
  return randomBytes(24).toString('base64url');
}

function parseToken(raw: string): { id: string; secret: string } | null {
  const dot = raw.indexOf('.');
  if (dot < 0) return null;
  return { id: raw.slice(0, dot), secret: raw.slice(dot + 1) };
}

export class TokenStore {
  private cache: AuthToken[] | null = null;
  constructor(private readonly path: string) {}

  private async load(): Promise<AuthToken[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      const list = Array.isArray(parsed) ? parsed : [];
      this.cache = list
        .map((entry) => {
          const r = AuthTokenSchema.safeParse(entry);
          return r.success ? r.data : null;
        })
        .filter((x): x is AuthToken => x !== null);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') this.cache = [];
      else throw err;
    }
    return this.cache;
  }

  private async persist(records: AuthToken[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(records, null, 2), 'utf8');
    this.cache = records;
  }

  async create(input: CreateTokenInput): Promise<CreateTokenResult> {
    const id = genId();
    const secret = genSecret();
    const hashedSecret = await bcrypt.hash(secret, BCRYPT_ROUNDS);
    const record: AuthToken = {
      id,
      name: input.name,
      scopes: input.scopes,
      ...(input.bridgeKind ? { bridgeKind: input.bridgeKind } : {}),
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      hashedSecret,
      createdAt: new Date().toISOString(),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    };
    const records = await this.load();
    if (records.some((r) => r.name === input.name)) {
      throw new Error(`Token with name "${input.name}" already exists`);
    }
    await this.persist([...records, record]);
    return { id, token: `${id}.${secret}`, record };
  }

  async verify(raw: string): Promise<AuthToken | null> {
    const parsed = parseToken(raw);
    if (!parsed) return null;
    const records = await this.load();
    const rec = records.find((r) => r.id === parsed.id);
    if (!rec) return null;
    if (rec.expiresAt && Date.parse(rec.expiresAt) <= Date.now()) return null;
    const ok = await bcrypt.compare(parsed.secret, rec.hashedSecret);
    if (!ok) return null;
    await this.touchLastUsed(rec.id);
    return rec;
  }

  private async touchLastUsed(id: string): Promise<void> {
    const records = await this.load();
    const idx = records.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const current = records[idx];
    if (!current) return;
    const next: AuthToken = { ...current, lastUsedAt: new Date().toISOString() };
    const out = records.slice();
    out[idx] = next;
    await this.persist(out);
  }

  async list(): Promise<AuthTokenPublic[]> {
    const records = await this.load();
    return records.map((r) => AuthTokenPublicSchema.parse(r));
  }

  async revoke(id: string): Promise<boolean> {
    const records = await this.load();
    const next = records.filter((r) => r.id !== id);
    if (next.length === records.length) return false;
    await this.persist(next);
    return true;
  }

  /**
   * Synthetic admin record for the legacy HARNESS_API_TOKEN escape hatch.
   * Returned only when `presented` matches `envValue` byte-for-byte (constant-time).
   */
  legacyEnvToken(presented: string, envValue: string | undefined): AuthToken | null {
    if (!envValue) return null;
    const a = Buffer.from(presented);
    const b = Buffer.from(envValue);
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
    return {
      id: LEGACY_ENV_ID,
      name: 'legacy-env',
      scopes: ['admin'],
      hashedSecret: '<env>',
      createdAt: new Date(0).toISOString(),
    };
  }
}
