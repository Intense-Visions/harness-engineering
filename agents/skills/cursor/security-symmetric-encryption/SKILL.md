# Symmetric Encryption

> AES-256-GCM for most use cases, ChaCha20-Poly1305 when hardware AES is unavailable --
> always use authenticated encryption, never roll your own

## When to Use

- Encrypting data at rest (database fields, file storage, backups)
- Encrypting data in application-layer protocols (beyond TLS)
- Choosing between AES and ChaCha20 for a specific deployment target
- Selecting a mode of operation (GCM, CBC, CTR) for a symmetric cipher
- Reviewing code that performs encryption for correctness
- Designing a key management scheme for encrypted data

## Threat Context

Symmetric encryption defends against confidentiality breaches when an attacker gains
access to stored data (stolen database dumps, compromised backups, unauthorized file
system access) or intercepts data in transit. Without authenticated encryption (AEAD),
an attacker can also tamper with ciphertext without detection -- the padding oracle
attack against AES-CBC (CVE-2014-3566, POODLE) demonstrated this at scale, enabling
plaintext recovery through ciphertext manipulation. Key theft and nonce misuse represent
the two remaining catastrophic failure modes even when a correct algorithm is chosen.

## Instructions

1. **Default to AES-256-GCM.** AES (Advanced Encryption Standard, Rijndael) with
   256-bit keys in GCM (Galois/Counter Mode) provides both confidentiality and integrity
   through authenticated encryption with associated data (AEAD). GCM produces a 128-bit
   authentication tag that detects any ciphertext modification. AES-256-GCM is
   NIST-approved, FIPS 140-2 compliant, and hardware-accelerated on all modern x86
   (AES-NI) and ARM (ARMv8 Crypto Extensions) processors. On hardware with AES-NI,
   AES-256-GCM achieves throughput exceeding 1 GB/s per core.

2. **Use ChaCha20-Poly1305 when AES hardware acceleration is unavailable.** ChaCha20
   is a stream cipher designed by Daniel Bernstein as a refinement of Salsa20, using a
   256-bit key and a 96-bit nonce. Combined with Poly1305 MAC, it provides AEAD
   equivalent in security to AES-GCM. ChaCha20-Poly1305 is faster in software on
   devices without AES-NI (IoT devices, older mobile chipsets, embedded systems). TLS 1.3
   includes both AES-256-GCM and ChaCha20-Poly1305 as mandatory cipher suites. Google
   adopted ChaCha20-Poly1305 in Chrome for Android specifically because most ARM
   processors at the time lacked AES hardware acceleration.

3. **Never use unauthenticated modes in new systems.** AES-CBC (Cipher Block Chaining)
   without a separate HMAC is vulnerable to padding oracle attacks -- an attacker who can
   submit ciphertexts and observe whether decryption produces a padding error can recover
   the full plaintext byte-by-byte. AES-ECB (Electronic Codebook) is structurally broken:
   identical plaintext blocks produce identical ciphertext blocks, leaking patterns in the
   data. AES-CTR (Counter Mode) without a MAC provides confidentiality but allows
   undetected ciphertext bit-flipping -- an attacker who knows the plaintext at a given
   position can flip the corresponding ciphertext bit to produce any desired plaintext
   byte.

4. **Generate IVs/nonces correctly.** GCM requires a unique 96-bit nonce per encryption
   operation under the same key. Nonce reuse under GCM is catastrophic: it reveals the
   XOR of two plaintexts and exposes the GHASH authentication key, allowing forgery of
   authentication tags for arbitrary messages. Use a cryptographically secure pseudorandom
   number generator (CSPRNG) for random nonces. For systems encrypting more than 2^32
   messages under a single key (where random nonce collision probability becomes
   non-negligible by the birthday bound), use a deterministic construction such as
   AES-GCM-SIV, which provides nonce-misuse resistance at a modest performance cost.

5. **Key sizes: 256-bit for future-proofing.** AES-128 is not broken and provides
   128-bit security against classical computers, which is sufficient for current threats.
   AES-256 provides margin against theoretical quantum attacks -- Grover's algorithm
   reduces the effective key strength by half (256-bit becomes 128-bit effective), keeping
   AES-256 secure even in a post-quantum scenario. For all new systems, default to
   256-bit keys. The performance difference between AES-128 and AES-256 is approximately
   40% more rounds (14 vs 10) but negligible in practice with hardware acceleration.

6. **Key derivation from passwords.** Never use a password directly as an encryption key.
   Human-chosen passwords have far less entropy than required for cryptographic keys.
   Derive keys using Argon2id (preferred), scrypt, or PBKDF2-HMAC-SHA256 with a unique
   random salt (at least 128 bits) and sufficient cost parameters. The derived key must be
   exactly the length required by the cipher: 32 bytes for AES-256. Store the salt
   alongside the ciphertext (the salt is not secret). If deriving multiple keys from one
   password (e.g., one for encryption, one for MAC), use distinct info/context parameters
   in an HKDF-Expand step, never truncate or split a single derived key.

7. **Encrypt-then-MAC if forced to use CBC.** If a legacy system requires AES-CBC, apply
   HMAC-SHA256 to the ciphertext (not the plaintext) after encryption. Verify the MAC
   before decrypting -- reject any message with an invalid MAC without attempting
   decryption. This is the encrypt-then-MAC construction and is provably secure under
   standard assumptions. The two alternative compositions -- MAC-then-encrypt (used in
   TLS < 1.3, enabling BEAST and Lucky Thirteen) and encrypt-and-MAC (used in SSH,
   theoretically weaker) -- are both vulnerable to specific attack classes. Always use
   encrypt-then-MAC.

## Details

### Modes of Operation Comparison

| Mode    | Type                   | Parallelizable          | Nonce-Sensitive          | Notes                                                                       |
| ------- | ---------------------- | ----------------------- | ------------------------ | --------------------------------------------------------------------------- |
| GCM     | AEAD                   | Yes (encrypt + decrypt) | Catastrophic on reuse    | Default choice for new systems                                              |
| CBC     | Confidentiality only   | Decrypt only            | IV must be unpredictable | Padding oracle risk; needs separate MAC                                     |
| CTR     | Confidentiality only   | Yes (encrypt + decrypt) | Catastrophic on reuse    | Needs separate MAC; basis for GCM                                           |
| GCM-SIV | AEAD                   | Yes                     | Nonce-misuse resistant   | Slight performance penalty; safe when nonce uniqueness cannot be guaranteed |
| XTS     | Tweakable block cipher | Yes                     | N/A (uses tweak)         | Designed for disk/sector encryption (LUKS, BitLocker); not for general use  |

### The Nonce Reuse Catastrophe

When nonce N is reused with key K for two different plaintexts P1 and P2 under AES-GCM:

- The keystream is identical for both encryptions (since CTR mode generates the keystream
  from the nonce).
- C1 XOR C2 = P1 XOR P2, revealing the XOR of the two plaintexts. With known or
  guessable plaintext fragments, this recovers both messages.
- The GHASH authentication key H is exposed through algebraic analysis of the two
  authentication tags. With H, the attacker can forge valid authentication tags for
  arbitrary ciphertexts under the same key -- a complete authenticity break.
- This is not theoretical: nonce reuse vulnerabilities have been discovered in production
  TLS implementations, and the GHASH key recovery attack has been demonstrated
  practically.

### Associated Data (the "AD" in AEAD)

GCM and ChaCha20-Poly1305 support additional authenticated data (AAD) -- data that is
integrity-protected but not encrypted. The authentication tag covers both the ciphertext
and the AAD, so any modification to either is detected.

Use AAD for metadata that must not be modified but does not need confidentiality:

- The database row ID or primary key (prevents ciphertext from being moved between rows)
- The encryption algorithm identifier (prevents downgrade attacks)
- The key version identifier (prevents ciphertext from being decrypted with the wrong
  key version)
- Any routing or addressing information that must remain in plaintext for the system to
  function

### Key Rotation

Encrypted data must remain decryptable after key rotation. The standard pattern:

- Encrypt with the current active key. Store the key version/ID alongside the ciphertext
  (in the AAD or as a plaintext prefix).
- On decryption, look up the key by version ID and decrypt with the correct key.
- Re-encrypt data under the new key during a migration window (background job, lazy
  re-encryption on read, or bulk migration).
- Never delete old keys until all data encrypted under them has been verified as
  re-encrypted. Maintain a key inventory that tracks which ciphertexts reference which
  key versions.

## Anti-Patterns

1. **ECB mode for anything.** ECB encrypts each block independently -- identical
   plaintext blocks produce identical ciphertext blocks. The famous "ECB penguin"
   demonstrates this visually: encrypting a bitmap image in ECB mode preserves the
   image's visual pattern in the ciphertext. ECB leaks structural information about the
   plaintext and must never be used for any purpose.

2. **Nonce reuse with GCM or CTR.** Reusing a nonce under the same key with GCM or CTR
   modes completely breaks confidentiality and (for GCM) authenticity. Use random nonces
   from a CSPRNG for each encryption operation, enforce nonce uniqueness through counters
   or database constraints for high-volume systems, or switch to AES-GCM-SIV for
   nonce-misuse resistance if uniqueness cannot be guaranteed architecturally.

3. **Using encryption without authentication.** AES-CBC or AES-CTR without a MAC allows
   an attacker to flip bits in the ciphertext, producing modified plaintext that decrypts
   without any error. The Efail attack (2018) exploited this in PGP and S/MIME email
   encryption to exfiltrate plaintext through ciphertext manipulation. Always use AEAD
   (GCM, ChaCha20-Poly1305) or the encrypt-then-MAC construction.

4. **Hardcoded encryption keys.** Embedding keys in source code, configuration files
   committed to version control, environment variables baked into container images, or
   client-side code. Keys must be stored in a dedicated secrets manager (HashiCorp Vault,
   AWS KMS, GCP Cloud KMS, Azure Key Vault) and injected at runtime through secure
   channels. Rotate keys on any suspicion of exposure.

5. **Custom encryption schemes.** Inventing novel cipher combinations, custom padding
   schemes, "double encryption" with two algorithms, or "encryption" via XOR with a
   static or repeated key. Use well-vetted, peer-reviewed library implementations of
   standard algorithms (libsodium, OpenSSL, Web Crypto API, Go crypto/aes).
   Cryptography is the one engineering discipline where cleverness consistently makes
   things worse -- the attack surface of a custom scheme is unknown and unknowable
   without years of public cryptanalysis.
