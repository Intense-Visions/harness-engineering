# Mutual TLS Design

> Both sides prove their identity with certificates -- the server authenticates to the
> client and the client authenticates to the server, establishing a cryptographically
> verified service-to-service channel

## When to Use

- Authenticating services to each other in a microservices architecture
- Implementing zero trust networking where network location is not sufficient for trust
- Replacing API keys or shared secrets for service-to-service communication
- Deploying a service mesh (Istio, Linkerd, Cilium) with automatic mTLS
- Building internal PKI for workload identity
- Meeting compliance requirements for encrypted and authenticated internal traffic

## Threat Context

Standard TLS authenticates only the server -- the client verifies the server's
certificate, but the server has no cryptographic proof of the client's identity. In
service-to-service communication, this means any service on the network can call any other
service. API keys or bearer tokens add authentication but are static, shared, and
vulnerable to theft -- a stolen API key grants access until someone notices and rotates
it, which can be weeks or months. mTLS provides mutual cryptographic authentication: each
service has its own certificate issued by a trusted CA, and both sides verify the other's
identity during the TLS handshake. The 2017 Equifax breach exploited flat internal
networking with no service authentication -- internal services trusted any connection from
the internal network, allowing the attacker to move laterally through 48 databases after
exploiting a single Apache Struts vulnerability.

## Instructions

1. **Deploy an internal CA.** Use Vault PKI, step-ca (Smallstep), cfssl, or a service
   mesh's built-in CA. Do not use Let's Encrypt for internal mTLS -- Let's Encrypt
   certificates are publicly trusted, intended for public-facing services, and require
   public domain names. Internal CAs issue certificates trusted only within your
   organization's trust store. This limits the blast radius of CA compromise and allows
   you to issue certificates for internal service names that are not publicly resolvable.

2. **Issue short-lived certificates.** 24-72 hour certificate lifetimes eliminate the need
   for revocation infrastructure. If a certificate is compromised, it expires within hours
   rather than remaining valid for months. Automate certificate rotation with cert-manager
   (Kubernetes), Vault Agent, or the service mesh's automatic certificate rotation. The
   operational cost of short-lived certificates is higher, but the security benefit is
   decisive: revocation (CRLs, OCSP) is complex, unreliable, and can be bypassed. Short
   lifetimes make revocation unnecessary.

3. **Use SPIFFE for workload identity.** SPIFFE (Secure Production Identity Framework for
   Everyone) standardizes workload identity as a URI:
   `spiffe://cluster.local/ns/production/sa/payment-service`. SPIRE (the reference
   implementation) acts as a workload attestation agent that verifies workload identity
   using platform-specific selectors (Kubernetes service account, AWS instance metadata,
   Docker container ID) and issues SVID (SPIFFE Verifiable Identity Document) certificates.
   Service meshes (Istio, Linkerd) implement SPIFFE-compatible identity natively.

4. **Configure certificate validation correctly.** Both client and server must validate
   the peer's certificate: verify the certificate chain (signed by a trusted CA), verify
   the certificate is not expired, verify the SAN (Subject Alternative Name) matches the
   expected service identity. Do not disable certificate verification in production --
   ever. `InsecureSkipVerify: true` (Go), `rejectUnauthorized: false` (Node.js),
   `verify=False` (Python requests) all defeat the entire purpose of mTLS by accepting
   any certificate, including attacker-generated ones.

5. **Enforce mTLS at the network level.** In Kubernetes, use PeerAuthentication policies
   (Istio) or NetworkPolicy with identity selectors (Cilium) to ensure that only mTLS
   connections are accepted. Istio's STRICT mode rejects any plaintext connection to the
   service. This prevents accidental fallback to unencrypted communication and ensures
   that no service can communicate without presenting a valid identity certificate.

6. **Handle the migration from plaintext to mTLS.** In brownfield environments with
   existing services communicating over plaintext, deploy mTLS in PERMISSIVE mode first
   (accept both plaintext and mTLS). Monitor which services are still sending plaintext
   using service mesh telemetry. Migrate them one by one, verifying each migration. Once
   all services use mTLS, switch to STRICT mode. Istio's PeerAuthentication supports
   per-namespace and per-service PERMISSIVE/STRICT configuration for gradual rollout.

## Details

### mTLS Handshake

The full TLS handshake with mutual authentication proceeds as follows:

1. Client sends ClientHello (supported cipher suites, TLS version)
2. Server responds with ServerHello, Server Certificate, and CertificateRequest
3. Client verifies the server's certificate against its trust store
4. Client sends its own Client Certificate and CertificateVerify message
5. The CertificateVerify contains a signature over the handshake transcript, proving the
   client possesses the private key corresponding to its certificate
6. Server verifies the client's certificate against its trust store
7. Both sides derive session keys and the encrypted channel is established

The critical difference from standard TLS is step 2 (CertificateRequest) and steps 4-6.
Without the CertificateRequest, the client never presents a certificate and the server
has no cryptographic proof of the client's identity.

### Service Mesh mTLS

In Istio, Envoy sidecar proxies handle mTLS transparently. The application sends
plaintext to localhost on a designated port. The local Envoy sidecar intercepts the
outbound connection, establishes an mTLS connection to the destination's Envoy sidecar,
and forwards the traffic. The destination sidecar decrypts and delivers plaintext to the
destination application. No application code changes are required. Linkerd uses a similar
sidecar architecture with its own proxy (linkerd2-proxy, written in Rust). Cilium uses
eBPF to implement mTLS more efficiently without sidecars, reducing the per-pod resource
overhead.

### SPIFFE/SPIRE Deep Dive

SPIRE has two components: the SPIRE Server (central authority that maintains the signing
CA, registration entries, and trust bundles) and the SPIRE Agent (runs on each node,
attests workloads, caches and distributes SVIDs). Workload attestation uses
platform-specific selectors: Kubernetes service account name and namespace, Docker
container labels, AWS instance ID and IAM role, bare-metal process UID and binary path.
This ensures that only the legitimate workload receives the certificate for its identity.
An attacker who compromises the host but not the workload's attestation properties cannot
obtain a valid SVID.

### Debugging mTLS Failures

Common failure modes and their diagnostics:

| Symptom                         | Likely Cause                           | Diagnostic Command                      |
| ------------------------------- | -------------------------------------- | --------------------------------------- |
| Connection refused              | STRICT mode, client has no certificate | Check PeerAuthentication policy         |
| TLS handshake error             | Certificate not signed by trusted CA   | `openssl s_client -cert ... -key ...`   |
| Identity mismatch               | SAN does not match expected identity   | `openssl x509 -text -in cert.pem`       |
| Intermittent failures           | Certificate expired, clock skew        | Check system time, certificate validity |
| Works from one pod, not another | Missing sidecar injection              | `istioctl authn tls-check`              |

## Anti-Patterns

1. **`InsecureSkipVerify: true` in production.** This disables certificate validation,
   meaning any certificate (self-signed, expired, wrong identity) is accepted. This
   provides encryption but zero authentication. A man-in-the-middle with any certificate
   can intercept all traffic. This single line of code negates the entire mTLS deployment.

2. **Long-lived client certificates.** Certificates with 1-year lifetimes require
   revocation infrastructure (CRLs, OCSP) that is complex and unreliable in practice. CRL
   checking is best-effort in most TLS implementations, and OCSP has soft-fail behavior.
   Use short-lived certificates (24-72 hours) with automatic rotation instead.

3. **Sharing client certificates across services.** If all services use the same client
   certificate and private key, you cannot distinguish between services at the
   authorization layer and cannot implement per-service access control. Each service must
   have its own unique identity certificate. Sharing certificates also means that
   compromising one service compromises the identity of all services.

4. **mTLS without authorization.** mTLS proves identity but does not enforce
   authorization. After verifying the client's certificate identity (e.g.,
   `payment-service`), you still need to check whether `payment-service` is authorized to
   access the requested endpoint. Use service mesh authorization policies (Istio
   AuthorizationPolicy, Cilium NetworkPolicy) to define which services can call which
   endpoints.

5. **Manual certificate distribution.** Copying certificates to servers via SSH, baking
   them into Docker images, or storing them in environment variables does not scale and
   leads to expiration outages. Automate certificate lifecycle with SPIRE, cert-manager,
   Vault Agent, or service mesh automatic rotation. If a human is involved in certificate
   distribution, it will eventually fail.
