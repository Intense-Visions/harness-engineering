# Node.js HTTP Server

> Build low-level HTTP servers with Node.js http module and middleware pattern

## When to Use

- Building a simple HTTP server without a framework
- Understanding how frameworks like Express build on Node.js HTTP primitives
- Creating lightweight microservices or health check endpoints
- Handling raw HTTP requests and responses

## Instructions

1. **Basic HTTP server:**

```typescript
import { createServer, IncomingMessage, ServerResponse } from 'node:http';

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Hello, world!' }));
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

2. **Route handling:**

```typescript
const server = createServer((req, res) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/users') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(users));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});
```

3. **Parse request body:**

```typescript
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Usage in handler
if (req.method === 'POST' && url.pathname === '/api/users') {
  const body = await parseBody(req);
  // process body...
}
```

4. **Simple middleware pattern:**

```typescript
type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

function compose(...handlers: Handler[]) {
  return (req: IncomingMessage, res: ServerResponse) => {
    let i = 0;
    function next() {
      if (i < handlers.length) handlers[i++](req, res, next);
    }
    next();
  };
}

const logger: Handler = (req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
};

const cors: Handler = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
};

const server = createServer(compose(logger, cors, router));
```

5. **Graceful shutdown:**

```typescript
const server = createServer(handler);
server.listen(3000);

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server shut down gracefully');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
});
```

## Details

The `node:http` module provides the lowest-level HTTP handling in Node.js. Frameworks like Express, Fastify, and Hono build on top of it.

**`IncomingMessage`** is a Readable stream. The request body is not buffered automatically — you must consume the stream manually. This is by design for memory efficiency with large uploads.

**`ServerResponse`** is a Writable stream. Calling `res.end()` finishes the response. Calling `res.write()` before `res.end()` enables streaming responses.

**Keep-alive:** Node.js HTTP server keeps connections alive by default (HTTP/1.1). Set `server.keepAliveTimeout` to control how long idle connections stay open.

**Trade-offs:**

- Raw `http` module gives full control — but lacks routing, middleware, and body parsing that frameworks provide
- No dependencies — but you build everything yourself (JSON parsing, error handling, CORS)
- Good for understanding HTTP fundamentals — but use Express or Fastify for production applications

## Source

https://nodejs.org/api/http.html

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
