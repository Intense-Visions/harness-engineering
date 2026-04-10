# Certificate Management

> X.509 certificates are the backbone of internet trust -- manage them correctly or accept
> that attackers can impersonate any service, intercept any connection, and forge any
> identity

## When to Use

- Setting up TLS for a new service or domain
- Automating certificate issuance and renewal with ACME/Let's Encrypt
- Designing an internal PKI for service-to-service mTLS
- Evaluating certificate pinning for mobile applications
- Monitoring Certificate Transparency logs for unauthorized certificates
- Handling certificate revocation (CRL vs OCSP vs short-lived certs)

## Threat Context

Compromised or mis-issued certificates enable man-in-the-middle attacks at scale. The
2011 DigiNotar breach resulted in fraudulent certificates for \*.google.com, used by the
Iranian government to intercept Gmail traffic for 300,000 users -- DigiNotar was
subsequently removed from all browser trust stores and went bankrupt. The 2015 CNNIC
incident involved an intermediate CA issuing unauthorized certificates for Google domains,
leading to CNNIC's removal from Chrome and Firefox trust stores. Certificate Transparency
(CT) was created in direct response to these incidents to make all certificate issuance
publicly auditable. Expired certificates cause outages at massive scale: the 2020
Microsoft Teams outage left millions unable to collaborate, and the 2018 Ericsson LTE
outage (affecting 32 million users across 11 countries) were both caused by expired
certificates that no one was monitoring.

## Instructions

1. **Understand the CA hierarchy.** Root CAs (self-signed, stored in browser/OS trust
   stores) sign intermediate CA certificates, which sign end-entity (leaf) certificates.
   Best practice: keep root CAs offline (air-gapped HSM). Use intermediate CAs for
   day-to-day issuance. If an intermediate CA is compromised, revoke it without replacing
   the root. The root CA private key should be used only to sign intermediate CA
   certificates and CRLs, and should never be exposed to any networked system.

2. **Automate with ACME.** Use Let's Encrypt (free, automated) for public-facing TLS. The
   ACME protocol proves domain control through challenges: HTTP-01 (serve a file at
   `/.well-known/acme-challenge/`), DNS-01 (create a TXT record, required for wildcard
   certificates), TLS-ALPN-01 (respond during TLS handshake). Use certbot, cert-manager
   (Kubernetes), or acme.sh. Automate renewal: Let's Encrypt certificates expire in 90
   days; set renewal at 60 days. Test renewal in staging before production deployment.

3. **Monitor Certificate Transparency logs.** CT logs record all publicly issued
   certificates in append-only, cryptographically verifiable logs. Since 2018, Chrome
   requires all new certificates to be logged to CT. Monitor CT logs for your domains to
   detect unauthorized certificate issuance. Tools: crt.sh (manual search), Facebook CT
   Monitor, Cert Spotter (SSLMate). Set up automated alerts for any new certificate
   issued for your domains that you did not request -- this is your early warning system
   for CA compromise or domain hijacking.

4. **Handle revocation correctly.** CRL (Certificate Revocation List): a signed list of
   revoked serial numbers, downloaded periodically by clients -- slow to propagate, can be
   megabytes in size, often stale. OCSP (Online Certificate Status Protocol): real-time
   check of certificate status, but adds latency and is a privacy concern (the CA sees
   which sites you visit). OCSP stapling: the server includes a signed OCSP response in
   the TLS handshake, eliminating the client's need to contact the OCSP responder. Best
   practice: use OCSP stapling and short-lived certificates. If a cert lives for 24 hours,
   revocation is unnecessary because it expires before exploitation is meaningful.

5. **Design internal PKI for mTLS.** For service-to-service authentication, run an
   internal CA (Vault PKI, cfssl, step-ca from Smallstep). Issue short-lived certificates
   (24-72 hours) to services. Short-lived certificates eliminate the need for revocation
   infrastructure entirely. Use SPIFFE (Secure Production Identity Framework for Everyone)
   for standardized service identity URIs. Automate issuance with cert-manager or SPIRE.

6. **Certificate pinning for mobile apps.** Pin the leaf certificate or the public key in
   mobile apps to prevent MITM via compromised CAs. Include backup pins for rotation. Pin
   the intermediate CA key (not the leaf) if you want to rotate leaf certificates without
   app updates. Be cautious: incorrect pinning causes app-breaking outages that require
   app store updates to fix. Include an escape hatch and test rotation thoroughly.

## Details

### X.509 Certificate Anatomy

A certificate contains: Subject (CN, O, OU -- who the certificate identifies), Issuer
(the CA that signed it), Serial Number (unique within the CA), Validity Period (Not
Before / Not After), Public Key (the subject's public key), Signature Algorithm
(RSA-SHA256, ECDSA-SHA384, etc.), and Extensions. Critical extensions: Subject
Alternative Name (SAN) lists all domain names and IPs the certificate covers -- modern
browsers use SAN, not CN. Key Usage specifies allowed operations (digital signature, key
encipherment). Basic Constraints indicates whether the certificate is a CA. Authority
Information Access contains the OCSP responder URL and CA issuers URL.

### ACME Protocol Flow

1. Client contacts ACME server and requests a new order for domain(s)
2. Server returns authorization challenges (HTTP-01, DNS-01, or TLS-ALPN-01)
3. Client provisions the challenge response (file, DNS record, or TLS extension)
4. Client notifies server that the challenge is ready
5. Server validates the challenge (fetches the file, queries DNS, or connects via TLS)
6. On success, client submits a CSR (Certificate Signing Request)
7. Server issues the certificate and returns it

Wildcard certificates (\*.example.com) require the DNS-01 challenge because HTTP-01 cannot
prove control over all subdomains. Let's Encrypt rate limits: 50 certificates per
registered domain per week, 5 duplicate certificates per week.

### Certificate Lifecycle

Request, Issuance, Deployment, Monitoring, Renewal, Revocation (if needed). The most
common failure: forgetting to renew, causing an outage. The second most common:
deploying with an incomplete certificate chain (missing intermediate CA certificates) --
some clients have the intermediate cached and work fine; others fail with "unable to
verify" errors, creating intermittent failures that are difficult to diagnose.

### Certificate Monitoring and Expiration Alerts

Set up automated monitoring for certificate expiration across all services. Tools:
Prometheus with the `blackbox_exporter` (TLS probe checks certificate validity and days
until expiration), Nagios/Icinga certificate checks, or cloud-native monitoring (AWS
Config rule for ACM certificate expiration, GCP Certificate Manager alerts). Alert at
30 days before expiration (informational), 14 days (warning), and 7 days (critical). For
automated ACME renewal, monitor the renewal process itself -- if renewal fails silently,
the first sign of trouble should not be a production outage.

### Short-Lived Certificates as Revocation Replacement

If a certificate lives for 24 hours, the maximum exposure window for a compromised
certificate is 24 hours. Contrast with a 1-year certificate: the compromised certificate
is valid for up to 1 year unless revocation works perfectly. In practice, revocation
rarely works: CRL checking is best-effort in most clients (Chrome does not check CRLs
at all), OCSP has soft-fail behavior (if the OCSP responder is down, most clients accept
the certificate anyway). Short-lived certificates make revocation irrelevant.

## Anti-Patterns

1. **Self-signed certificates in production.** Self-signed certificates disable the CA
   trust chain and train users and developers to ignore certificate warnings. Use Let's
   Encrypt (free, automated) for public services. Use an internal CA for internal
   services. The only acceptable use of self-signed certificates is local development.

2. **Manual certificate renewal.** Certificates that require human intervention for
   renewal will expire and cause outages. The question is not "if" but "when." Automate
   renewal with ACME, cert-manager, or Vault PKI. Monitor expiration dates as a backup.

3. **Incomplete certificate chains.** Deploying a leaf certificate without including the
   intermediate CA certificates. Some clients have the intermediate cached; others do not.
   The result is sporadic TLS failures that depend on the client's cache state. Always
   deploy the full chain: leaf plus all intermediates (not the root).

4. **Certificate pinning without rotation plan.** Pinning a leaf certificate in a mobile
   app means you cannot rotate the certificate without an app update. Pin the intermediate
   CA public key instead, or include backup pins. Never deploy pinning without a tested
   rotation procedure and a documented emergency unpinning process.

5. **Ignoring Certificate Transparency.** If you are not monitoring CT logs for your
   domains, you will not know if a rogue CA or compromised intermediate issues a
   certificate for your domain until users are phished or traffic is intercepted. CT
   monitoring is free and takes minutes to set up.
