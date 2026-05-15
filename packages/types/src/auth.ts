import { z } from 'zod';

/**
 * Scope vocabulary for Gateway API tokens. Version-pinned in
 * packages/orchestrator/src/auth/scopes.ts; changes require an ADR.
 */
export const TokenScopeSchema = z.enum([
  'admin',
  'trigger-job',
  'read-status',
  'resolve-interaction',
  'subscribe-webhook',
  'modify-roadmap',
  'read-telemetry',
]);
export type TokenScope = z.infer<typeof TokenScopeSchema>;

export const BridgeKindSchema = z.enum(['slack', 'discord', 'github-app', 'custom']);
export type BridgeKind = z.infer<typeof BridgeKindSchema>;

/**
 * Persisted auth token. The raw secret is shown once at creation and
 * never stored — only `hashedSecret` lives in `.harness/tokens.json`.
 */
export const AuthTokenSchema = z.object({
  id: z.string().regex(/^tok_[a-f0-9]{16}$/),
  name: z.string().min(1).max(100),
  scopes: z.array(TokenScopeSchema).min(1),
  bridgeKind: BridgeKindSchema.optional(),
  tenantId: z.string().optional(),
  hashedSecret: z.string().min(1),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});
export type AuthToken = z.infer<typeof AuthTokenSchema>;

/** Public-facing view: hashedSecret stripped. */
export const AuthTokenPublicSchema = AuthTokenSchema.omit({ hashedSecret: true });
export type AuthTokenPublic = z.infer<typeof AuthTokenPublicSchema>;

/** Append-only JSONL audit entry. NO payload contents — only route + status. */
export const AuthAuditEntrySchema = z.object({
  timestamp: z.string().datetime(),
  tokenId: z.string(),
  tenantId: z.string().optional(),
  route: z.string(),
  method: z.string(),
  status: z.number().int(),
});
export type AuthAuditEntry = z.infer<typeof AuthAuditEntrySchema>;
