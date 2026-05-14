import { z } from 'zod';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import {
  AuthTokenPublicSchema,
  TokenScopeSchema,
  BridgeKindSchema,
} from '@harness-engineering/types';

extendZodWithOpenApi(z);

export function buildAuthRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();

  // Reusable components
  const TokenScope = registry.register('TokenScope', TokenScopeSchema.openapi('TokenScope'));
  const BridgeKind = registry.register('BridgeKind', BridgeKindSchema.openapi('BridgeKind'));
  const AuthTokenPublic = registry.register(
    'AuthTokenPublic',
    AuthTokenPublicSchema.openapi('AuthTokenPublic')
  );

  const CreateRequest = z
    .object({
      name: z.string().min(1).max(100),
      scopes: z.array(TokenScope).min(1),
      bridgeKind: BridgeKind.optional(),
      tenantId: z.string().optional(),
      expiresAt: z.string().datetime().optional(),
    })
    .openapi('CreateTokenRequest');

  const CreateResponse = z
    .object({
      token: z.string(),
      id: z.string(),
      record: AuthTokenPublic,
    })
    .openapi('CreateTokenResponse');

  registry.registerComponent('securitySchemes', 'BearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'tok_<id>.<base64url>',
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/token',
    description: 'Create a new auth token. Secret returned once.',
    security: [{ BearerAuth: [] }],
    request: { body: { content: { 'application/json': { schema: CreateRequest } } } },
    responses: {
      200: {
        description: 'Token created',
        content: { 'application/json': { schema: CreateResponse } },
      },
      409: { description: 'Duplicate name' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/auth/tokens',
    description: 'List tokens (hashedSecret redacted).',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: z.array(AuthTokenPublic) } },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/auth/tokens/{id}',
    description: 'Revoke a token by id.',
    security: [{ BearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Deleted' },
      404: { description: 'Token not found' },
    },
  });

  return registry;
}

export function buildAuthDocument(): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  const generator = new OpenApiGeneratorV31(buildAuthRegistry().definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Harness Gateway API',
      version: '0.1.0',
      description: 'Hermes Phase 0 — auth routes (Phase 1 scope).',
    },
    servers: [{ url: 'http://127.0.0.1:8080' }],
  });
}
