# tRPC: Subscriptions

> Stream real-time events to clients over WebSocket using tRPC subscriptions and observables

## When to Use

- Pushing real-time updates (notifications, live cursors, chat messages) from server to client
- Replacing polling with server-push for lower latency and reduced server load
- Building collaborative features where multiple clients observe the same resource
- Streaming long-running operation progress back to the client

## Instructions

1. Define subscriptions with `.subscription(handler)` — the handler must return an `observable` or async generator.
2. Set up a separate WebSocket server using `@trpc/server/adapters/ws` alongside the HTTP server.
3. Use `applyWSSHandler` to attach the tRPC router to the WebSocket server.
4. Configure the tRPC client with `wsLink` (for WebSocket-only) or `splitLink` (HTTP for queries/mutations, WebSocket for subscriptions).
5. Use an `EventEmitter` on the server to broadcast events — emit from mutations, receive in subscriptions.
6. Use `observable(({ next, complete, error }) => { ... })` to manually control the subscription lifecycle.
7. Clean up resources (event listener removal, interval clearing) in the `unsubscribe` cleanup function returned from the observable.

```typescript
// server/trpc.ts — observable import
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';

// Shared event emitter — in production, use Redis pub/sub for multi-instance
export const postEvents = new EventEmitter();

// server/routers/posts.ts — subscription procedure
export const postsRouter = router({
  // Mutation that emits events
  create: protectedProcedure.input(createPostSchema).mutation(async ({ ctx, input }) => {
    const post = await ctx.db.post.create({ data: { ...input, authorId: ctx.user.id } });
    postEvents.emit('post:created', post); // broadcast to subscribers
    return post;
  }),

  // Subscription — streams new posts to connected clients
  onNewPost: publicProcedure.subscription(() => {
    return observable<Post>(({ next, complete }) => {
      const handler = (post: Post) => next(post);
      postEvents.on('post:created', handler);
      // Return cleanup — called when client unsubscribes
      return () => postEvents.off('post:created', handler);
    });
  }),
});

// server/index.ts — WebSocket server alongside HTTP
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';

const httpServer = createHTTPServer({ router: appRouter, createContext });
const wss = new WebSocketServer({ port: 3001 });
applyWSSHandler({ wss, router: appRouter, createContext });

httpServer.listen(3000);

// client/trpc.ts — split link for HTTP + WebSocket
import { createTRPCClient, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import { createWSClient } from '@trpc/client';

const wsClient = createWSClient({ url: 'ws://localhost:3001' });

export const client = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({ client: wsClient }),
      false: httpBatchLink({ url: 'http://localhost:3000' }),
    }),
  ],
});

// React component — subscribing to events
api.posts.onNewPost.useSubscription(undefined, {
  onData: (post) => {
    setPosts((prev) => [post, ...prev]);
  },
  onError: (err) => console.error('Subscription error:', err),
});
```

## Details

tRPC subscriptions use the observable pattern (similar to RxJS but lightweight) to push data from server to client. The server emits values via `next()`, and the client receives them in the `onData` callback.

**WebSocket server setup:** tRPC subscriptions require a WebSocket transport. In Next.js, this means running a custom server (not the built-in `next start`) or using a separate WebSocket service. Vercel Serverless does not support persistent WebSocket connections — use Vercel's Ably integration or a separate WebSocket service.

**EventEmitter for single-process:** An in-memory `EventEmitter` works for single-process applications. For multi-instance deployments (multiple server instances), use Redis pub/sub or a message broker so events from one instance reach subscribers on all instances.

**`splitLink` pattern:** Queries and mutations use HTTP (stateless, cacheable, compatible with CDNs). Subscriptions use WebSocket (persistent, stateful). `splitLink` routes each operation type to the correct transport automatically.

**Async generator alternative:** Instead of `observable`, use an async generator function as the subscription handler. The generator `yield`s values, and the tRPC runtime adapts them to the observable protocol. This is simpler for sequential event streams without custom cleanup logic.

**Authentication in subscriptions:** The `createContext` function for the WebSocket handler receives the WebSocket upgrade request — read auth cookies or tokens from the handshake headers. tRPC's middleware runs on each subscription start.

## Source

https://trpc.io/docs/subscriptions
