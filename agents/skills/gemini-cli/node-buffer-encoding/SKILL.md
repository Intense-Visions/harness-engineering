# Node.js Buffer and Encoding

> Handle binary data, encodings, and conversions with Node.js Buffer and TextEncoder

## When to Use

- Working with binary data (file I/O, network protocols, cryptography)
- Converting between strings and binary representations
- Handling different character encodings (UTF-8, Base64, hex)
- Processing binary data from streams or network sockets

## Instructions

1. **Create Buffers:**

```typescript
const fromString = Buffer.from('Hello, world!', 'utf-8');
const fromHex = Buffer.from('48656c6c6f', 'hex');
const fromBase64 = Buffer.from('SGVsbG8=', 'base64');
const allocated = Buffer.alloc(1024); // Zero-filled
const unsafe = Buffer.allocUnsafe(1024); // Uninitialized (faster)
```

2. **Convert between encodings:**

```typescript
const buf = Buffer.from('Hello');

buf.toString('utf-8'); // 'Hello'
buf.toString('hex'); // '48656c6c6f'
buf.toString('base64'); // 'SGVsbG8='
buf.toString('base64url'); // 'SGVsbG8' (URL-safe base64)
```

3. **TextEncoder / TextDecoder** (Web API compatible):

```typescript
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

const encoded = encoder.encode('Hello'); // Uint8Array
const decoded = decoder.decode(encoded); // 'Hello'
```

4. **Buffer operations:**

```typescript
// Concatenate
const combined = Buffer.concat([buf1, buf2, buf3]);

// Slice (shares memory — modifications affect the original)
const slice = buf.subarray(0, 5);

// Copy (independent copy)
const copy = Buffer.from(buf);

// Compare
buf1.equals(buf2); // true/false
Buffer.compare(buf1, buf2); // -1, 0, or 1
```

5. **Read/write numbers:**

```typescript
const buf = Buffer.alloc(8);

buf.writeUInt32BE(0x12345678, 0); // Big-endian at offset 0
buf.writeUInt32LE(0x12345678, 4); // Little-endian at offset 4

const val = buf.readUInt32BE(0); // 0x12345678
```

6. **Base64 encoding/decoding for APIs:**

```typescript
function toBase64(data: string): string {
  return Buffer.from(data, 'utf-8').toString('base64');
}

function fromBase64(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

// URL-safe base64
function toBase64Url(data: string): string {
  return Buffer.from(data).toString('base64url');
}
```

7. **Typed arrays interop:**

```typescript
const buffer = Buffer.from([1, 2, 3, 4]);
const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

// Buffer IS a Uint8Array subclass
buffer instanceof Uint8Array; // true
```

## Details

`Buffer` is Node.js's primary type for handling binary data. It is a subclass of `Uint8Array` with additional methods for encoding conversion and binary manipulation.

**Encoding options:** `utf-8` (default), `ascii`, `latin1`, `binary`, `hex`, `base64`, `base64url`, `ucs-2`/`utf-16le`.

**Buffer vs Uint8Array:** `Buffer` extends `Uint8Array` but adds Node.js-specific methods (`toString(encoding)`, `write()`, `readInt32BE()`). Web APIs use `Uint8Array`; Node.js APIs accept both.

**Memory considerations:**

- `Buffer.alloc(n)` — zero-filled, safe, slightly slower
- `Buffer.allocUnsafe(n)` — may contain old memory data, faster. Only use when you will overwrite all bytes
- `Buffer.from(array)` — allocates new memory and copies data

**Trade-offs:**

- Buffer is zero-copy with `subarray` — but mutations affect the original (use `Buffer.from(buf)` for independent copies)
- `allocUnsafe` is faster — but can leak sensitive data if not fully overwritten
- Buffer methods are Node.js specific — use TextEncoder/TextDecoder for cross-platform code

## Source

https://nodejs.org/api/buffer.html

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
