# Events: SSE Pattern

> Stream one-way server events to browsers using Server-Sent Events and EventSource.

## When to Use

- You need to push real-time updates from server to browser (one-way: server → client only)
- Live notifications, activity feeds, progress indicators, live scores, stock tickers
- You want auto-reconnect behavior built into the browser for free
- You prefer HTTP/1.1 compatibility over WebSocket's upgrade handshake
- NOT when the client needs to push data back to the server — use WebSocket for bidirectional communication

## Instructions

**Express SSE endpoint:**

```typescript
import express, { Request, Response } from 'express';

const app = express();

// SSE connection handler
app.get('/events', (req: Request, res: Response) => {
  // Required headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders(); // send headers immediately

  // Send a comment every 30s to keep the connection alive through proxies
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 30_000);

  // Helper to send typed events
  const send = (eventType: string, data: unknown, id?: string): void => {
    if (id) res.write(`id: ${id}\n`);
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial state
  send('connected', { timestamp: new Date().toISOString() });

  // Register this client for notifications
  const userId = req.query.userId as string;
  const clientId = addClient(userId, send);

  // Clean up when client disconnects
  req.on('close', () => {
    clearInterval(keepAlive);
    removeClient(clientId);
    console.log(`SSE client ${clientId} disconnected`);
  });
});

// Client registry
type SendFn = (event: string, data: unknown, id?: string) => void;
const clients = new Map<string, { userId: string; send: SendFn }>();

function addClient(userId: string, send: SendFn): string {
  const clientId = crypto.randomUUID();
  clients.set(clientId, { userId, send });
  return clientId;
}

function removeClient(clientId: string): void {
  clients.delete(clientId);
}

// Push notification to a specific user's SSE streams
function pushToUser(userId: string, event: string, data: unknown): void {
  for (const [, client] of clients) {
    if (client.userId === userId) {
      client.send(event, data, crypto.randomUUID());
    }
  }
}

// Broadcast to all connected clients
function broadcast(event: string, data: unknown): void {
  for (const [, client] of clients) {
    client.send(event, data);
  }
}

// Trigger from anywhere in your application
pushToUser('user-123', 'notification', {
  title: 'Your order shipped',
  message: 'Order #456 is on its way',
  timestamp: new Date().toISOString(),
});
```

**SSE with Last-Event-ID for resumption:**

```typescript
app.get('/events/feed', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Resume from last seen event ID (browser sends automatically on reconnect)
  const lastEventId = req.headers['last-event-id'] as string | undefined;

  if (lastEventId) {
    // Replay missed events
    const missed = await db.events.findMany({
      where: { id: { gt: lastEventId }, userId: req.user.id },
      orderBy: { id: 'asc' },
      take: 100,
    });

    for (const event of missed) {
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    }
  }

  // Continue real-time stream...
});
```

**Browser client:**

```typescript
// Browser — EventSource handles reconnection automatically
const es = new EventSource('/events?userId=user-123');

es.addEventListener('notification', (event: MessageEvent) => {
  const data = JSON.parse(event.data);
  showNotification(data.title, data.message);
});

es.addEventListener('order.updated', (event: MessageEvent) => {
  const data = JSON.parse(event.data);
  updateOrderStatus(data.orderId, data.status);
});

es.addEventListener('error', (event) => {
  console.error('SSE error — browser will retry automatically');
});

// EventSource reconnects automatically on disconnect
// It sends Last-Event-Id header to resume from where it left off

// Cleanup
function disconnect(): void {
  es.close();
}
```

## Details

**SSE protocol format:**

```
id: <unique-event-id>\n
event: <event-type>\n
data: <json-string>\n
\n                     ← blank line terminates the event
```

**Auto-reconnect:** Browser's EventSource retries after 3 seconds by default. Set custom retry interval:

```
retry: 5000\n
\n
```

**Anti-patterns:**

- Sending large payloads via SSE — SSE is for small notifications, not binary data transfers
- Not setting `X-Accel-Buffering: no` — nginx buffers SSE responses, breaking the stream
- No keep-alive — many proxies close idle connections after 30-60 seconds

**Scaling SSE:** SSE connections are long-lived HTTP connections. Each connection holds a socket on the server. Use Redis pub/sub to distribute events across multiple server instances:

```typescript
// When running multiple Node instances
const redisSub = new Redis(REDIS_URL);
redisSub.subscribe('push.events');
redisSub.on('message', (_channel, message) => {
  const { userId, event, data } = JSON.parse(message);
  pushToUser(userId, event, data); // push to local clients only
});

// Publisher (any service instance)
const redisPub = new Redis(REDIS_URL);
await redisPub.publish('push.events', JSON.stringify({ userId, event: 'notification', data }));
```

**SSE vs. WebSocket comparison:**
| | SSE | WebSocket |
|---|---|---|
| Direction | Server → Client | Bidirectional |
| Protocol | HTTP | WS upgrade |
| Auto-reconnect | Yes (built-in) | Manual |
| Browser support | Excellent | Excellent |
| Proxy support | Better (HTTP) | Variable |

## Source

html.spec.whatwg.org/multipage/server-sent-events.html
