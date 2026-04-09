# GraphQL Apollo Server

> Configure and run Apollo Server with plugins, context, data sources, and framework integrations

## When to Use

- Setting up a new GraphQL API with Apollo Server 4
- Integrating Apollo Server with Express, Fastify, or standalone
- Configuring authentication, logging, or caching via plugins
- Migrating from Apollo Server 3 to 4
- Connecting Apollo Server to Apollo Studio for monitoring

## Instructions

1. **Use Apollo Server 4 with your framework integration.** AS4 is framework-agnostic. Use `@apollo/server` with the appropriate integration package.

```typescript
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import express from 'express';
import cors from 'cors';

const app = express();
const server = new ApolloServer({ typeDefs, resolvers });

await server.start();

app.use(
  '/graphql',
  cors(),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req }) => ({
      currentUser: await authenticate(req.headers.authorization),
    }),
  })
);

app.listen(4000);
```

2. **Build the context object in the integration, not in `ApolloServer`.** AS4 moved context creation to the framework integration layer. The `context` function receives the framework-specific request object.

3. **Use plugins for cross-cutting concerns.** Plugins hook into the request lifecycle — use them for logging, APM, caching, and error tracking instead of middleware.

```typescript
const loggingPlugin: ApolloServerPlugin<Context> = {
  async requestDidStart({ request }) {
    const start = Date.now();
    return {
      async willSendResponse({ response }) {
        const duration = Date.now() - start;
        logger.info({ operationName: request.operationName, duration });
      },
      async didEncounterErrors({ errors }) {
        errors.forEach((err) => logger.error(err));
      },
    };
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [loggingPlugin],
});
```

4. **Disable introspection and the landing page in production.** Introspection exposes your full schema; the landing page (Apollo Sandbox) should not be available in production.

```typescript
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: process.env.NODE_ENV !== 'production',
  plugins: [
    process.env.NODE_ENV === 'production'
      ? ApolloServerPluginLandingPageDisabled()
      : ApolloServerPluginLandingPageLocalDefault(),
  ],
});
```

5. **Implement data sources as classes injected via context.** Encapsulate database or API access in data source classes. Create new instances per request to ensure isolation.

```typescript
class UserDataSource {
  constructor(
    private db: Database,
    private loader: DataLoader<string, User>
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.loader.load(id);
  }

  async create(input: CreateUserInput): Promise<User> {
    const user = await this.db.users.insert(input);
    this.loader.prime(user.id, user);
    return user;
  }
}
```

6. **Use `formatError` to sanitize errors before sending to clients.** Strip stack traces, internal messages, and sensitive data from error responses in production.

```typescript
const server = new ApolloServer({
  typeDefs,
  resolvers,
  formatError: (formattedError, error) => {
    if (process.env.NODE_ENV === 'production') {
      delete formattedError.extensions?.stacktrace;
    }
    return formattedError;
  },
});
```

7. **Call `server.start()` before applying middleware.** AS4 requires explicit startup. This validates the schema and initializes plugins before the server accepts requests.

8. **Use `server.stop()` for graceful shutdown.** Hook into process signals to drain in-flight requests before exiting.

```typescript
const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

## Details

**Apollo Server 3 to 4 migration:** AS4 removes `apollo-server-express` in favor of `@apollo/server` + `expressMiddleware`. The constructor no longer accepts `context` — pass it to the integration. `dataSources` config is removed — create data sources in the context function. `plugins` and `formatError` remain on the constructor.

**Plugin lifecycle hooks:** `serverWillStart`, `requestDidStart` (returns per-request hooks: `didResolveSource`, `didResolveOperation`, `responseForOperation`, `executionDidStart`, `willSendResponse`, `didEncounterErrors`). Use the most specific hook for your use case.

**Performance tuning:**

- Enable automatic persisted queries (APQ) to reduce request payload size
- Use response caching plugin with `@cacheControl` directives for CDN-level caching
- Set `allowBatchedHttpRequests: true` for client-side query batching

**Health checks:** AS4 does not include a built-in health check endpoint. Add one in your framework layer: `app.get('/health', (_, res) => res.sendStatus(200))`.

**CSRF prevention:** AS4 includes CSRF prevention by default — it requires a non-empty `Content-Type` header or a custom header like `Apollo-Require-Preflight`. Do not disable this in production.

## Source

https://www.apollographql.com/docs/apollo-server/

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
