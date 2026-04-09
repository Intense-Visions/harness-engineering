# Node.js Streams Pattern

> Process large data efficiently using Node.js Readable, Writable, and Transform streams

## When to Use

- Processing files or data too large to fit in memory
- Building data pipelines that transform data in stages
- Streaming HTTP responses or file uploads
- Implementing backpressure-aware data processing

## Instructions

1. **Read a file as a stream:**

```typescript
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const readable = createReadStream('large-file.csv', { encoding: 'utf-8' });

for await (const chunk of readable) {
  processChunk(chunk);
}
```

2. **Pipeline for stream composition** (handles errors and cleanup):

```typescript
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

await pipeline(createReadStream('input.json'), createGzip(), createWriteStream('output.json.gz'));
```

3. **Transform stream** for data processing:

```typescript
import { Transform } from 'node:stream';

const uppercase = new Transform({
  transform(chunk, encoding, callback) {
    this.push(chunk.toString().toUpperCase());
    callback();
  },
});

await pipeline(createReadStream('input.txt'), uppercase, createWriteStream('output.txt'));
```

4. **Object mode streams** for JSON processing:

```typescript
import { Transform } from 'node:stream';

const filterActive = new Transform({
  objectMode: true,
  transform(user, encoding, callback) {
    if (user.isActive) this.push(user);
    callback();
  },
});
```

5. **Readable from async generator:**

```typescript
import { Readable } from 'node:stream';

async function* generateRecords() {
  for (let i = 0; i < 1_000_000; i++) {
    yield { id: i, value: Math.random() };
  }
}

const readable = Readable.from(generateRecords());
```

6. **HTTP streaming response:**

```typescript
import { createReadStream } from 'node:fs';

app.get('/download', (req, res) => {
  res.setHeader('Content-Type', 'application/octet-stream');
  const stream = createReadStream('large-file.zip');
  stream.pipe(res);

  stream.on('error', (err) => {
    res.status(500).end('Error reading file');
  });
});
```

7. **Line-by-line processing:**

```typescript
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const rl = createInterface({
  input: createReadStream('data.csv'),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  const [name, email] = line.split(',');
  await processUser({ name, email });
}
```

8. **Always use `pipeline`** instead of `.pipe()` — `pipeline` handles error propagation and cleanup:

```typescript
// Bad: errors not propagated, streams not cleaned up
readable.pipe(transform).pipe(writable);

// Good: errors propagated, streams destroyed on error
await pipeline(readable, transform, writable);
```

## Details

Streams process data in chunks without loading the entire dataset into memory. A 10GB file can be processed with a 64KB buffer.

**Stream types:**

- **Readable** — source of data (file reads, HTTP responses, database cursors)
- **Writable** — destination for data (file writes, HTTP requests, database inserts)
- **Transform** — processes data in transit (compression, encryption, parsing)
- **Duplex** — both readable and writable (network sockets, WebSocket connections)

**Backpressure:** When a writable stream cannot consume data as fast as the readable produces it, Node.js automatically pauses the readable stream. This prevents memory exhaustion. `pipeline` handles backpressure correctly; manual `.pipe()` does not always.

**`highWaterMark`:** Controls the internal buffer size (default 16KB for byte streams, 16 objects for object mode). Lower values reduce memory but increase I/O operations.

**Trade-offs:**

- Streams handle unlimited data sizes — but add complexity compared to simple `readFile`
- `pipeline` handles errors and cleanup — but requires all streams to implement `destroy` correctly
- Object mode is convenient for JSON processing — but disables backpressure optimization (each object is one "chunk")
- Async generators create readable streams easily — but lose backpressure if the generator is compute-bound

## Source

https://nodejs.org/api/stream.html

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
