# Node.js Crypto Patterns

> Implement hashing, HMAC, signing, encryption, and key derivation with Node.js crypto

## When to Use

- Hashing passwords or data for integrity verification
- Creating HMAC signatures for webhook verification or API authentication
- Encrypting sensitive data at rest
- Generating cryptographically secure random values

## Instructions

1. **Hash data** (SHA-256, SHA-512):

```typescript
import { createHash } from 'node:crypto';

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}
```

2. **HMAC for webhook signature verification:**

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const sig = Buffer.from(signature, 'hex');
  const exp = Buffer.from(expected, 'hex');

  if (sig.length !== exp.length) return false;
  return timingSafeEqual(sig, exp);
}
```

3. **Password hashing** with scrypt (recommended over bcrypt for new projects):

```typescript
import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(':');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
}
```

4. **Generate secure random values:**

```typescript
import { randomBytes, randomUUID, randomInt } from 'node:crypto';

const token = randomBytes(32).toString('hex'); // 64-char hex string
const uuid = randomUUID(); // UUID v4
const pin = randomInt(100000, 999999); // 6-digit number
```

5. **AES-256-GCM encryption** (authenticated encryption):

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encrypt(plaintext: string, key: Buffer): { iv: string; ciphertext: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf-8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return { iv: iv.toString('hex'), ciphertext, tag };
}

function decrypt(encrypted: { iv: string; ciphertext: string; tag: string }, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));

  let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf-8');
  plaintext += decipher.final('utf-8');

  return plaintext;
}
```

6. **Always use `timingSafeEqual`** for comparing secrets to prevent timing attacks:

```typescript
import { timingSafeEqual } from 'node:crypto';

// Both buffers must have the same length
const a = Buffer.from(inputToken, 'hex');
const b = Buffer.from(storedToken, 'hex');
const isValid = a.length === b.length && timingSafeEqual(a, b);
```

## Details

Node.js `crypto` provides cryptographic functions backed by OpenSSL. It supports symmetric encryption, asymmetric encryption, hashing, HMACs, key derivation, and random number generation.

**Algorithm choices:**

- Hashing: SHA-256 for general use, SHA-512 for higher security
- Password hashing: scrypt (built-in), argon2 (install `argon2` package)
- Encryption: AES-256-GCM (authenticated) over AES-256-CBC (unauthenticated)
- HMAC: HMAC-SHA256 for API signatures and webhook verification

**Never use:** MD5 or SHA-1 for security-sensitive operations. They have known collision attacks.

**`timingSafeEqual` is critical.** Regular string comparison (`===`) leaks information about how many bytes match through timing. `timingSafeEqual` takes constant time regardless of how many bytes match.

**Trade-offs:**

- scrypt is built-in — but argon2 is considered stronger and more tunable
- AES-GCM provides authentication — but requires unique IVs per encryption (reuse breaks security)
- `randomBytes` is cryptographically secure — but slower than `Math.random()`. Use `Math.random()` only for non-security purposes

## Source

https://nodejs.org/api/crypto.html

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
