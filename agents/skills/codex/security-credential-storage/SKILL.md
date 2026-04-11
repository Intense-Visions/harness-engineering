# Credential Storage

> Argon2id for new systems, bcrypt for broad compatibility -- always salt, consider peppering, tune cost parameters to hardware, and plan hash upgrade paths

## When to Use

- Designing a user registration and login system that stores passwords
- Reviewing existing password storage for security adequacy
- Migrating from an insecure hashing scheme (MD5, SHA-1, unsalted SHA-256) to a secure one
- Choosing between Argon2id, bcrypt, and scrypt for a new project
- Tuning password hashing cost parameters for production hardware
- Implementing a "hash upgrade on login" strategy for legacy systems

## Threat Context

When a database is breached (and breaches are a matter of when, not if), the attacker obtains the stored password representations.
If passwords are stored in plaintext, all accounts are immediately compromised.
If stored as fast hashes (MD5, SHA-256), offline brute-force attacks using GPUs can crack the majority of passwords in hours.

The 2012 LinkedIn breach exposed 6.5 million SHA-1 unsalted hashes that were cracked within days.
The 2016 follow-up revealed the full dataset was 117 million credentials.
The 2013 Adobe breach exposed 153 million passwords encrypted (not hashed) with 3DES in ECB mode -- the block cipher preserved password frequency patterns, allowing mass decryption without the key.

Purpose-built password hashing functions defend by making each guess computationally expensive.
They are deliberately slow, memory-intensive, and resistant to parallelization on GPUs and ASICs.
A hash that takes 250ms on a server CPU transforms a hours-long brute-force attack into one requiring centuries.

## Instructions

1. **Default to Argon2id.**
   Argon2id won the 2015 Password Hashing Competition and is the OWASP-recommended algorithm.
   It is memory-hard and resistant to both GPU and ASIC attacks.
   Argon2id has three tunable parameters:
   - Memory cost: minimum 64 MB recommended by OWASP
   - Time cost: iterations, minimum 3
   - Parallelism: threads, typically 1-4

   Argon2id combines Argon2i (data-independent memory access, resistant to side-channel attacks) and Argon2d (data-dependent memory access, maximally resistant to GPU/ASIC attacks) in a hybrid mode.
   The first pass uses Argon2i for side-channel resistance; subsequent passes use Argon2d for GPU resistance.

2. **Use bcrypt when Argon2id is unavailable.**
   bcrypt has been battle-tested since 1999 and is available in virtually every language and framework.
   It uses the Blowfish cipher in a key setup phase that is intentionally expensive.
   The cost factor is exponential (cost 12 = 2^12 = 4096 iterations).
   Set the work factor so that hashing takes 250-500ms on your production hardware.

   bcrypt has a critical 72-byte input limit -- passwords longer than 72 bytes are silently truncated.
   For systems supporting long passphrases or high-entropy Unicode passwords, pre-hash with SHA-256:
   `bcrypt(base64(SHA-256(password)))`.
   This is safe because SHA-256 is preimage resistant and the pre-hash does not weaken the password.

3. **Always use a unique salt per credential.**
   A salt is a cryptographically random value (minimum 16 bytes) stored alongside the hash.
   Salting ensures that identical passwords produce different hashes, which defeats two attack classes:
   - Precomputed rainbow tables (which map hash outputs to inputs)
   - Multi-target attacks (where the attacker cracks all instances of a common password simultaneously)

   Argon2id and bcrypt generate and embed salts automatically in their output format.
   Do not manage salts manually unless the algorithm requires it.

4. **Consider peppering for defense in depth.**
   A pepper is a secret value (minimum 32 bytes) applied to the password before hashing: `hash(pepper + password, salt)`.
   Unlike the salt (stored with the hash in the database), the pepper is stored separately -- in an HSM, a secrets manager, or an environment variable that is not in the database.
   If the database is breached but the pepper is not, the hashes are uncrackable even with infinite compute.

   The tradeoff: pepper rotation requires re-hashing all credentials, which can only happen on login (when the plaintext password is available).
   Implement pepper versioning: store the pepper version with each hash and support multiple active peppers during rotation.

5. **Tune cost parameters to target 250-500ms per hash.**
   Benchmark on production hardware, not development laptops.
   Too fast means vulnerable to brute force -- if your hash completes in 1ms, the attacker can try 1000 passwords per second per core.
   Too slow means degraded login UX and potential for login-based denial of service (an attacker sending thousands of login requests to consume server CPU).

   For Argon2id: start with 64 MB memory, 3 iterations, 1 parallelism, and increase memory until you hit the target latency.
   For bcrypt: start at cost 10 and increment by 1 until you reach the target.
   Document the benchmarking methodology and re-run annually.

6. **Implement hash upgrade on login.**
   When a user authenticates successfully (proving they know the plaintext password), inspect the stored hash format.
   If it uses a legacy algorithm or outdated parameters (e.g., bcrypt cost 10 when the current standard is cost 12, or MD5 from a legacy system), re-hash the password with the current algorithm and parameters, then update the stored hash.

   This enables transparent migration across algorithm generations -- MD5 to bcrypt to Argon2id -- without forcing password resets on the entire user base.
   Store the algorithm identifier and parameter version in a parseable format alongside each hash.

7. **Never implement password hashing yourself.**
   Use the language's standard library or a well-maintained, audited security library.
   Custom password hashing implementations invariably contain:
   - Timing side channels (comparing hashes byte-by-byte allows attackers to determine correctness incrementally)
   - Incorrect salt generation (using Math.random() instead of a CSPRNG)
   - Parameter misconfiguration or encoding errors

   Constant-time comparison functions are mandatory for hash verification.

## Details

### Why General-Purpose Hashes Fail

SHA-256 computes at approximately 6 billion hashes per second on a modern GPU (NVIDIA RTX 4090).
At that rate, the entire space of 6-character alphanumeric passwords (2.2 billion combinations) is exhausted in under 1 second.
The 8-character alphanumeric space (218 trillion combinations) falls in approximately 10 hours.

bcrypt at cost 12 computes at roughly 50 hashes per second on the same GPU -- the same 8-character space would require approximately 138,000 years.
Argon2id with 64 MB memory cost is even slower on GPUs because each hash attempt must allocate 64 MB of GPU memory, severely limiting parallelism.

### Argon2 Variants

- **Argon2d**: Data-dependent memory access pattern.
  Maximum resistance to GPU and ASIC attacks because the memory access pattern depends on the password, making it impossible to precompute memory layouts.
  Vulnerable to side-channel attacks (timing analysis of memory access patterns can leak information about the password).
  Suitable for cryptocurrency mining and backend-only applications.

- **Argon2i**: Data-independent memory access pattern.
  Resistant to side-channel attacks because the memory access pattern is determined solely by the parameters (salt, time cost, memory cost), not the password.
  Less resistant to GPU attacks than Argon2d.
  Suitable for environments where side-channel attacks are a concern (shared hosting, client-side hashing).

- **Argon2id**: Hybrid mode.
  The first pass uses Argon2i (side-channel resistance during the initial memory fill), subsequent passes use Argon2d (GPU resistance for the majority of computation).
  This is the recommended variant for password hashing in all contexts.

### The bcrypt 72-Byte Limit

bcrypt internally truncates input to 72 bytes before processing.
For ASCII passwords, this allows 72 characters -- more than sufficient for typical passwords but problematic for systems accepting long passphrases or Unicode passwords (where a single character may be 4 bytes in UTF-8).

The standard mitigation is pre-hashing: `bcrypt(base64(SHA-256(password)))`.
The base64 encoding of a SHA-256 output is 44 bytes, well within the 72-byte limit.
This is safe because SHA-256 is a preimage-resistant one-way function -- the pre-hash concentrates entropy without losing it.

### Credential Stuffing vs. Brute Force

Password hashing defends against offline brute force (attacker has the hash and tries passwords locally).
It does not defend against credential stuffing (attacker tries leaked username/password pairs from other breaches against your login endpoint).

Defense against credential stuffing requires:

- Rate limiting on login endpoints
- Progressive account lockout with exponential backoff
- CAPTCHA challenges after repeated failures
- Monitoring for bulk login failures from distributed sources
- Multi-factor authentication (the single most effective defense)

Password hashing protects the stored credentials; MFA protects the authentication flow.

### scrypt as a Third Option

scrypt (Percival, 2009) is memory-hard like Argon2id but predates the Password Hashing Competition.
It has two tunable parameters: N (CPU/memory cost factor, must be a power of 2) and r (block size, controls memory usage per iteration).
scrypt is used in several cryptocurrency protocols (Litecoin, Dogecoin) and is available in most cryptographic libraries.

Prefer Argon2id over scrypt for new systems because:

- Argon2id provides independent tuning of memory, time, and parallelism (scrypt couples memory and CPU cost)
- Argon2id was designed specifically for password hashing with formal security analysis
- Argon2id has broader review from the Password Hashing Competition judging process

scrypt remains acceptable when Argon2id is unavailable and bcrypt's lack of memory-hardness is a concern.

### Hash Format and Storage

Store the complete hash output including the algorithm identifier, parameters, salt, and hash value in a single self-describing string.
Argon2id and bcrypt both produce such strings natively:

- **Argon2id**: `$argon2id$v=19$m=65536,t=3,p=1$<salt>$<hash>`
- **bcrypt**: `$2b$12$<salt+hash>`
- **scrypt**: `$scrypt$ln=15,r=8,p=1$<salt>$<hash>`

This format enables hash-upgrade-on-login by allowing the application to detect the algorithm and parameters of the stored hash without external metadata.

### Language-Specific Libraries

- **Node.js**: `argon2` package (wraps the reference C implementation); `bcrypt` or `bcryptjs` for bcrypt
- **Python**: `argon2-cffi` (recommended by the Argon2 authors); `bcrypt` package from PyCA
- **Java**: Spring Security's `Argon2PasswordEncoder`; `jBCrypt` for bcrypt
- **Go**: `golang.org/x/crypto/argon2`; `golang.org/x/crypto/bcrypt`
- **Ruby**: `argon2` gem; `bcrypt-ruby` gem (used by Devise)
- **PHP**: `password_hash()` with `PASSWORD_ARGON2ID` (built-in since PHP 7.3); `PASSWORD_BCRYPT` for bcrypt

## Anti-Patterns

1. **Plaintext password storage.**
   Any breach exposes all credentials instantly.
   There is no legitimate use case.
   No exceptions, no excuses.
   This is negligence, not a design choice.

2. **Unsalted hashing (MD5(password), SHA-256(password)).**
   Rainbow tables provide instant lookup for common passwords.
   Even uncommon passwords fall to GPU-accelerated brute force within hours.
   Every leaked database with unsalted hashes is fully cracked within days of publication.

3. **Global salt (same salt for all users).**
   Defeats the purpose of salting entirely.
   Attackers incorporate the single salt into their GPU kernel and attack all hashes simultaneously, achieving the same throughput as unsalted hashing.
   Each credential must have a unique random salt of at least 16 bytes.

4. **Static cost parameters that are never re-tuned.**
   bcrypt cost 10 was appropriate in 2010.
   GPU performance improves roughly 2x every 18 months.
   A cost parameter that provided 250ms latency in 2010 provides under 10ms today.
   Re-tune cost parameters annually against production hardware benchmarks.
   Use hash-upgrade-on-login to apply increased costs transparently.

5. **Encrypting passwords instead of hashing them.**
   Encryption is a reversible operation -- whoever holds the key can recover all passwords in constant time.
   If the encryption key is compromised alongside the database (common in breaches that achieve code or config access), all passwords are exposed instantly.
   Passwords must be hashed (one-way function), never encrypted (two-way function).
   The only exception is peppering, where the pepper acts as an additional secret input to the hash function, not as an encryption key.

6. **Rolling your own password hashing function.**
   Combining SHA-256 iterations with custom salt handling, custom encoding, and manual timing protection.
   Every component of this stack has subtle requirements that security libraries handle correctly and custom implementations do not.
   Use Argon2id from a vetted library.

7. **Comparing hashes with standard string equality.**
   Standard `==` comparison short-circuits on the first differing byte, creating a timing side channel that allows attackers to determine hash correctness incrementally.
   Always use constant-time comparison functions:

- Node.js: `crypto.timingSafeEqual`
- Python: `hmac.compare_digest`
- Java: `MessageDigest.isEqual`
- Go: `crypto/subtle.ConstantTimeCompare`
