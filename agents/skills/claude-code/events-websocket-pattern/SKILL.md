# Events: WebSocket Pattern

> Implement bidirectional real-time communication using WebSocket protocol and Socket.io.

## When to Use

- You need real-time, bidirectional communication between server and client
- Chat, collaborative editing, live dashboards, multiplayer games, live order tracking
- The client needs to push data to the server frequently (not just receive)
- You need low-latency updates without polling
- Use SSE instead if communication is one-way (server → client only)

## Instructions

**Native WebSocket server (ws library):**

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

const wss = new WebSocketServer({ port: 8080 });

// Message types for type safety
type ClientMessage =
  | { type: 'join_room'; roomId: string }
  | { type: 'leave_room'; roomId: string }
  | { type: 'send_message'; roomId: string; content: string };

type ServerMessage =
  | { type: 'message'; roomId: string; userId: string; content: string; timestamp: string }
  | { type: 'user_joined'; roomId: string; userId: string }
  | { type: 'error'; message: string };

// Room management
const rooms = new Map<string, Set<AuthenticatedWebSocket>>();

wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
  // Authenticate via token in query string or header
  const token = new URL(req.url!, 'ws://localhost').searchParams.get('token');
  const userId = verifyToken(token);
  if (!userId) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  ws.userId = userId;
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  }); // heartbeat response

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMessage;
      handleMessage(ws, msg);
    } catch (err) {
      sendToClient(ws, { type: 'error', message: 'Invalid JSON' });
    }
  });

  ws.on('close', () => {
    // Remove from all rooms
    for (const [roomId, members] of rooms) {
      members.delete(ws);
      if (members.size === 0) rooms.delete(roomId);
    }
  });
});

function handleMessage(ws: AuthenticatedWebSocket, msg: ClientMessage): void {
  switch (msg.type) {
    case 'join_room': {
      if (!rooms.has(msg.roomId)) rooms.set(msg.roomId, new Set());
      rooms.get(msg.roomId)!.add(ws);
      broadcast(msg.roomId, { type: 'user_joined', roomId: msg.roomId, userId: ws.userId! }, ws);
      break;
    }
    case 'send_message': {
      const message = {
        type: 'message' as const,
        roomId: msg.roomId,
        userId: ws.userId!,
        content: msg.content,
        timestamp: new Date().toISOString(),
      };
      broadcast(msg.roomId, message);
      break;
    }
  }
}

function broadcast(roomId: string, msg: ServerMessage, exclude?: WebSocket): void {
  const members = rooms.get(roomId) ?? new Set();
  for (const client of members) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      sendToClient(client, msg);
    }
  }
}

function sendToClient(ws: WebSocket, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

// Heartbeat to detect stale connections
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws: AuthenticatedWebSocket) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));
```

**Socket.io for rooms and namespaces:**

```typescript
import { Server, Socket } from 'socket.io';
import { createServer } from 'http';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: 'https://app.example.com', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

// Namespace for notifications
const notifNs = io.of('/notifications');

notifNs.use(async (socket: Socket, next) => {
  // Middleware for auth
  const token = socket.handshake.auth.token;
  const userId = await verifyToken(token);
  if (!userId) {
    next(new Error('Unauthorized'));
    return;
  }
  socket.data.userId = userId;
  next();
});

notifNs.on('connection', (socket: Socket) => {
  const userId = socket.data.userId as string;

  // Join user's personal room
  socket.join(`user:${userId}`);

  socket.on('disconnect', () => {
    console.log(`User ${userId} disconnected`);
  });
});

// Push notification from server to specific user
async function pushNotification(userId: string, notification: Notification): Promise<void> {
  notifNs.to(`user:${userId}`).emit('notification', notification);
}
```

**Client-side with reconnection:**

```typescript
class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  connect(url: string): void {
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      console.log('Connected');
    });

    this.ws.addEventListener('close', (event) => {
      if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000); // exp backoff
        setTimeout(() => {
          this.reconnectAttempts++;
          this.connect(url);
        }, delay);
      }
    });

    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      this.handleMessage(msg);
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(msg: ServerMessage): void {
    /* ... */
  }
}
```

## Details

**Horizontal scaling:** WebSocket connections are stateful and server-bound. To scale, use Redis adapter for Socket.io or a message broker to route cross-server messages:

```typescript
import { createAdapter } from '@socket.io/redis-adapter';
const pubClient = new Redis(REDIS_URL);
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
```

**Anti-patterns:**

- No heartbeat/ping-pong — dead connections accumulate silently
- Broadcasting to all clients instead of relevant rooms — O(n) sends for irrelevant messages
- No auth on the WebSocket upgrade — anyone can connect

**WebSocket vs. SSE:** WebSocket is bidirectional (client ↔ server). SSE is server→client only. Prefer SSE for live feeds where the client only reads. Use WebSocket for interactive features.

## Source

socket.io/docs/v4/
