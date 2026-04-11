# Hashing Fundamentals

> One-way functions for integrity verification, content addressing, and commitment schemes
> -- SHA-256 for interoperability, BLAKE3 for performance, and never MD5 or SHA-1 for
> security

## When to Use

- Verifying file or data integrity (checksums, download verification, package signing)
- Content addressing (deduplication, cache keys, Git object IDs, container image digests)
- Generating deterministic identifiers from variable-length input
- Choosing a hash function for a new system or migrating away from a deprecated one
- Reviewing code that uses hashing and assessing whether the right function and use
  pattern is applied
- Understanding why MD5 or SHA-1 must be replaced in security-sensitive contexts

## Threat Context

Weak hash functions enable collision attacks (finding two different inputs that produce
the same hash), preimage attacks (finding an input that produces a specific target hash),
and second preimage attacks (finding a different input with the same hash as a known
input). MD5 collisions can be generated in seconds on commodity hardware -- Wang et al.
demonstrated the first practical MD5 collision in 2004, and by 2012, the Flame malware
exploited an MD5 chosen-prefix collision to forge a Microsoft code-signing certificate,
enabling nation-state malware to masquerade as a legitimate Windows update. SHA-1
collisions were demonstrated practically by Google and CWI Amsterdam in 2017 (the
SHAttered attack), producing two distinct PDF files with identical SHA-1 hashes at a cost
of approximately $110,000 in cloud computing. These attacks enable forged digital
certificates, tampered software distribution packages, Git repository poisoning, and
bypassed integrity checks in any system relying on the compromised hash function.

## Instructions

1. **For general-purpose cryptographic hashing, use SHA-256.** SHA-256 (part of the SHA-2
   family, designed by the NSA, standardized by NIST in 2001) produces a 256-bit digest
   and provides 128-bit collision resistance and 256-bit preimage resistance. It is
   universally supported across every programming language, operating system, and
   cryptographic library. SHA-256 is the standard choice for integrity verification,
   digital signature hashing, certificate fingerprints, blockchain proof-of-work, and any
   context requiring a well-analyzed, interoperable cryptographic hash. SHA-512 offers the
   same security margin with better performance on 64-bit platforms due to its use of
   64-bit arithmetic operations.

2. **For performance-sensitive hashing, use BLAKE3.** BLAKE3 is a cryptographic hash
   function released in 2020, derived from the BLAKE2/ChaCha cipher family. It is 6-14x
   faster than SHA-256 on modern CPUs by exploiting SIMD parallelism (AVX-512, NEON) and
   internal tree hashing that parallelizes across multiple cores. BLAKE3 provides 128-bit
   security against all known attacks. Use BLAKE3 for content addressing, file
   deduplication, Merkle tree construction, and any use case where hash throughput is a
   bottleneck. BLAKE3 is not yet NIST-standardized, so use SHA-256 when FIPS 140-2/140-3
   compliance is required. BLAKE2b (BLAKE3's predecessor) is standardized in RFC 7693 and
   is a suitable intermediate choice.

3. **For defense-in-depth against structural attacks, consider SHA-3 (Keccak).** SHA-3
   uses the sponge construction, which is fundamentally different from the Merkle-Damgard
   construction used by SHA-2, MD5, and SHA-1. If a structural breakthrough ever
   compromises the Merkle-Damgard design (affecting the entire SHA-2 family
   simultaneously), SHA-3 would be unaffected. SHA-3-256 provides 128-bit collision
   resistance, identical to SHA-256. In practice, SHA-256 is not under credible threat,
   but defense-critical or long-lived systems (government archives, root certificate
   authorities) may use SHA-3-256 as a hedge. SHA-3 also natively supports
   variable-length output via SHAKE128 and SHAKE256 (extendable output functions), which
   is useful for key derivation and domain separation.

4. **Never use MD5 or SHA-1 for security purposes.** MD5 is completely broken for
   collision resistance -- chosen-prefix collisions (where the attacker controls prefixes
   of both inputs) can be computed in hours on a single machine. SHA-1 is similarly
   broken: the SHAttered attack demonstrated a practical collision, and further research
   (Leurent and Peyrin, 2020) reduced chosen-prefix collision cost to approximately
   $45,000. Both MD5 and SHA-1 are acceptable only for non-security checksums where
   adversarial tampering is not in the threat model (e.g., verifying data integrity over a
   reliable channel, deduplication in trusted storage). When encountering MD5 or SHA-1 in
   existing code, assess whether the context is security-sensitive; if so, migration to
   SHA-256 is urgent.

5. **Understand the three security properties of cryptographic hash functions:**
   - **Preimage resistance (one-wayness):** Given a hash output H, it is computationally
     infeasible to find any input m such that hash(m) = H. A hash function with n-bit
     output provides up to n-bit preimage resistance. This property ensures that hashes
     cannot be "reversed" to recover the original input.
   - **Second preimage resistance:** Given a specific input m1, it is computationally
     infeasible to find a different input m2 such that hash(m1) = hash(m2). This property
     ensures that an attacker cannot find a substitute input that matches a known hash,
     which would enable undetected document or data substitution.
   - **Collision resistance:** It is computationally infeasible to find any two distinct
     inputs m1 and m2 such that hash(m1) = hash(m2). Due to the birthday paradox,
     collision resistance is at most n/2 bits for an n-bit hash (2^128 operations for
     SHA-256). Collision resistance is the strongest property and implies second preimage
     resistance.

6. **Hashing is NOT encryption.** Hashing is a one-way function: given input m, you can
   compute hash(m), but given hash(m), you cannot recover m. Encryption is a two-way
   function: given plaintext and a key, you can encrypt; given ciphertext and the key, you
   can decrypt. Never hash data you need to recover (use encryption). Never encrypt data
   you only need to verify (use hashing). This distinction is fundamental: hashing
   provides integrity and commitment; encryption provides confidentiality.

7. **Hashing is NOT a MAC.** A bare hash -- SHA-256(message) -- does not authenticate
   the sender. Anyone who knows the message can compute its hash. A Message
   Authentication Code (MAC) combines the hash with a secret key, so only parties
   possessing the key can compute or verify the MAC. Use HMAC (HMAC-SHA256, HMAC-SHA384)
   when you need to verify both integrity and authenticity. Naive constructions like
   hash(key || message) are vulnerable to length extension attacks on Merkle-Damgard
   hashes. See the `security-hmac-signatures` skill.

## Details

### Length Extension Attacks

SHA-256, SHA-512, and all Merkle-Damgard hash functions are vulnerable to length
extension: given hash(m) and the length of m (but not m itself), an attacker can compute
hash(m || padding || attacker_suffix) for any chosen suffix, without knowing m. This is
possible because the final internal state of a Merkle-Damgard hash is the hash output,
and that state can be used to initialize a new hash computation that "continues" from
where the original left off.

This breaks naive keyed-hash authentication schemes like hash(secret || message): an
attacker who observes the hash and knows the message length can append arbitrary data and
compute a valid hash. Real-world exploits include API signature bypasses where servers
used hash(api_key || request_params) for authentication.

Mitigations:

- **HMAC** nests the hash in a specific construction -- hash(K XOR opad || hash(K XOR
  ipad || message)) -- that is provably secure against length extension.
- **SHA-3 (Keccak)** uses the sponge construction, which absorbs input and squeezes
  output through a capacity parameter. The internal state is larger than the output,
  making length extension infeasible.
- **BLAKE3** uses a tree/chaining construction that is also immune to length extension.

### Birthday Paradox and Collision Probability

The birthday paradox states that in a set of n randomly chosen values from a space of
size N, the probability of at least one collision exceeds 50% when n approaches sqrt(N).
For hash functions:

- **SHA-256** (256-bit output): collision expected after ~2^128 hashes --
  computationally infeasible with current or foreseeable technology.
- **SHA-1** (160-bit output): collision expected after ~2^80 hashes -- within reach of
  well-funded attackers, as SHAttered demonstrated.
- **MD5** (128-bit output): collision expected after ~2^64 hashes -- trivially achievable
  on modern hardware.

This is why hash output length matters for security: a 128-bit hash provides only 64-bit
collision resistance, which is insufficient for any security application.

### Content Addressing Pattern

Content addressing uses the hash of data as its identifier/address, making integrity
self-verifying:

- **Git** uses SHA-1 for object IDs (commits, trees, blobs), migrating to SHA-256 to
  address collision concerns.
- **IPFS** uses multihash (a self-describing format: hash function identifier + digest
  length + digest), allowing algorithm agility.
- **Docker/OCI** uses SHA-256 for layer digests and image manifests.
- **Content Delivery Networks** use content hashes for cache keys, enabling global
  deduplication.

The pattern: `store(hash(content), content)` and `retrieve(hash) -> content`. On
retrieval, recompute the hash and verify it matches the address. If the content has been
tampered with, the hash will not match and the tampering is detected. This provides
integrity without requiring a separate signature or MAC, as long as the hash-to-content
binding was established through a trusted channel.

### Hash Function Selection Decision Tree

- Need FIPS 140-2/140-3 compliance? Use **SHA-256** or **SHA-3-256**.
- Need maximum throughput and no FIPS requirement? Use **BLAKE3**.
- Need defense-in-depth against Merkle-Damgard structural attacks? Use **SHA-3-256**.
- Non-security checksum (error detection, not adversarial)? Use **CRC32** or **xxHash**
  (not cryptographic, but extremely fast).
- Password storage? **Not a general-purpose hash** -- use Argon2id, bcrypt, or scrypt
  (see `security-credential-storage`).
- HMAC / keyed authentication? Use **HMAC-SHA256** (see `security-hmac-signatures`).

## Anti-Patterns

1. **MD5 for integrity in adversarial contexts.** MD5 chosen-prefix collisions enable an
   attacker to create two files with identical hashes but different content. The Flame
   malware (2012) used an MD5 collision to forge a Microsoft code-signing certificate,
   allowing malware to be distributed through Windows Update. MD5 is acceptable only for
   non-security checksums where no adversary is in the threat model.

2. **SHA-256(password) for credential storage.** General-purpose hash functions are
   designed to be fast -- a modern GPU can compute billions of SHA-256 hashes per second.
   This speed advantage benefits attackers performing brute-force or dictionary attacks
   against password hashes. Purpose-built password hashing functions (Argon2id, bcrypt,
   scrypt) are deliberately slow, memory-hard, and parameterizable to maintain resistance
   as hardware improves. See `security-credential-storage`.

3. **hash(secret || message) for authentication.** Vulnerable to length extension attacks
   on all Merkle-Damgard hashes (SHA-256, SHA-512, MD5, SHA-1). An attacker who observes
   the hash output and knows the message can append arbitrary data and compute a valid
   hash without knowing the secret. Use HMAC(key, message) instead. HMAC is provably
   secure under standard assumptions and is immune to length extension regardless of the
   underlying hash function.

4. **Truncating hashes without understanding the security impact.** Truncating SHA-256
   output from 256 bits to 128 bits reduces collision resistance from 2^128 to 2^64 -- a
   reduction of 2^64 in the attacker's required work. If space constraints require shorter
   hashes, explicitly analyze whether the reduced collision resistance is acceptable for
   the specific threat model and document the decision. For content addressing where
   collision probability (not adversarial collision) is the concern, truncation may be
   acceptable with sufficient analysis.

5. **Assuming hash uniqueness as an invariant.** Hash functions map an infinite input
   space to a finite output space -- collisions exist by the pigeonhole principle. Systems
   that assume hash uniqueness without verification will fail silently when collisions
   occur (whether natural or adversarial). Content-addressed storage must verify that
   retrieved content matches the expected content, not just the hash. Database schemas
   using hash columns as unique keys must handle collision cases.
