# Node.js Fastify Patterns

> Build performant APIs with Fastify using schema validation, plugins, decorators, and hooks

## When to Use

- Building high-performance REST APIs
- Needing built-in request/response validation with JSON Schema
- Using a plugin system for modular architecture
- When Express performance is insufficient

## Instructions

1. **Basic Fastify server:**

```typescript
import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => ({ status: 'ok' }));

await fastify.listen({ port: 3000, host: '0.0.0.0' });
```

2. **Schema-based validation** (auto-generates docs and validates):

```typescript
const createUserSchema = {
  body: {
    type: 'object',
    required: ['name', 'email'],
    properties: {
      name: { type: 'string', minLength: 1 },
      email: { type: 'string', format: 'email' },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
      },
    },
  },
} as const;

fastify.post('/users', { schema: createUserSchema }, async (request, reply) => {
  const user = await createUser(request.body);
  reply.status(201).send(user);
});
```

3. **Type-safe routes with TypeBox:**

```typescript
import { Type, Static } from '@sinclair/typebox';

const CreateUserBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  email: Type.String({ format: 'email' }),
});

type CreateUserBody = Static<typeof CreateUserBody>;

fastify.post<{ Body: CreateUserBody }>(
  '/users',
  {
    schema: { body: CreateUserBody },
  },
  async (request) => {
    const { name, email } = request.body; // Fully typed
    return createUser({ name, email });
  }
);
```

4. **Plugins** for modular architecture:

```typescript
import fp from 'fastify-plugin';

// db.ts — database plugin
export default fp(async (fastify) => {
  const db = await connectDatabase();
  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await db.disconnect();
  });
});

// Register plugins
await fastify.register(import('./plugins/db'));
await fastify.register(import('./routes/users'), { prefix: '/api/users' });
```

5. **Route plugins:**

```typescript
// routes/users.ts
import { FastifyPluginAsync } from 'fastify';

const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => {
    return fastify.db.user.findMany();
  });

  fastify.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const user = await fastify.db.user.findUnique({ where: { id } });
    if (!user) throw fastify.httpErrors.notFound('User not found');
    return user;
  });
};

export default userRoutes;
```

6. **Hooks** for cross-cutting concerns:

```typescript
// Authentication hook
fastify.addHook('preHandler', async (request, reply) => {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) throw fastify.httpErrors.unauthorized();
  request.user = await verifyToken(token);
});

// Logging hook
fastify.addHook('onResponse', async (request, reply) => {
  request.log.info({
    url: request.url,
    method: request.method,
    statusCode: reply.statusCode,
    duration: reply.elapsedTime,
  });
});
```

7. **Error handling:**

```typescript
fastify.setErrorHandler((error, request, reply) => {
  request.log.error(error);

  if (error.validation) {
    reply.status(400).send({ errors: error.validation });
    return;
  }

  reply.status(error.statusCode ?? 500).send({
    error: error.message || 'Internal Server Error',
  });
});
```

## Details

Fastify is designed for speed. It uses JSON Schema for validation and serialization, achieving 2-5x higher throughput than Express for JSON APIs.

**Why Fastify is faster:**

- Schema-based serialization compiles JSON stringification to optimized code (using `fast-json-stringify`)
- Schema-based validation uses pre-compiled validators (using `ajv`)
- Encapsulation model avoids middleware overhead
- Built on a radix tree router (faster than Express's regex-based routing)

**Plugin encapsulation:** Fastify plugins run in isolated contexts. Decorators and hooks registered inside a plugin are scoped to that plugin and its children, not the entire application.

**`fp` (fastify-plugin):** Wrapping a plugin with `fp()` breaks encapsulation, making decorators available to the parent scope. Use `fp` for plugins that add shared functionality (database, auth); use regular plugins for routes.

**Trade-offs:**

- JSON Schema validation is fast — but JSON Schema syntax is verbose compared to Zod
- Plugins provide clean architecture — but the encapsulation model can be confusing at first
- TypeBox provides TypeScript inference from schemas — but adds another dependency
- Fastify is faster than Express — but has a smaller ecosystem and community

## Source

https://fastify.dev/docs/latest/
