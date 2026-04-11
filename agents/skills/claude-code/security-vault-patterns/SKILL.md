# Vault Patterns

> Centralize secrets in a vault, issue dynamic short-lived credentials, encrypt data
> through a transit engine, and eliminate long-lived secrets from your infrastructure

## When to Use

- Centralizing secrets management across multiple services and environments
- Replacing long-lived database credentials with dynamic, short-lived ones
- Implementing envelope encryption for data at rest
- Managing TLS certificates and PKI infrastructure
- Designing secrets access patterns for Kubernetes workloads
- Evaluating HashiCorp Vault vs cloud-native KMS (AWS KMS, GCP KMS, Azure Key Vault)

## Threat Context

Static, long-lived credentials are the most exploited vulnerability in cloud
environments. The 2019 Capital One breach used stolen IAM credentials that had overly
broad access and never rotated -- a single misconfigured WAF rule exposed temporary
credentials that could access S3 buckets containing 106 million customer records. AWS
reports that exposed access keys are exploited within minutes of being pushed to public
repositories (automated bots scan GitHub continuously). The 2021 Codecov breach
exfiltrated credentials from CI/CD environment variables. Dynamic credentials that expire
in minutes instead of lasting forever reduce the attack window from "indefinitely" to
"minutes." Vault systems also provide audit trails for every secret access, enabling
detection of unauthorized access patterns that static credential storage cannot provide.

## Instructions

1. **Choose the right vault architecture.** HashiCorp Vault: self-hosted or HCP Vault
   (managed), richest feature set, steepest learning curve. AWS Secrets Manager + KMS:
   cloud-native, simple, integrated with IAM. GCP Secret Manager + Cloud KMS: similar to
   AWS, integrated with Workload Identity. Azure Key Vault: similar to AWS, integrated
   with Managed Identity. Sealed Secrets (Bitnami): Kubernetes-specific, encrypts secrets
   for GitOps workflows. For multi-cloud or on-premise: HashiCorp Vault. For single-cloud
   with simple requirements: use the native secrets manager.

2. **Use dynamic secrets instead of static credentials.** Vault's database secret engine
   generates unique database credentials per request with configurable TTL (e.g., 1 hour).
   When the TTL expires, the credentials are automatically revoked. If a credential is
   compromised, the blast radius is limited to that credential's TTL and that single
   consumer. No more shared database passwords in config files. Dynamic secrets exist for
   databases (PostgreSQL, MySQL, MongoDB), cloud providers (AWS, GCP, Azure IAM), SSH
   certificates, and PKI certificates.

3. **Implement envelope encryption for data at rest.** Do not store the data encryption
   key (DEK) alongside the data. Encrypt the DEK with a key encryption key (KEK) managed
   by the vault's transit engine or KMS. Store the encrypted DEK with the data. To
   decrypt: send the encrypted DEK to the vault, get back the plaintext DEK, decrypt the
   data locally. This means the vault never sees your data -- it only manages keys. This
   pattern is used by AWS S3 server-side encryption, Google Cloud Storage, and Azure
   Storage encryption.

4. **Authenticate workloads to the vault.** Kubernetes: use the Kubernetes auth method
   (service account token authentication). AWS: use the IAM auth method (instance profile
   or IAM role). AppRole: for CI/CD and automated systems (role ID + secret ID). Never
   hardcode vault tokens. Every workload authenticates with the identity it already has
   (Kubernetes service account, AWS IAM role, etc.). The authentication method proves the
   workload's identity without introducing new credentials.

5. **Implement PKI and certificate management.** Vault's PKI secret engine acts as a
   certificate authority. Issue short-lived TLS certificates (24-72 hours) to services.
   Short-lived certificates eliminate the need for revocation lists (CRLs) because they
   expire before an attacker can meaningfully exploit a compromised certificate. Automate
   certificate issuance and renewal via cert-manager (Kubernetes) or Vault Agent.

6. **Seal and unseal operations.** HashiCorp Vault uses a seal mechanism: the master key
   is split into shares (Shamir's Secret Sharing). A threshold of shares (e.g., 3 of 5)
   is required to unseal the vault. In production, use auto-unseal with a cloud KMS (the
   KMS key unseals the vault master key). This eliminates the need for human operators to
   provide key shares during restarts while maintaining the security property that the
   vault's data is encrypted at rest.

## Details

### Dynamic Secrets Lifecycle

The lifecycle of a dynamic database credential: application authenticates to Vault with
its Kubernetes service account token, requests database credentials from the database
secret engine, Vault creates a unique database user with the required grants and a 1-hour
TTL, Vault returns the username and password, application uses them for database
connections, TTL expires, Vault revokes the database user by executing `DROP USER`.
Compare this to static credentials: created once by a human, shared across services via
environment variables or config files, never expire, never rotated, compromise is
permanent and undetectable.

### Transit Engine for Application-Level Encryption

The transit engine performs encrypt/decrypt operations without exposing the key material.
The API is simple: `POST /transit/encrypt/my-key` with plaintext data returns ciphertext;
`POST /transit/decrypt/my-key` with ciphertext returns plaintext. Key rotation is
transparent: new versions of the key are created, old ciphertexts can still be decrypted,
re-encryption can be done in batches using `POST /transit/rewrap/my-key`. This allows key
rotation without downtime and without re-encrypting all data immediately.

### Vault in Kubernetes

Three integration patterns: Vault Agent Injector (sidecar that fetches secrets and writes
them to a shared volume as files, best for dynamic secrets that need refresh), CSI Secret
Store Driver (mounts secrets as files via the Container Storage Interface, simpler but
no automatic refresh), External Secrets Operator (syncs vault secrets to Kubernetes
Secret objects, best for static secrets that change infrequently). Recommendation: Vault
Agent for workloads that need dynamic secrets with automatic renewal, External Secrets
Operator for simpler static secret synchronization.

### Disaster Recovery

Vault contains all your secrets -- losing it is catastrophic. Implement: regular
automated snapshots (Vault snapshot agent), cross-region replication (Vault Enterprise
performance replication), a DR cluster (Vault Enterprise DR replication with automated
failover), and tested restore procedures. Test recovery quarterly by restoring a snapshot
to a staging environment and verifying all secret engines are functional. Document the
recovery procedure so it can be executed under pressure during an actual incident.

### Vault vs Cloud-Native KMS Decision Matrix

| Criterion              | HashiCorp Vault      | Cloud-Native KMS/SM      |
| ---------------------- | -------------------- | ------------------------ |
| Dynamic secrets        | Full support         | Limited (IAM roles only) |
| Multi-cloud            | Yes                  | No (vendor-locked)       |
| Transit encryption     | Built-in             | KMS encrypt/decrypt only |
| PKI/certificate mgmt   | Full CA engine       | ACM (AWS), limited       |
| Operational complexity | High (self-managed)  | Low (managed service)    |
| Cost                   | Infrastructure + ops | Per-API-call pricing     |

For teams with dedicated platform engineering, Vault provides the richest feature set.
For small teams on a single cloud, the cloud-native option is operationally simpler.

## Anti-Patterns

1. **Vault with a single unseal key.** If one person has the unseal key and they are
   unavailable, no one can unseal the vault after a restart. Use Shamir's Secret Sharing
   with a 3-of-5 (or similar) threshold, or auto-unseal with a cloud KMS. Single points
   of failure in secrets infrastructure are unacceptable.

2. **Long-lived vault tokens.** Vault tokens with no TTL or very long TTLs defeat the
   purpose of centralized secrets management. If a token is stolen, it provides indefinite
   access. Use short-lived tokens (1-24 hours) with renewal, and configure max TTLs on
   token roles so that even renewed tokens eventually expire.

3. **Vault as a dumb key-value store.** Using Vault only to store static secrets misses
   its most powerful feature: dynamic secrets. If you are storing a database password in
   Vault and sharing it across 10 services, you have centralized the static credential
   but have not eliminated it. Use dynamic secrets to generate unique, short-lived
   credentials per consumer.

4. **No audit logging.** Vault has a built-in audit device that logs every operation
   including the accessor, timestamp, and path accessed. Failing to enable it means you
   cannot detect unauthorized secret access, compromised tokens, or policy violations.
   Enable audit logging to at least one persistent backend (syslog, file, socket).

5. **Skipping seal/unseal understanding.** Deploying Vault without understanding the seal
   mechanism leads to outages when the vault is sealed (due to restart, crash, or manual
   seal) and no one knows how to unseal it. Document the unseal procedure, test it during
   incident drills, and ensure multiple team members can perform it.
