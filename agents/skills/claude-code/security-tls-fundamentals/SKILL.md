# TLS Fundamentals

> TLS 1.3 with ECDHE key exchange, AES-256-GCM or ChaCha20-Poly1305 ciphers, and valid
> certificates -- the minimum bar for all network communication

## When to Use

- Setting up HTTPS for a web application or API
- Configuring TLS cipher suites on a server or load balancer
- Diagnosing TLS handshake failures or certificate errors
- Evaluating whether to support TLS 1.2 alongside TLS 1.3
- Implementing certificate pinning or transparency monitoring
- Reviewing a system's transport security posture

## Threat Context

Without TLS, all network traffic is plaintext -- readable and modifiable by anyone on the
network path (ISP, WiFi operator, compromised router, government surveillance).
Man-in-the-middle (MITM) attacks can intercept credentials, session tokens, and sensitive
data. Historical TLS vulnerabilities demonstrate that protocol version and configuration
matter enormously:

- **POODLE** (2014, CVE-2014-3566): Exploited CBC padding in SSL 3.0 and TLS 1.0 to
  decrypt HTTPS traffic byte-by-byte. Forced the deprecation of SSL 3.0.
- **BEAST** (2011, CVE-2011-3389): Exploited a predictable IV in TLS 1.0 CBC mode to
  decrypt data via chosen-plaintext attack.
- **CRIME/BREACH** (2012-2013): Exploited TLS-level and HTTP-level compression to extract
  secrets (session cookies) from encrypted traffic by observing response size changes.
- **Heartbleed** (2014, CVE-2014-0160): A buffer over-read in OpenSSL's heartbeat extension
  leaked up to 64KB of server memory per request -- including private keys, session tokens,
  and user credentials. Affected 17% of the internet's HTTPS servers.
- **FREAK** (2015, CVE-2015-0204): Forced downgrade to export-grade 512-bit RSA, breakable
  in hours.
- **Logjam** (2015, CVE-2015-4000): Forced downgrade to 512-bit Diffie-Hellman, breakable
  by nation-state attackers.

TLS 1.3 eliminates all known protocol-level attacks present in TLS 1.0-1.2 by removing
every insecure cryptographic option from the protocol specification itself.

## Instructions

1. **Deploy TLS 1.3 as the primary protocol.** TLS 1.3 (RFC 8446, 2018) removes all
   insecure cryptographic options from the protocol: no RSA key exchange (no forward
   secrecy), no CBC mode (padding oracle risk), no static DH, no custom DH groups, no RC4,
   no 3DES, no MD5, no SHA-1 in signatures. The only key exchange is ephemeral
   Diffie-Hellman (ECDHE or DHE). The only ciphers are AEAD: AES-128-GCM, AES-256-GCM,
   ChaCha20-Poly1305. The handshake completes in 1 round trip (1-RTT) instead of 2
   (TLS 1.2), reducing latency by one full network round trip.

2. **Support TLS 1.2 as fallback only when required.** Some clients (older Android,
   enterprise proxies, legacy IoT devices) do not support TLS 1.3. If TLS 1.2 must be
   supported, restrict cipher suites to those providing both forward secrecy and AEAD:
   - `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384`
   - `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256`
   - `TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384`
   - `TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256`

   All require ECDHE (forward secrecy) and AEAD ciphers. Reject all non-ECDHE and
   non-AEAD cipher suites.

3. **Disable TLS 1.0 and TLS 1.1 completely.** Both are deprecated by IETF (RFC 8996,
   2021). TLS 1.0 is vulnerable to BEAST and POODLE. TLS 1.1 uses obsolete cipher
   constructions and has no security advantage over TLS 1.2. PCI DSS 3.2+ requires TLS 1.2
   as the minimum for cardholder data environments. All major browsers dropped TLS 1.0/1.1
   support in 2020.

4. **Use valid certificates from a trusted Certificate Authority.** Obtain certificates from
   Let's Encrypt (free, automated via ACME protocol), or a commercial CA for extended
   validation. Every certificate must: match the domain name via Subject Alternative Name
   (SAN), be within its validity period, chain to a trusted root CA in the client's trust
   store, and use RSA-2048+ or ECDSA P-256+ keys. Prefer ECDSA certificates -- they produce
   smaller signatures and faster handshakes than equivalent-security RSA certificates.

5. **Enable HSTS (HTTP Strict Transport Security).** The `Strict-Transport-Security` header
   instructs browsers to only connect via HTTPS, preventing SSL stripping attacks where a
   MITM downgrades HTTPS to HTTP. Set `max-age=31536000; includeSubDomains; preload` for
   maximum protection. Submit to the HSTS preload list (hstspreload.org) so browsers enforce
   HTTPS before the first connection. See `security-hsts-preloading` for preload list
   submission details.

6. **Understand the TLS 1.3 handshake sequence.** Client sends ClientHello containing
   supported cipher suites and key shares for ECDHE. Server responds with ServerHello
   (selected cipher suite and key share), then immediately sends encrypted
   EncryptedExtensions, Certificate, CertificateVerify (proving possession of the private
   key), and Finished. Client verifies the certificate chain, computes the shared secret
   from the key exchange, sends its own Finished message.

   Total: 1 round trip to first application data. With 0-RTT resumption, returning clients
   can send application data on the very first packet, at the cost of replay vulnerability
   for that 0-RTT data.

7. **Monitor Certificate Transparency logs.** Certificate Transparency (CT) is a public,
   append-only log of all certificates issued by participating CAs. Monitor CT logs for your
   domains using crt.sh, Google's CT monitoring, or commercial services (Censys, SSLMate).
   CT monitoring detects misissued certificates (a CA issues a cert for your domain to
   someone else) and unauthorized certificates (an internal CA issues a cert that should not
   exist). React to unexpected certificates immediately -- they indicate either a compromised
   CA or an attacker with CA access.

## Details

- **Cipher suite anatomy (TLS 1.3 vs 1.2)**: TLS 1.3 cipher suite names are simplified:
  `TLS_AES_256_GCM_SHA384` specifies only the AEAD cipher and hash function. Key exchange
  is always ECDHE, negotiated separately via the `supported_groups` extension, so it does
  not appear in the cipher suite name. TLS 1.2 cipher suite names encode everything:
  `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384` means ECDHE key exchange, RSA authentication,
  AES-256-GCM encryption, SHA-384 PRF. This difference reflects TLS 1.3's design
  philosophy: fewer choices, all of them secure.

- **Forward secrecy and why it matters**: Ephemeral key exchange (ECDHE) generates a fresh
  key pair for every session. The session key is derived from the ephemeral exchange, and
  after the session ends, the ephemeral private key is discarded. If the server's long-term
  private key (the certificate key) is later compromised -- through theft, legal compulsion,
  or cryptanalytic breakthrough -- past session keys cannot be recovered because they were
  never derived from the long-term key. Without forward secrecy (static RSA key exchange in
  TLS 1.2), a compromised certificate key decrypts all previously recorded traffic.
  Nation-state adversaries are known to record encrypted traffic for later decryption;
  forward secrecy renders this strategy ineffective.

- **0-RTT resumption: performance vs security tradeoff**: TLS 1.3 supports 0-RTT data on
  resumed connections, where the client sends encrypted application data alongside the
  ClientHello using a pre-shared key from a previous session. This eliminates the handshake
  round trip entirely for returning clients. However, 0-RTT data is fundamentally
  replayable -- an attacker can capture the first flight and replay it to the server. Only
  use 0-RTT for idempotent requests (GET, HEAD). Never permit 0-RTT for state-changing
  operations (POST, PUT, DELETE, financial transactions). Most server implementations reject
  0-RTT by default or limit it to explicitly marked endpoints. If latency is not critical,
  disable 0-RTT entirely.

- **Certificate chain validation in detail**: The client performs five verification steps:
  (1) the leaf certificate's Subject Alternative Name matches the requested domain,
  (2) the certificate is within its validity period (notBefore to notAfter),
  (3) each certificate in the chain is signed by the issuer certificate above it,
  (4) the chain terminates at a root CA in the client's trust store,
  (5) no certificate in the chain appears on a Certificate Revocation List (CRL) or has
  been revoked via OCSP (Online Certificate Status Protocol). OCSP stapling allows the
  server to include a signed, timestamped OCSP response in the TLS handshake, so the client
  does not need to contact the CA separately.

- **ChaCha20-Poly1305 vs AES-GCM**: AES-GCM is faster on hardware with AES-NI instructions
  (most modern x86 and ARM processors). ChaCha20-Poly1305 is faster on devices without AES
  hardware acceleration (older mobile devices, IoT). Both provide equivalent security.
  Supporting both cipher suites ensures optimal performance across all client hardware.
  Server-side cipher preference should select AES-GCM when the client supports AES-NI and
  ChaCha20-Poly1305 otherwise.

## Anti-Patterns

1. **Supporting SSL 3.0, TLS 1.0, or TLS 1.1.** These protocol versions are vulnerable to
   known attacks (POODLE, BEAST, FREAK, Logjam) and have been formally deprecated by the
   IETF. Disable them completely. There is no legitimate reason to support them in 2024+.

2. **Allowing non-AEAD cipher suites in TLS 1.2.** CBC-mode ciphers are vulnerable to
   padding oracle attacks (Lucky Thirteen, POODLE). RC4 is cryptographically broken. Only
   permit GCM or ChaCha20-Poly1305 AEAD cipher suites. If a client cannot negotiate an AEAD
   cipher, the client is too old to trust.

3. **Self-signed certificates in production.** Self-signed certificates provide encryption
   but no identity verification. Every client must disable certificate validation to connect,
   which makes MITM attacks trivial -- the attacker presents their own self-signed
   certificate and the client accepts it. Use Let's Encrypt for free, automated, trusted
   certificates.

4. **Ignoring certificate expiry and failing to automate renewal.** Let's Encrypt
   certificates expire after 90 days. Commercial certificates typically last 1 year.
   Certificate expiry outages are entirely preventable through automation (certbot, Caddy's
   automatic HTTPS, cloud provider managed certificates). A certificate expiry outage in
   production indicates an operational maturity failure, not a technical limitation.

5. **TLS termination at the load balancer with plaintext backend traffic.** Terminating TLS
   at the edge and forwarding plaintext HTTP to backend servers means any compromise of the
   internal network exposes all traffic in cleartext. East-west traffic within a data center
   is a common attack vector after initial compromise. Re-encrypt traffic between the load
   balancer and backends (TLS to backends), or implement end-to-end TLS where the
   application server terminates TLS directly. At minimum, ensure the internal network is
   segmented and monitored.

6. **Disabling certificate verification in client code.** Setting `verify=False`,
   `rejectUnauthorized: false`, or equivalent in HTTP clients to "make it work" during
   development, then shipping that code to production. This disables all protection against
   MITM attacks. Fix the certificate issue instead of disabling verification.

7. **Hardcoding cipher suites without a maintenance plan.** Cipher suite recommendations
   evolve as attacks are discovered. A hardcoded cipher suite list from 2018 may include
   ciphers that are now deprecated. Use a maintained configuration generator (Mozilla SSL
   Configuration Generator) and review cipher suite configuration annually.
