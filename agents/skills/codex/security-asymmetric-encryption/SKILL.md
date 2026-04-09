# Asymmetric Encryption

> Public-key cryptography for key exchange, digital signatures, and identity verification
> -- Ed25519 for signatures, X25519 for key exchange, RSA-2048+ only for legacy
> compatibility

## When to Use

- Designing a system where parties need to communicate securely without a pre-shared
  secret
- Implementing digital signatures for code signing, document signing, or API request
  authentication
- Choosing key types for TLS certificates, SSH keys, or JWT signing
- Evaluating RSA vs elliptic curve algorithms for a new system
- Implementing a key exchange protocol for end-to-end encryption
- Reviewing certificate chains, trust models, or PKI configurations

## Threat Context

Asymmetric encryption defends against man-in-the-middle attacks during key exchange,
impersonation (via digital signatures that prove identity), and the key distribution
problem (how to establish a shared secret when no secure channel yet exists). RSA with
keys shorter than 2048 bits is factorable with modern computational resources -- RSA-768
was factored in 2009 by Kleinjung et al., and NIST deprecated 1024-bit RSA in 2013. The
looming threat of quantum computing (Shor's algorithm) will eventually break both RSA
and elliptic curve cryptography by solving integer factorization and the discrete
logarithm problem in polynomial time, driving the transition to post-quantum algorithms
(ML-KEM/Kyber, ML-DSA/Dilithium). Current ECC and RSA-3072+ remain secure against all
known classical attacks.

## Instructions

1. **For digital signatures, default to Ed25519.** Ed25519 (Edwards-curve Digital
   Signature Algorithm over Curve25519) provides 128-bit security with significant
   practical advantages: fast signing and verification (tens of thousands of operations
   per second on commodity hardware), short signatures (64 bytes) and public keys (32
   bytes), and deterministic signature generation. Determinism eliminates the catastrophic
   class of bugs where a faulty or biased random number generator leaks the private key
   through signatures -- the PlayStation 3 ECDSA key extraction (2010) exploited exactly
   this flaw, where Sony reused a static nonce in ECDSA signatures, allowing attackers to
   algebraically recover the private signing key. Ed25519 is supported by OpenSSH (since
   6.5), TLS 1.3, JWT (EdDSA algorithm), GPG, and all modern cryptographic libraries.

2. **For key exchange, default to X25519 (ECDHE).** X25519 performs Elliptic Curve
   Diffie-Hellman key exchange over Curve25519, producing a 32-byte shared secret from
   two parties' public keys without either party transmitting the secret. X25519 is the
   key exchange mechanism in TLS 1.3, the Signal Protocol (used by Signal, WhatsApp, and
   others), WireGuard VPN, and the Noise Protocol Framework. Always use ephemeral keys
   (ECDHE -- Elliptic Curve Diffie-Hellman Ephemeral) to achieve forward secrecy: each
   session generates fresh key pairs, computes the shared secret, derives session keys,
   and discards the ephemeral private keys. If a long-term key is later compromised, past
   sessions remain protected because the ephemeral keys no longer exist.

3. **Use RSA only for legacy compatibility.** RSA-2048 is the minimum acceptable key
   size; RSA-3072 is recommended for new deployments that must use RSA (e.g., for
   compatibility with systems that do not support ECC). RSA keys are significantly larger
   than EC keys for equivalent security: 3072-bit RSA provides approximately 128-bit
   security, matching Curve25519 with a key 96x larger. RSA signing and decryption are
   computationally expensive (modular exponentiation with large exponents), making RSA
   substantially slower than Ed25519 for signature operations. For RSA encryption, use
   OAEP padding (PKCS#1 v2.x) exclusively -- never use PKCS#1 v1.5 padding, which is
   vulnerable to Bleichenbacher's adaptive chosen-ciphertext attack (1998), a practical
   attack that recovers plaintext through repeated oracle queries. For RSA signatures,
   prefer PSS padding (PKCS#1 v2.1) over PKCS#1 v1.5 signatures.

4. **Never encrypt large data with asymmetric encryption directly.** Asymmetric
   encryption is orders of magnitude slower than symmetric encryption and has inherent
   message size limits (RSA-2048 with OAEP can encrypt at most ~245 bytes). Use hybrid
   encryption: generate a random symmetric key (e.g., AES-256), encrypt the bulk data
   with the symmetric key using an AEAD mode (AES-256-GCM), then encrypt the symmetric
   key with the recipient's public key. The recipient decrypts the symmetric key with
   their private key, then decrypts the data. TLS, PGP, and CMS/S/MIME all use this
   exact pattern.

5. **Protect private keys absolutely.** Private keys must never appear in logs, be
   transmitted over unencrypted channels, or be stored in plaintext on disk. For highest
   security, store private keys in Hardware Security Modules (HSMs) or Trusted Platform
   Modules (TPMs) where the key material never leaves the secure hardware -- signing
   operations are performed inside the HSM. For software-managed keys, encrypt them at
   rest with a passphrase or a key encryption key (KEK). Rotate keys on any suspicion of
   compromise. Use separate key pairs for different purposes: one pair for signing and a
   different pair for key exchange or encryption, because compromise of one does not then
   compromise the other.

6. **Understand the security level mapping.** Security level describes the computational
   effort required to break the algorithm, expressed in bits of equivalent symmetric key
   strength:

   | Algorithm                    | Key Size | Security Level |
   | ---------------------------- | -------- | -------------- |
   | RSA                          | 2048-bit | ~112-bit       |
   | RSA                          | 3072-bit | ~128-bit       |
   | RSA                          | 4096-bit | ~140-bit       |
   | P-256 (secp256r1/prime256v1) | 256-bit  | ~128-bit       |
   | P-384 (secp384r1)            | 384-bit  | ~192-bit       |
   | Curve25519 (Ed25519/X25519)  | 256-bit  | ~128-bit       |

   For new systems targeting 128-bit security, Curve25519 is optimal: smallest keys,
   fastest operations, simplest implementation (constant-time by design, resistant to
   timing side-channels), and no NSA-related provenance concerns that some practitioners
   associate with the NIST P-curves.

## Details

### RSA Internals (Conceptual)

RSA security relies on the computational difficulty of factoring the product of two large
primes. Key generation: choose two large random primes p and q (each ~1536 bits for
RSA-3072), compute n = p \* q (the modulus), choose public exponent e (conventionally
65537 = 2^16 + 1, which balances security and verification speed), compute private
exponent d as the modular inverse of e mod lcm(p-1, q-1). The public key is (n, e); the
private key is (n, d). Encryption: ciphertext c = m^e mod n. Decryption: plaintext
m = c^d mod n. Security depends on the assumption that factoring n into p and q is
computationally infeasible for sufficiently large n. The best known classical factoring
algorithm (General Number Field Sieve) has sub-exponential but super-polynomial
complexity, making RSA-3072 secure for the foreseeable classical computing era.

### Elliptic Curve Internals (Conceptual)

ECC security relies on the difficulty of the Elliptic Curve Discrete Logarithm Problem
(ECDLP). An elliptic curve over a finite field defines a group structure where point
addition and scalar multiplication are efficient, but the inverse operation (given points
P and Q = kP, finding the scalar k) is computationally infeasible. Key generation: choose
a random scalar k (private key) from the curve's order, compute Q = kP (public key)
where P is the curve's generator point. ECDSA and EdDSA signatures work by encoding a
proof that the signer knows k without revealing it. ECDH key exchange works by having
Alice compute k_A _ Q_B = k_A _ k_B _ P and Bob compute k_B _ Q_A = k_B _ k_A _ P,
arriving at the same shared point. The best known classical attack against ECDLP on
well-chosen curves is Pollard's rho algorithm with O(sqrt(n)) complexity, making 256-bit
curves provide 128-bit security.

### Forward Secrecy with Ephemeral Keys

In TLS 1.3, the handshake mandates ephemeral key exchange. Both client and server
generate fresh X25519 (or P-256) key pairs for each session. The shared secret is
computed via ECDH, used to derive session keys through HKDF, and the ephemeral private
keys are immediately discarded. If the server's long-term private key is later
compromised (through theft, legal compulsion, or cryptanalysis), past session keys cannot
be recovered because the ephemeral private keys no longer exist. This is forward secrecy,
also called perfect forward secrecy (PFS). TLS 1.3 removed all non-forward-secret cipher
suites (static RSA key exchange), making forward secrecy mandatory. Any protocol design
should follow this example.

### Post-Quantum Considerations

Shor's algorithm on a sufficiently large, fault-tolerant quantum computer solves integer
factorization and ECDLP in polynomial time, breaking RSA and all standard elliptic curve
schemes regardless of key size. NIST finalized post-quantum standards in 2024: ML-KEM
(Module-Lattice Key Encapsulation Mechanism, derived from Kyber) for key exchange, and
ML-DSA (Module-Lattice Digital Signature Algorithm, derived from Dilithium) for digital
signatures. Hybrid approaches that combine X25519 + ML-KEM-768 are being deployed in
production (Chrome, Cloudflare) to provide quantum resistance while maintaining classical
security as a fallback. Post-quantum signatures (ML-DSA) are significantly larger than
Ed25519 signatures (2420 bytes vs 64 bytes), which has implications for
bandwidth-constrained protocols. Begin planning migration paths now: inventory all
asymmetric cryptographic usage, identify systems most vulnerable to "harvest now, decrypt
later" attacks (where adversaries record encrypted traffic today for future quantum
decryption), and prioritize those for hybrid or post-quantum migration.

## Anti-Patterns

1. **RSA-1024 or shorter keys.** RSA-768 was factored in 2009; RSA-1024 is within reach
   of well-funded adversaries and is deprecated by every major standards body. Minimum
   acceptable is RSA-2048; prefer RSA-3072 for new systems or, better, switch to
   Ed25519/X25519.

2. **PKCS#1 v1.5 padding for RSA encryption.** Bleichenbacher's adaptive
   chosen-ciphertext attack (1998) allows an attacker who can submit ciphertexts to an
   RSA decryption oracle to recover plaintext through approximately one million queries.
   The ROBOT attack (2017) demonstrated that this vulnerability persisted in major TLS
   implementations nearly 20 years later. Use OAEP (PKCS#1 v2.x) padding exclusively
   for RSA encryption. For signatures, PSS padding is preferred.

3. **Static Diffie-Hellman (no ephemeral keys).** Using the same DH or ECDH key pair for
   all sessions eliminates forward secrecy. If the static private key is compromised, all
   past and future traffic encrypted under that key is decryptable. Always use ephemeral
   key exchange (ECDHE) -- generate a fresh key pair per session and discard the private
   key after the shared secret is derived.

4. **Encrypting large payloads directly with RSA.** RSA-2048 with OAEP can encrypt at
   most 245 bytes per operation (key size minus padding overhead). Attempting to encrypt
   files, messages, or database records directly with RSA requires chunking, which
   introduces complexity, potential padding vulnerabilities, and extreme performance
   penalties. Use hybrid encryption: symmetric cipher for bulk data, RSA/ECC only for
   encrypting the symmetric key.

5. **Trusting self-signed certificates in production.** A self-signed certificate proves
   that the presenter possesses the corresponding private key, but provides no identity
   verification. Without a certificate authority (CA) chain validating the binding between
   the public key and the claimed identity, any attacker can generate their own
   self-signed certificate and intercept traffic via man-in-the-middle. Use certificates
   issued by trusted CAs (Let's Encrypt for public-facing, internal CA for service mesh).
   Certificate pinning provides additional protection against CA compromise but requires
   careful rotation planning.

6. **Reusing nonces in ECDSA signing.** ECDSA (unlike EdDSA/Ed25519) requires a unique
   random nonce k for each signature. If k is reused across two signatures with the same
   private key, the private key can be algebraically recovered from the two signatures.
   This is not a theoretical concern -- the Sony PS3 breach (2010) and multiple Bitcoin
   wallet compromises exploited exactly this flaw. If you must use ECDSA, use RFC 6979
   deterministic nonce generation. Prefer Ed25519 which is deterministic by design.
