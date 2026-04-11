# Secrets Lifecycle

> Secrets are born (generated), distributed (delivered to consumers), rotated (replaced on
> schedule), and die (revoked and destroyed) -- manage every phase or the secret manages you

## When to Use

- Designing how an application retrieves database credentials, API keys, or encryption keys
- Establishing a secret rotation policy for a production system
- Responding to a secret exposure (leaked in logs, committed to Git, visible in error
  messages)
- Choosing between static secrets, dynamic secrets, and short-lived tokens
- Auditing an existing system for secret management gaps
- Evaluating secrets managers (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager)

## Threat Context

Exposed secrets are the most common initial access vector in cloud breaches. The attack
surface is vast and the consequences are immediate:

- **GitHub secret exposure scale**: GitHub's 2023 secret scanning report found 12+ million
  secrets exposed in public repositories in a single year. Automated bots scan every public
  commit within seconds of push -- the median time from commit to attacker exploitation of
  an exposed AWS key is under 1 minute.
- **Uber breach (2022)**: Began with hardcoded credentials discovered in a PowerShell script
  on an internal network share. The attacker used these credentials to access Uber's AWS,
  GCP, and internal Slack environments.
- **CircleCI breach (2023)**: Attackers compromised CircleCI's secrets management
  infrastructure itself, exposing customer secrets stored in the platform. This demonstrates
  that even the secrets manager is a high-value target.
- **Codecov supply chain attack (2021)**: Attackers modified a bash uploader script to
  exfiltrate environment variables (containing secrets) from CI/CD environments to an
  attacker-controlled server.

Secrets have a lifecycle -- generation, distribution, usage, rotation, and revocation -- and
failure at any single phase is a breach waiting to happen. A secret that is generated
securely but never rotated accumulates exposure risk over time. A secret that is rotated
regularly but distributed through insecure channels is exposed at every rotation.

## Instructions

1. **Generate secrets with sufficient entropy.** API keys, tokens, and passwords must
   contain minimum 256 bits of randomness from a cryptographically secure pseudorandom
   number generator (CSPRNG). Use `crypto.randomBytes(32)` in Node.js,
   `secrets.token_hex(32)` in Python, `SecureRandom` in Java, or `/dev/urandom` on Unix.
   Database passwords should be 32+ random characters (letters, digits, symbols). Encryption
   keys must be generated using the crypto library's dedicated key generation function, not
   by hashing a passphrase (unless using a proper KDF like Argon2id with appropriate
   parameters -- see `security-credential-storage`).

2. **Distribute secrets through a secrets manager, never through code or config files.** Use
   HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, or Kubernetes
   Secrets (with envelope encryption via a KMS). Applications retrieve secrets at startup or
   on-demand via authenticated API calls to the secrets manager. The application
   authenticates to the secrets manager using platform identity (IAM roles, Kubernetes
   service accounts, Vault AppRole) -- not with another static secret. Secrets must never be
   committed to version control, embedded in Docker images, passed as build arguments, or
   included in deployment manifests.

3. **Use dynamic secrets when possible.** Instead of a static database password that lives
   forever, use Vault's database secrets engine (or equivalent) to generate short-lived
   credentials with a TTL of 1 hour per application instance. When the TTL expires, the
   credential is automatically revoked at the database level. This eliminates long-lived
   secrets entirely -- there is nothing to rotate because every credential is born with a
   death date. Dynamic secrets are available for databases (PostgreSQL, MySQL, MongoDB),
   cloud providers (AWS STS, GCP service account keys), and PKI certificates.

4. **Rotate static secrets on a mandatory schedule.** When dynamic secrets are not feasible,
   static secrets must be rotated periodically: 90 days maximum for high-sensitivity secrets
   (database root credentials, encryption keys, signing keys), 365 days for low-sensitivity
   secrets (monitoring API keys). Implement dual-read rotation to avoid downtime:
   (a) generate new secret B while secret A is still active, (b) configure all consumers to
   accept both A and B, (c) switch producers to emit B, (d) verify via audit logs that no
   traffic uses A, (e) revoke A. Automate this process -- manual rotation is forgotten
   rotation.

5. **Revoke secrets immediately upon any exposure.** If a secret appears in a log file,
   error message, Git commit, Slack message, support ticket, or any unintended location,
   treat it as compromised. Do not assess whether "anyone noticed" -- assume the worst.
   Revocation procedure: (a) revoke the secret at the source (delete the API key, change the
   password, rotate the certificate), (b) generate a new secret and distribute it through
   the secrets manager, (c) audit access logs from the moment of exposure to determine if
   the secret was exploited, (d) investigate and fix the root cause of the exposure, (e) add
   detection to prevent recurrence (pre-commit hooks, log scrubbing).

6. **Audit all secret access.** The secrets manager must log every access event: who
   requested the secret, when, from which IP/service, and whether the request was granted or
   denied. Configure alerts for anomalies: access from unknown IP ranges, access frequency
   spikes, access to secrets outside the caller's normal pattern, and any access to
   high-sensitivity secrets (root credentials, encryption keys). Audit logs from the secrets
   manager are themselves sensitive and must be stored in a tamper-evident,
   access-controlled location (see `security-audit-log-design`).

7. **Scope secrets to minimum blast radius.** Each service or application instance should
   have its own credentials. Do not share a single database password across 10
   microservices -- if one service is compromised, the attacker has access to the database
   with the privileges of all 10 services. Service-specific credentials enable targeted
   revocation: revoke the compromised service's credentials without disrupting the other 9.
   Apply the principle of least privilege to secret scope: a service that only reads from the
   database should have read-only credentials, not read-write.

## Details

- **The secret exposure cascade**: A leaked AWS access key committed to a public GitHub
  repository triggers a predictable cascade. Automated bots (scanning every public commit
  via GitHub's Events API) detect the key within seconds. The attacker uses the key to call
  `sts:GetCallerIdentity` to identify the account, then `iam:ListUsers`,
  `s3:ListBuckets`, and `ec2:DescribeInstances` to enumerate resources. Data is exfiltrated
  from S3 buckets. EC2 instances are launched for cryptomining. The entire cascade can
  complete within 10 minutes of the commit. Response must be: (1) revoke the key immediately
  via `aws iam delete-access-key`, (2) audit CloudTrail for all API calls made with the key
  since the commit timestamp, (3) rotate all credentials the leaked key could access,
  (4) check for persistence mechanisms the attacker may have installed (new IAM users,
  Lambda functions, EC2 instances), (5) add pre-commit hooks (truffleHog, git-secrets,
  gitleaks) and enable GitHub push protection to prevent recurrence.

- **Dual-read rotation pattern in practice**: Step 1: Generate new database password B.
  Step 2: Execute `ALTER USER app_user SET PASSWORD = B` but also keep A valid (PostgreSQL
  allows this via connection pooler configuration or multiple valid passwords in some
  setups; alternatively, create a new database user with B and grant identical permissions).
  Step 3: Update the secrets manager to serve B. Step 4: Applications pick up B on their
  next secret refresh (within the refresh interval, typically 5-15 minutes). Step 5: Monitor
  audit logs to confirm no connections use A. Step 6: Revoke A (drop the old user or change
  the password). The critical principle: there must never be a moment when neither A nor B
  is valid.

- **Short-lived tokens vs static secrets -- a hierarchy of preference**: Prefer (from best
  to worst): (1) Dynamic secrets with automatic TTL and revocation (Vault database secrets
  engine, AWS STS temporary credentials), (2) OAuth2 access tokens with 1-hour TTL and
  refresh tokens, (3) Platform-managed rotating credentials (AWS RDS IAM authentication,
  GCP Cloud SQL IAM authentication), (4) Static secrets with automated rotation on a 90-day
  schedule, (5) Static secrets with manual rotation (worst case, requires process
  discipline). Each level down the hierarchy increases the window of opportunity for a
  compromised credential.

- **Pre-commit secret scanning**: Tools: truffleHog (entropy-based and regex-based
  detection), git-secrets (AWS-focused patterns), gitleaks (broad pattern library), GitHub's
  built-in push protection (blocks pushes containing known secret formats for supported
  providers). Configure as both a local pre-commit hook (catches secrets before they reach
  the remote) and a CI check (catches secrets that bypass local hooks). Block commits
  containing high-entropy strings matching known secret patterns: AWS keys (prefix `AKIA`),
  GitHub tokens (`ghp_`, `gho_`, `ghs_`), Slack tokens (`xoxb-`, `xoxp-`), private keys
  (`-----BEGIN RSA PRIVATE KEY-----`). Maintain an allowlist for false positives (test
  fixtures, documentation examples with dummy values).

## Anti-Patterns

1. **Secrets in source code or version control.** Once committed, a secret persists in Git
   history even after deletion from HEAD. Every clone of the repository contains the secret
   in its history. Removing it requires `git filter-repo` or BFG Repo Cleaner to rewrite
   history, followed by force-pushing -- and even then, any existing clone or fork retains
   the secret. Always treat a committed secret as compromised regardless of how quickly it
   was removed.

2. **Shared credentials across services and environments.** Production and staging sharing
   the same database password. Multiple microservices using the same API key. A single
   "admin" password for all team members. Compromise of any one consumer compromises all
   consumers. Incident response requires rotating the shared credential and redeploying
   every consumer simultaneously -- an operational nightmare that delays response.

3. **Never-rotated secrets.** A database password created in 2019 and never rotated has had
   5+ years of potential exposure windows: developer laptops, CI/CD logs, backup tapes,
   departed employees' password managers. The longer a secret lives, the more opportunities
   for undetected exposure. Establish rotation schedules, automate them, and alert on
   overdue rotations.

4. **Secrets in environment variables without a secrets manager.** Environment variables are
   visible in process listings (`/proc/PID/environ` on Linux), crash dumps, debugging tools
   (`docker inspect`), container orchestration dashboards, and CI/CD build logs. They are
   better than hardcoding in source but far worse than a proper secrets manager. Use a
   secrets manager to inject secrets directly into the application's memory at startup,
   bypassing the environment entirely.

5. **Logging secrets accidentally.** Application logs that include full HTTP request/response
   bodies (containing Authorization headers or API keys), error messages that dump
   configuration objects (containing database connection strings), and debug logging that
   prints environment variables. Implement structured logging with explicit field selection
   (log only what you intend), add log scrubbing for known secret patterns, and never log
   request bodies containing authentication credentials.

6. **Secrets in CI/CD pipeline definitions.** Storing secrets as plaintext variables in
   GitHub Actions workflow files, Jenkins pipeline scripts, or GitLab CI YAML. Use the CI
   platform's encrypted secrets feature (GitHub Actions secrets, GitLab CI/CD variables
   marked as "masked" and "protected") and ensure secrets are not echoed in build logs.

7. **Using the same secret for authentication and encryption.** An API key used for both
   authenticating to a service and encrypting data at rest. If the authentication use case
   exposes the key (via logs, network capture), the encryption is also compromised. Use
   separate secrets for separate purposes -- key separation is a fundamental cryptographic
   principle.
