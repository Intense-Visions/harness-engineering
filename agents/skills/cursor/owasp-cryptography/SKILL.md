# Cryptography Best Practices

> Apply cryptographic best practices for password hashing, data encryption, digital signing, and key management

## When to Use

- Hashing passwords for storage
- Encrypting sensitive data at rest or in transit
- Generating and verifying digital signatures or HMACs
- Choosing between encryption algorithms
- Managing encryption keys and initialization vectors

## Instructions

1. **Use bcrypt or Argon2 for password hashing.** Never use MD5, SHA-1, or SHA-256 alone for passwords — they are too fast and vulnerable to brute force. Use a purpose-built password hashing function with built-in salting and configurable cost.

```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12; // Adjust for ~250ms hash time on your hardware

async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
```

For higher security requirements, use Argon2id:

```typescript
import argon2 from 'argon2';

async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}
```

2. **Use AES-256-GCM for symmetric encryption.** GCM provides both confidentiality and authenticity (authenticated encryption). Always use a unique IV for every encryption operation.

```typescript
import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits

function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Prepend IV and tag to ciphertext for storage
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(encoded: string, key: Buffer): string {
  const data = Buffer.from(encoded, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}
```

3. **Generate cryptographically secure random values.** Use `crypto.randomBytes()` or `crypto.randomUUID()` — never `Math.random()` for security purposes.

```typescript
import crypto from 'node:crypto';

// Random bytes for keys, IVs, tokens
const token = crypto.randomBytes(32).toString('hex');

// Random UUID
const id = crypto.randomUUID();
```

4. **Use HMAC for data integrity verification.** HMAC combines a hash function with a secret key to produce a message authentication code.

```typescript
function createHmac(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function verifyHmac(data: string, secret: string, expectedMac: string): boolean {
  const computed = createHmac(data, secret);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expectedMac));
}
```

5. **Always use timing-safe comparison for secrets.** Never compare hashes, tokens, or MACs with `===` — it is vulnerable to timing attacks. Use `crypto.timingSafeEqual()`.

```typescript
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

6. **Derive encryption keys from passwords with PBKDF2 or scrypt.** Never use a password directly as an encryption key.

```typescript
function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}
```

7. **Use RSA or Ed25519 for asymmetric operations (signing, key exchange).**

```typescript
// Generate key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

// Sign
const signature = crypto.sign(null, Buffer.from(data), privateKey);

// Verify
const isValid = crypto.verify(null, Buffer.from(data), publicKey, signature);
```

8. **Rotate encryption keys periodically.** Implement key versioning — store the key version with encrypted data so you know which key to use for decryption.

```typescript
interface EncryptedField {
  keyVersion: number;
  ciphertext: string;
}
```

## Details

**Algorithm selection guide:**
| Purpose | Recommended | Avoid |
|---|---|---|
| Password hashing | Argon2id, bcrypt, scrypt | MD5, SHA-\*, plain text |
| Symmetric encryption | AES-256-GCM | AES-ECB, DES, 3DES, RC4 |
| Hashing (non-password) | SHA-256, SHA-3 | MD5, SHA-1 |
| Signing | Ed25519, RSA-PSS (2048+) | RSA-PKCS1v15 |
| Key derivation | scrypt, PBKDF2 (600K+ iterations) | Single-pass hash |
| Random generation | crypto.randomBytes | Math.random |

**Why GCM over CBC:** GCM is an authenticated encryption mode — it detects tampering. CBC requires a separate HMAC step for integrity, and incorrect implementations lead to padding oracle attacks.

**IV/nonce rules:** Never reuse an IV with the same key. For AES-GCM, IV reuse completely breaks security. Generate a random IV for every encrypt call.

**Common mistakes:**

- Using MD5 or SHA-256 for password hashing (too fast, no salting)
- Reusing IVs/nonces with the same key
- Comparing secrets with `===` instead of `timingSafeEqual`
- Hardcoding encryption keys in source code
- Using ECB mode (encrypts identical blocks to identical ciphertext — patterns visible)
- Rolling your own crypto instead of using well-tested libraries

## Source

https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html

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
