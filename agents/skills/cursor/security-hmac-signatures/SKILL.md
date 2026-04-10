# HMAC and Digital Signatures

> HMAC proves a message was created by someone with the shared secret; digital signatures prove it was created by a specific private key holder -- choose based on whether you need symmetric verification or non-repudiation

## When to Use

- Verifying webhook payloads from third-party services (Stripe, GitHub, Slack)
- Signing JWTs and choosing between HS256 and RS256/ES256
- Authenticating API requests between internal services
- Signing software artifacts, commits, or release packages
- Designing a system that requires non-repudiation (proving who did what)
- Implementing message integrity checks on data in transit or at rest

## Threat Context

Message authentication failures enable man-in-the-middle tampering, webhook forgery, and API request replay. The 2022 Heroku/GitHub OAuth token theft exploited stolen HMAC secrets to forge session tokens. Weak HMAC implementations using plain SHA-256 instead of HMAC-SHA-256 are vulnerable to length extension attacks.

JWT libraries that accept `alg: none` or allow algorithm confusion (treating an RSA public key as an HMAC secret) have caused authentication bypasses in Auth0 (2015), Okta, and countless custom implementations. The PlayStation 3 code signing was broken in 2010 because Sony reused the same ECDSA nonce for every signature -- a single nonce reuse leaks the private key entirely. The 2014 OpenSSL Heartbleed bug exposed private signing keys from server memory, enabling signature forgery for any service using the compromised keys.

## Instructions

1. **Understand the core distinction.** HMAC uses a shared symmetric key -- both the signer and verifier possess the same secret. Digital signatures use an asymmetric key pair -- only the private key holder can sign, but anyone with the public key can verify. HMAC provides authentication (who sent this?) and integrity (was it modified?). Digital signatures additionally provide non-repudiation (the signer cannot deny signing). Choose HMAC for internal service communication where both parties are trusted. Choose digital signatures when the verifier should not be able to forge signatures.

2. **Use HMAC for symmetric trust relationships.** When both parties share a secret (webhook provider and your server, two internal microservices), HMAC-SHA-256 is the standard choice. Compute: `HMAC(key, message)` and compare using constant-time comparison. Never use string equality (`==`) -- timing side channels leak information about the correct MAC byte by byte, allowing an attacker to reconstruct the correct value over thousands of requests by measuring response time differences.

3. **Use digital signatures when the verifier should not be able to sign.** When the signer and verifier are different trust domains (package signing where users verify, JWT issuance where resource servers verify, code signing), use asymmetric signatures. Recommended algorithms in priority order:
   - **Ed25519:** Fast, small signatures (64 bytes), no configuration pitfalls, deterministic nonce (eliminates nonce-reuse attacks). Preferred for all new systems.
   - **ECDSA with P-256:** Widely supported, NIST approved, but requires cryptographically secure random nonce generation -- nonce reuse leaks the private key.
   - **RSA-PSS with 2048+ bit keys:** Legacy compatibility, larger signatures (256 bytes for RSA-2048). Use PSS padding, not PKCS#1 v1.5 (vulnerable to Bleichenbacher's padding oracle attack).

4. **Prevent algorithm confusion.** In JWT systems, always validate the `alg` header server-side against an allowlist. Never let the token specify which algorithm to use. The classic JWT vulnerability: the server expects RS256 (asymmetric) but the attacker sends a token with `alg: HS256` and uses the RSA public key (which is public knowledge) as the HMAC secret. The server's JWT library treats the public key as an HMAC key and validates the forged token successfully.

5. **Include anti-replay mechanisms.** HMAC and signatures prove integrity and origin but not freshness. Add a timestamp or nonce to the signed payload and reject messages older than a threshold (e.g., 5 minutes). For critical operations, store seen nonces in a cache and reject duplicates within the validity window. Without anti-replay protection, a captured valid request can be replayed indefinitely.

6. **Rotate keys on a schedule.** HMAC secrets and signing keys must have rotation schedules. Support multiple active keys during rotation: verify against both old and new keys for a transition period, sign only with the new key. For digital signature keys, publish rotation via JWKS endpoints with key IDs (`kid`). Automate rotation -- manual key rotation is skipped under pressure and creates permanent single points of failure.

## Details

### HMAC Internals and Why Plain Hash-Concat Is Insecure

HMAC-SHA-256 computes:

```
HMAC(K, m) = SHA-256((K' XOR opad) || SHA-256((K' XOR ipad) || m))
```

Where `K'` is the key padded to the hash block size (64 bytes for SHA-256), `ipad` is `0x36` repeated to the block size, and `opad` is `0x5c` repeated to the block size. This nested construction is specifically designed to prevent length extension attacks.

**Why `SHA-256(key || message)` is insecure:** SHA-256 uses the Merkle-Damgard construction, which processes input in blocks and exposes the internal state as the final hash output. An attacker who sees `H = SHA-256(key || message)` can use `H` as the starting state and continue hashing to compute `SHA-256(key || message || padding || attacker_data)` without knowing the key. This enables message forgery by appending arbitrary data and computing a valid MAC for the extended message.

**Why `SHA-256(message || key)` is also insecure:** This construction is vulnerable to collision attacks. If the attacker finds two messages `m1` and `m2` where `SHA-256(m1) == SHA-256(m2)` (a collision in the intermediate state), then `SHA-256(m1 || key) == SHA-256(m2 || key)` regardless of the key value. The key cannot differentiate messages that already collide.

**Why HMAC is secure:** The nested structure uses two different derived keys (via XOR with ipad and opad). The inner hash produces an intermediate result that is then re-hashed with the outer key. This breaks both the length extension property (the outer hash re-initializes the state) and the collision transferability (the two hashing stages use different keys).

Note: SHA-3 (Keccak) is not vulnerable to length extension attacks due to its sponge construction. `SHA3-256(key || message)` is safe, but using HMAC-SHA3-256 is still recommended for consistency and defense in depth.

### Signature Scheme Comparison

| Property           | HMAC-SHA-256                   | RSA-2048 PSS                 | ECDSA P-256                   | Ed25519               |
| ------------------ | ------------------------------ | ---------------------------- | ----------------------------- | --------------------- |
| Key type           | Symmetric (shared)             | Asymmetric (pub/priv)        | Asymmetric (pub/priv)         | Asymmetric (pub/priv) |
| Key size           | 256 bits                       | 2048 bits (private)          | 256 bits (private)            | 256 bits (private)    |
| Signature size     | 32 bytes                       | 256 bytes                    | 64 bytes                      | 64 bytes              |
| Signing speed      | Very fast                      | Slow                         | Fast                          | Very fast             |
| Verification speed | Very fast                      | Fast                         | Moderate                      | Fast                  |
| Non-repudiation    | No                             | Yes                          | Yes                           | Yes                   |
| Nonce requirement  | None                           | None (PSS internal)          | Critical (reuse = key leak)   | Deterministic (safe)  |
| Primary pitfall    | Timing side channel on compare | Padding oracle (PKCS#1 v1.5) | Nonce reuse leaks private key | Few known pitfalls    |

Ed25519 is the recommended default for new systems. Its deterministic nonce generation eliminates the ECDSA nonce-reuse vulnerability that broke the PlayStation 3 code signing (2010) and compromised Bitcoin wallets (2013). RSA remains relevant for legacy interoperability but produces larger signatures and slower signing.

### Webhook Verification Worked Example

When receiving a webhook POST with an `X-Signature` header:

1. **Extract the raw request body as bytes** -- before JSON parsing, because parsing may reorder object keys, change whitespace, or normalize Unicode, producing a different byte sequence than what was signed. Most web frameworks provide access to the raw body (`req.rawBody` in Express with appropriate middleware, `request.body` read as bytes in Flask).

2. **Compute HMAC-SHA-256** using the shared secret from the webhook provider: `HMAC-SHA-256(webhook_secret, raw_body)`.

3. **Encode the result** in the format the provider uses (typically hex or base64). Match the provider's encoding exactly.

4. **Compare with the header value using constant-time comparison.** In Node.js: `crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(received))`. In Python: `hmac.compare_digest(computed, received)`. In Go: `subtle.ConstantTimeCompare([]byte(computed), []byte(received))`.

The timing attack with non-constant comparison: string equality (`===`) compares byte by byte and returns false on the first mismatch. An attacker sends candidate signatures and measures response times. A signature matching the first 10 bytes takes measurably longer to reject than one matching only the first 2 bytes. Over thousands of requests with statistical analysis, the attacker reconstructs the correct signature one byte at a time without knowing the secret. This attack has been demonstrated practically against real web services.

### JWT Algorithm Selection

**HS256 (HMAC-SHA-256):** Appropriate only when the issuer and audience are the same service -- the secret must be shared, meaning both parties can forge tokens. If the secret leaks from any consumer, all consumers are compromised. This is a symmetric trust model identical to HMAC -- both parties hold the signing key.

**RS256 (RSA-SHA-256) or ES256 (ECDSA-SHA-256):** Mandatory when tokens are verified by a different service than the issuer. Only the issuer holds the private key. Resource servers verify with the public key obtained from the JWKS endpoint. Key distribution is simple and safe because public keys are not secret -- they can be published openly.

**EdDSA (Ed25519):** Preferred for new systems. Smallest tokens, fastest verification, no padding oracle risk, and deterministic signatures. Adoption is growing rapidly -- supported by most modern JWT libraries including `jose` (Node.js), `PyJWT` (Python), and `golang-jwt` (Go).

Never allow the JWT `alg` field to control algorithm selection at the server. Configure the expected algorithm on the server and reject tokens using any other algorithm. The default behavior of many older libraries is to trust the `alg` header, which is the root cause of the algorithm confusion attack class.

### Key Rotation in Practice

Key rotation for HMAC secrets and signing keys follows a three-phase lifecycle:

1. **Generation:** Create the new key and deploy it to all verifiers. Verifiers accept both old and new keys. Signers continue using the old key. This is the "dual-read" phase.

2. **Promotion:** Switch signers to the new key. Verifiers still accept both keys to handle in-flight messages signed with the old key. For JWTs, use the `kid` (key ID) header to indicate which key signed the token.

3. **Retirement:** After the maximum validity period of any token signed with the old key has elapsed, remove the old key from all verifiers. Only the new key remains.

For HMAC webhooks, coordinate with the provider's rotation API (Stripe, GitHub, and Slack all support webhook secret rotation with a transition period). For JWKS-based systems, publish both keys in the JWKS endpoint during the transition, each with a unique `kid`.

Automated rotation on a schedule (e.g., every 90 days) prevents key staleness and ensures the rotation process itself is exercised regularly. A rotation mechanism that has never been tested will fail when an emergency rotation is needed.

### Choosing Between HMAC and Digital Signatures

Use this decision framework:

**Choose HMAC-SHA-256 when:**

- Both parties are in the same trust domain (your own microservices)
- You need maximum speed (HMAC is 10-100x faster than asymmetric signatures)
- Key distribution is manageable (shared secret between two parties)
- Non-repudiation is not required (you do not need to prove which specific party signed)
- Webhook verification from a trusted provider

**Choose digital signatures (Ed25519 / ECDSA / RSA) when:**

- The verifier should not be able to create signatures (different trust domains)
- Multiple parties need to verify but only one party should sign
- Non-repudiation is required for legal, audit, or compliance reasons
- Key distribution must be public (JWKS endpoints, public key registries)
- Signing software packages, container images, or code commits
- JWT tokens verified by multiple resource servers

**Choose Macaroons when:**

- You need delegatable, attenuatable bearer tokens
- Authorization decisions span multiple services
- You want to add restrictions without contacting the token issuer
- Third-party caveats are needed for federated authorization

### HMAC Key Size Requirements

The HMAC key should be at least as long as the hash output. For HMAC-SHA-256, use a 256-bit (32-byte) key minimum. Keys shorter than the hash output reduce security margins. Keys longer than the hash block size (512 bits for SHA-256) are hashed first, which does not reduce security but adds unnecessary computation.

Generate HMAC keys from a CSPRNG, never from passwords or human-memorable strings. If a human-memorable input must be used, derive the HMAC key using a KDF (HKDF or PBKDF2) with appropriate parameters.

## Anti-Patterns

1. **Using `SHA-256(secret + message)` instead of HMAC.** Vulnerable to length extension attacks on Merkle-Damgard hash functions. The attacker appends data to the message and computes a valid hash without knowing the secret. Always use the HMAC construction, which is specifically designed to prevent this class of attack.

2. **Comparing MACs with string equality.** Timing side channels allow an attacker to reconstruct the correct MAC byte by byte by measuring response time differences across many requests. Always use constant-time comparison: `crypto.timingSafeEqual` (Node.js), `hmac.compare_digest` (Python), `subtle.ConstantTimeCompare` (Go), `MessageDigest.isEqual` (Java).

3. **Hardcoding HMAC secrets in source code.** Secrets in code end up in version control history (persisting even after deletion), CI logs, error messages, stack traces, and developer laptops. Store HMAC secrets in a secrets manager (Vault, AWS Secrets Manager, GCP Secret Manager) and inject them at runtime via environment variables or sidecar injection.

4. **Allowing JWT `alg: none`.** Some JWT libraries accept unsigned tokens when the algorithm header is `none`. This allows any attacker to forge valid tokens by simply removing the signature and setting the algorithm to none. Always validate the algorithm against a server-side allowlist and reject `none` unconditionally.

5. **No key rotation plan.** A leaked HMAC secret or signing key with no rotation mechanism means: revoking all existing tokens and signatures, coordinating an emergency key change across all consumers, and potentially losing non-repudiation for the entire validity period of the compromised key. Design key rotation from day one with overlapping validity windows. The rotation mechanism itself must be tested regularly.
