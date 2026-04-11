# Cryptographic Randomness

> Every session token, encryption key, nonce, and CSRF token depends on unpredictable randomness -- use a CSPRNG or accept that attackers will predict your secrets

## When to Use

- Generating session tokens, API keys, CSRF tokens, or password reset tokens
- Creating initialization vectors (IVs) or nonces for encryption
- Generating cryptographic key material
- Selecting random values for any security-sensitive operation (salts, verification codes, OTPs)
- Auditing existing code for insecure randomness sources

## Threat Context

Predictable random number generators have caused catastrophic breaches. The 2012 Android Bitcoin wallet vulnerability used a broken PRNG that reused ECDSA nonces, allowing private key extraction and theft of 55 BTC. The 2008 Debian OpenSSL bug reduced the entropy pool to 15 bits (32,768 possible keys), making all SSL certificates, SSH keys, and VPN keys generated on affected Debian and Ubuntu systems trivially crackable for nearly two years before discovery.

PHP's `mt_rand()` and JavaScript's `Math.random()` use algorithms (Mersenne Twister and xorshift128+ respectively) that are fully predictable after observing a small number of outputs. Any security token generated from a non-cryptographic PRNG can be predicted and forged by an attacker who observes enough prior outputs.

## Instructions

1. **Always use the platform's CSPRNG.** Every major platform provides a cryptographically secure random number generator. Use it without exception for security-sensitive values:
   - **Node.js:** `crypto.randomBytes()` or `crypto.randomUUID()`
   - **Python:** `secrets` module (`secrets.token_hex()`, `secrets.token_urlsafe()`)
   - **Go:** `crypto/rand.Read()`
   - **Java:** `java.security.SecureRandom`
   - **Ruby:** `SecureRandom.hex()`
   - **Browser JavaScript:** `crypto.getRandomValues()`
   - **Rust:** `rand::rngs::OsRng` or the `getrandom` crate
   - **C/C++:** `getrandom(2)` on Linux, `BCryptGenRandom` on Windows

   Never use `Math.random()`, `random.random()`, `rand()`, or `mt_rand()` for any value that affects security. The convenience of these functions does not justify the risk.

2. **Understand entropy sources.** On Linux, `/dev/urandom` reads from the kernel entropy pool seeded by hardware interrupts, disk timing, network events, and CPU jitter (RDRAND/RDSEED on modern Intel/AMD processors). On modern kernels (5.6+), `/dev/urandom` blocks until sufficient initial entropy is available at boot, resolving the historical `/dev/random` vs `/dev/urandom` debate. On modern Linux, `/dev/urandom` is correct for all cryptographic purposes.

   On Windows, `BCryptGenRandom` (via CNG) draws from a kernel-mode CSPRNG seeded by hardware and environmental noise. On macOS, `SecRandomCopyBytes` uses the kernel's Fortuna-based CSPRNG. All major cloud providers (AWS Nitro, GCP, Azure) provide hardware-backed entropy to guest VMs.

3. **Size tokens correctly.** Insufficient randomness makes brute-force feasible. Minimum sizes for security-sensitive values:
   - **Session tokens:** 128 bits (16 bytes), encoded as 32 hex characters or 22 base64url characters
   - **API keys:** 256 bits (32 bytes) for long-lived credentials
   - **Encryption keys:** Match the algorithm (AES-128 needs 128 bits, AES-256 needs 256 bits)
   - **CSRF tokens:** 128 bits minimum
   - **Password reset tokens:** 128 bits minimum, single-use
   - **Salts for password hashing:** 128 bits minimum (16 bytes), unique per user

4. **Never reuse nonces.** AES-GCM nonces must be unique per key -- reusing a nonce with the same key completely breaks GCM's authentication guarantee and leaks plaintext via XOR of ciphertexts. This is not a theoretical weakness; it is a complete practical break of the encryption.

   For AES-GCM with 96-bit nonces, use a counter (if you can guarantee no resets across crashes, restarts, and failovers) or random nonces (safe for up to 2^32 encryptions per key before birthday collision risk becomes unacceptable per NIST SP 800-38D). Rotate the encryption key well before reaching this limit.

5. **Seed correctly in containers and VMs.** Containers and VMs may have low entropy at boot because they lack hardware interrupt diversity. Verify entropy health by checking `/proc/sys/kernel/random/entropy_avail` on Linux -- values below 256 indicate a problem. Cloud providers seed guest entropy from hardware RNGs via virtio-rng. For on-premise VMs, ensure virtio-rng is configured or install `haveged`. Kubernetes pods inherit the host's entropy pool -- verify on the host, not inside the container.

6. **Audit for insecure randomness.** Search codebases for these patterns and flag them as security vulnerabilities when used for tokens, keys, nonces, or any value an attacker benefits from predicting:
   - `Math.random` (JavaScript) -- xorshift128+, predictable after 2 outputs
   - `random.random`, `random.randint` (Python) -- Mersenne Twister, predictable after 624 outputs
   - `rand()`, `srand()` (C/C++) -- implementation-defined, typically LCG
   - `mt_rand()`, `rand()` (PHP) -- Mersenne Twister
   - `time()` or timestamps used as seeds
   - UUID libraries that do not document CSPRNG usage internally

## Details

### Why Math.random() Is Predictable

JavaScript's `Math.random()` uses xorshift128+ in V8 (Chrome, Node.js) and SpiderMonkey (Firefox). These are pseudorandom number generators (PRNGs) designed for speed and statistical distribution, not unpredictability.

The older Mersenne Twister (MT19937) maintains 624 32-bit state words with a linear recurrence relation. After observing 624 consecutive outputs, an attacker can reconstruct the complete internal state and predict all future outputs with certainty. The xorshift128+ generator has a smaller state (128 bits) and is even easier to reverse -- in some implementations, two consecutive outputs are sufficient to recover the full state.

The attack is practical: if an application exposes generated values (sequential resource IDs derived from Math.random, leaked tokens in logs, pagination cursors, or even CSS animation timing), an attacker collecting enough outputs can predict every future "random" value the application will generate. This enables forging session tokens, predicting CSRF tokens, and guessing password reset links.

### Birthday Paradox and Nonce Collision

For a random n-bit nonce, the probability of at least one collision among k values exceeds 50% when k approaches 2^(n/2). This is the birthday paradox applied to cryptographic nonces:

- **64-bit nonce:** Collision likely after ~2^32 (4 billion) uses -- insufficient for high-volume systems
- **96-bit GCM nonce:** Collision likely after ~2^48 (281 trillion) uses -- safe for most applications
- **128-bit nonce:** Collision likely after ~2^64 uses -- safe for virtually all applications

For AES-GCM with 96-bit random nonces, NIST SP 800-38D recommends limiting invocations to 2^32 per key to keep the collision probability below 2^-32. In practice, this means rotating the encryption key after approximately 4 billion encryptions. For high-volume systems (millions of encryptions per second), this limit is reached in under an hour -- key rotation must be automated.

### CSPRNG Comparison

| Source            | Platform  | Entropy Source                      | Blocks at Boot         | Fork-Safe | VM-Safe          |
| ----------------- | --------- | ----------------------------------- | ---------------------- | --------- | ---------------- |
| `/dev/urandom`    | Linux     | Kernel pool (HW interrupts, RDRAND) | Yes (kernel 5.6+)      | Yes       | Needs virtio-rng |
| `getrandom(2)`    | Linux     | Same as urandom, no FD needed       | Yes                    | Yes       | Needs virtio-rng |
| `BCryptGenRandom` | Windows   | CNG kernel CSPRNG                   | N/A                    | Yes       | Yes              |
| `arc4random`      | BSD/macOS | ChaCha20-based CSPRNG               | Yes                    | Yes       | Yes              |
| `RDRAND/RDSEED`   | Intel/AMD | CPU hardware RNG                    | No (available at boot) | Yes       | Yes (direct HW)  |

`getrandom(2)` is preferred over reading `/dev/urandom` directly because it avoids file descriptor exhaustion and provides clear blocking semantics. Most language-level CSPRNGs (`crypto.randomBytes`, `secrets.token_bytes`, `crypto/rand.Read`) call `getrandom(2)` or the platform equivalent internally.

**Fork safety note:** After `fork()`, the parent and child processes share PRNG state. A non-fork-safe PRNG produces identical "random" values in both processes. OS-level CSPRNGs handle this correctly by re-seeding after fork, but userspace PRNGs (including some older implementations of OpenSSL's `RAND_bytes`) may not. This is especially relevant in pre-forking server architectures.

### Common Vulnerable Patterns by Language

Each language ecosystem has specific insecure randomness patterns that appear frequently in security audits:

- **JavaScript/Node.js:** `Math.random()` for session tokens, `uuid` package versions that used Math.random internally (fixed in modern versions), timestamp-based token generation with `Date.now().toString(36)`
- **Python:** `random.choice()` for password generation, `random.randint()` for OTP codes, `hashlib.md5(str(time.time()))` for tokens
- **Java:** `java.util.Random` (not `SecureRandom`) for token generation, `System.currentTimeMillis()` as seeds, `UUID.randomUUID()` is safe (uses SecureRandom) but `new Random().nextLong()` is not
- **PHP:** `mt_rand()` for CSRF tokens (extremely common in legacy PHP), `uniqid()` which is timestamp-based and predictable, `rand()` for password reset tokens
- **Go:** `math/rand` instead of `crypto/rand` -- the package names are similar enough to cause confusion, especially for developers new to Go

### Token Generation Best Practices

Generate tokens as raw random bytes, then encode for transport:

- **Hex encoding** (`token_hex`): Doubles the byte length. 16 bytes becomes 32 characters. Universally safe in URLs, headers, databases, and logs.
- **Base64url encoding** (`token_urlsafe`): ~33% overhead. 16 bytes becomes 22 characters. URL-safe without escaping, no padding characters. Preferred for compact tokens in URLs and headers.
- **Raw bytes:** Appropriate only for internal binary protocols or when stored directly in a binary column.

Include the generation timestamp either embedded in the token structure or stored server-side for expiration enforcement. Tokens without expiration are permanent credentials that accumulate attack surface over time -- a token generated three years ago may still be valid if no expiration policy exists.

For high-security tokens (password reset, email verification), store only the cryptographic hash of the token in the database. When the user presents the token, hash it and compare against the stored hash. This prevents token theft via database compromise -- even if the attacker has full database access, they cannot extract valid tokens.

### Randomness in Distributed Systems

Distributed systems introduce additional randomness challenges:

- **Clock-based seeds across replicas:** If multiple replicas seed their PRNG with the system clock at startup, they may produce identical sequences. This is especially problematic in auto-scaling groups where multiple instances start simultaneously. CSPRNGs that draw from OS entropy avoid this, but userspace PRNGs initialized from `time()` produce correlated outputs.

- **Kubernetes pod restarts:** When a pod restarts, the application re-initializes. If the application maintains an in-memory counter for AES-GCM nonces, the counter resets to zero, potentially reusing nonces from before the restart. Counter-based nonces must be persisted or replaced with random nonces.

- **Serverless cold starts:** Serverless functions may share the same OS-level entropy pool with other tenants. Major cloud providers (AWS Lambda, Google Cloud Functions, Azure Functions) ensure adequate entropy isolation, but verify this for less common or self-hosted serverless platforms.

- **Test environments with snapshots:** VM snapshots capture the PRNG state. Restoring from a snapshot and running multiple instances produces identical "random" outputs from userspace PRNGs. OS-level CSPRNGs re-seed after snapshot restoration on modern hypervisors, but application-level PRNGs may not.

- **Database-generated UUIDs:** When the database generates UUIDs (PostgreSQL `gen_random_uuid()`, MySQL `UUID()`), verify the database's CSPRNG quality. PostgreSQL uses the OS CSPRNG and is safe. MySQL's `UUID()` generates UUIDv1 (timestamp-based, not random and predictable) -- use `UUID_TO_BIN(UUID(), 1)` with care or generate UUIDv4 in the application layer using a verified CSPRNG.

- **Load balancer session affinity tokens:** Some load balancers generate session tokens using weak PRNGs. If your infrastructure generates tokens at any layer, audit the randomness source at that layer.

### Entropy Monitoring

For production systems that depend on cryptographic randomness, monitor entropy health as a metric:

- On Linux, export `/proc/sys/kernel/random/entropy_avail` as a Prometheus metric or CloudWatch custom metric
- Set alerts when entropy drops below 256 bits (indicating potential starvation)
- On application startup, log the entropy available and the CSPRNG source being used
- In CI/CD pipelines, verify that test environments have adequate entropy (Docker containers running integration tests with cryptographic operations may encounter entropy starvation under heavy parallel test load)

## Anti-Patterns

1. **Using `Math.random()` or `random.random()` for security tokens.** These are pseudorandom, not cryptographically secure. Their internal state is recoverable from observed outputs. Use the platform CSPRNG: `crypto.randomBytes()` (Node.js), `secrets.token_hex()` (Python), `crypto/rand.Read()` (Go). This is the single most common cryptographic error in application code.

2. **Seeding with the current time.** `srand(time(NULL))` produces 1-second resolution seeds. An attacker who knows approximately when the token was generated (within a day) can brute-force all 86,400 possible seeds in milliseconds on commodity hardware. CSPRNGs do not require manual seeding -- they draw entropy from the OS kernel automatically.

3. **Using UUIDv4 as security tokens without verifying the CSPRNG source.** UUIDv4 provides 122 bits of randomness, which is adequate in size, but many UUID libraries use non-cryptographic PRNGs internally (Java's `UUID.randomUUID()` uses `SecureRandom` and is safe, but not all languages guarantee this). Verify that your UUID library documents CSPRNG usage, or generate tokens directly from `crypto.randomBytes()` and format them yourself.

4. **Reusing nonces across encryption operations.** AES-GCM nonce reuse with the same key reveals the XOR of two plaintexts and destroys authentication entirely. This is a complete, practical, immediate break of the encryption -- not a theoretical weakness. Use a counter or random nonces with key rotation well before the birthday bound.

5. **Ignoring entropy starvation in containers.** Containers without access to adequate host entropy may block on random number generation (causing latency spikes and timeouts) or produce low-quality randomness from a poorly seeded pool. Check entropy availability at application startup and fail fast with a clear, specific error message if insufficient entropy is detected. Do not silently fall back to a weaker randomness source -- degraded randomness is worse than a visible failure because it creates a false sense of security.

6. **Rolling your own PRNG.** Implementing a custom random number generator for security purposes is almost always wrong. Even well-known algorithms (Mersenne Twister, xorshift) are not cryptographically secure. The OS-provided CSPRNG has been vetted by cryptographers, formally analyzed, and tested against known attacks. Use it directly through the language's standard library. The only valid reason to implement a custom CSPRNG is if you are a professional cryptographer building a specialized system -- and even then, you would use a vetted design like ChaCha20-based construction with OS entropy seeding.

7. **Insufficient token length for the use case.** Using 64-bit tokens where 128-bit tokens are needed. A 64-bit token has only 2^64 possible values. At 1 billion guesses per second (feasible with modern hardware), brute-forcing a 64-bit token takes approximately 584 years -- but distributed attacks and GPU acceleration reduce this significantly. 128-bit tokens provide a comfortable security margin (2^128 is approximately 3.4 x 10^38 possible values) and should be the minimum for any security-sensitive token.
