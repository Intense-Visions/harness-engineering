# GraphQL Subscriptions

> Implement real-time data streaming with GraphQL subscriptions over WebSocket connections

## When to Use

- Pushing live updates to clients (chat messages, notifications, live scores)
- Replacing polling for frequently changing data
- Building collaborative features (shared cursors, live editing)
- Streaming long-running operation progress to the client

## Instructions

1. **Define subscription types in the schema.** Subscriptions are root-level operations alongside Query and Mutation.

```graphql
type Subscription {
  messageAdded(channelId: ID!): Message!
  orderStatusChanged(orderId: ID!): Order!
}

type Message {
  id: ID!
  content: String!
  author: User!
  createdAt: DateTime!
}
```

2. **Use `graphql-ws` for the WebSocket transport.** The older `subscriptions-transport-ws` is unmaintained. `graphql-ws` implements the GraphQL over WebSocket protocol correctly with proper connection lifecycle handling.

```bash
npm install graphql-ws ws
```

3. **Set up the WebSocket server alongside your HTTP server.**

```typescript
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';

const schema = makeExecutableSchema({ typeDefs, resolvers });
const httpServer = createServer(app);

const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
});

const serverCleanup = useServer(
  {
    schema,
    context: async (ctx) => {
      const token = ctx.connectionParams?.authToken;
      return { currentUser: await authenticate(token as string) };
    },
  },
  wsServer
);

const server = new ApolloServer({
  schema,
  plugins: [
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});
```

4. **Implement a PubSub system for publishing events.** Use an in-memory PubSub for development and a distributed backend (Redis, Kafka) for production.

```typescript
import { PubSub } from 'graphql-subscriptions';

// Development only — in-memory, single-process
const pubsub = new PubSub();

// Production — use Redis-backed PubSub
import { RedisPubSub } from 'graphql-redis-subscriptions';
const pubsub = new RedisPubSub({
  connection: { host: 'redis', port: 6379 },
});
```

5. **Write subscription resolvers with `subscribe` and optional `resolve`.** The `subscribe` function returns an AsyncIterator. The `resolve` function transforms the published payload before sending to the client.

```typescript
const resolvers = {
  Subscription: {
    messageAdded: {
      subscribe: (_parent, { channelId }, { pubsub }) => {
        return pubsub.asyncIterator(`MESSAGE_ADDED.${channelId}`);
      },
      resolve: (payload) => payload.messageAdded,
    },
  },
  Mutation: {
    sendMessage: async (_parent, { input }, { pubsub, dataSources }) => {
      const message = await dataSources.messages.create(input);
      await pubsub.publish(`MESSAGE_ADDED.${input.channelId}`, {
        messageAdded: message,
      });
      return message;
    },
  },
};
```

6. **Filter subscriptions with `withFilter`.** Only push events that match the subscriber's criteria — do not send all events and let the client discard irrelevant ones.

```typescript
import { withFilter } from 'graphql-subscriptions';

const resolvers = {
  Subscription: {
    orderStatusChanged: {
      subscribe: withFilter(
        () => pubsub.asyncIterator('ORDER_STATUS_CHANGED'),
        (payload, variables) => payload.orderStatusChanged.id === variables.orderId
      ),
    },
  },
};
```

7. **Authenticate on the WebSocket connection, not per message.** Extract the auth token from `connectionParams` during the initial WebSocket handshake. Reject unauthenticated connections in the `onConnect` handler.

8. **Handle client-side subscriptions with `useSubscription` or `subscribeToMore`.**

```typescript
// Standalone subscription
const { data } = useSubscription(MESSAGE_ADDED, {
  variables: { channelId },
});

// Augment an existing query with live updates
const { subscribeToMore, data } = useQuery(GET_MESSAGES, { variables: { channelId } });

useEffect(() => {
  return subscribeToMore({
    document: MESSAGE_ADDED,
    variables: { channelId },
    updateQuery: (prev, { subscriptionData }) => ({
      messages: [...prev.messages, subscriptionData.data.messageAdded],
    }),
  });
}, [channelId, subscribeToMore]);
```

## Details

**In-memory PubSub limitations:** The default `PubSub` from `graphql-subscriptions` works only within a single Node.js process. In a multi-instance deployment, subscribers on one instance will not receive events published by another. Use Redis, Kafka, or Google PubSub for production.

**Connection lifecycle:** `graphql-ws` supports `onConnect` (authentication, rate limiting), `onDisconnect` (cleanup), and `onSubscribe` (per-subscription validation). Use these hooks for access control.

**Scaling considerations:**

- Each active subscription holds an open WebSocket connection — plan for connection limits
- Use Redis PubSub for horizontal scaling across server instances
- Consider connection pooling and heartbeat intervals to detect stale connections
- Load balancers must support WebSocket upgrade (sticky sessions or Layer 4 balancing)

**Alternatives to subscriptions:**

- Server-Sent Events (SSE) for one-way streaming without WebSocket infrastructure
- `@defer` and `@stream` directives for incremental delivery of query results (experimental)
- Polling with `cache-and-network` for simple cases with moderate freshness needs

## Source

https://the-guild.dev/graphql/ws

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
