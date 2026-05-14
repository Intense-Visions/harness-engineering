import { Hono } from 'hono';
import { z } from 'zod';
import { resolve } from 'node:path';
import { TokenStore } from '@harness-engineering/orchestrator';
import { TokenScopeSchema, BridgeKindSchema } from '@harness-engineering/types';

const CreateBodySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(TokenScopeSchema).min(1),
  bridgeKind: BridgeKindSchema.optional(),
  tenantId: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

function getStore(): TokenStore {
  const p = process.env['HARNESS_TOKENS_PATH'] ?? resolve('.harness', 'tokens.json');
  return new TokenStore(p);
}

export function buildTokensRouter(): Hono {
  const r = new Hono();

  r.get('/tokens', async (c) => {
    const list = await getStore().list();
    return c.json(list);
  });

  r.post('/tokens', async (c) => {
    const raw = (await c.req.json()) as unknown;
    const parsed = CreateBodySchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    try {
      // Strip undefined fields so the strict CreateTokenInput accepts the payload.
      const input: Parameters<TokenStore['create']>[0] = {
        name: parsed.data.name,
        scopes: parsed.data.scopes,
      };
      if (parsed.data.bridgeKind !== undefined) input.bridgeKind = parsed.data.bridgeKind;
      if (parsed.data.tenantId !== undefined) input.tenantId = parsed.data.tenantId;
      if (parsed.data.expiresAt !== undefined) input.expiresAt = parsed.data.expiresAt;
      const result = await getStore().create(input);
      return c.json({
        id: result.id,
        token: result.token,
        record: { ...result.record, hashedSecret: undefined },
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('already exists')) return c.json({ error: msg }, 409);
      throw err;
    }
  });

  r.delete('/tokens/:id', async (c) => {
    const id = c.req.param('id');
    const ok = await getStore().revoke(id);
    if (!ok) return c.json({ error: 'Token not found' }, 404);
    return c.json({ deleted: true });
  });

  return r;
}
