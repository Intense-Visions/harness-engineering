# Harness Secrets

> Secret detection, credential hygiene, and vault integration. Find exposed secrets, classify risk, and enforce externalization before they reach production.

## When to Use

- When scanning source code for hardcoded secrets, API keys, or credentials
- When auditing environment variable hygiene and `.env` file management
- On PRs that modify configuration files or add new service integrations
- NOT for general application security review (use harness-security-review)
- NOT for infrastructure credential management (use harness-infrastructure-as-code)
- NOT for CI/CD secret injection (use harness-deployment)

## Process

### Phase 1: SCAN -- Detect Secrets in Source Code

1. **Scan source files for secret patterns.** Search for common secret formats:
   - **API keys:** Patterns matching `sk-`, `pk_`, `AKIA`, `AIza`, `ghp_`, `glpat-`, `xoxb-`
   - **Connection strings:** Database URIs with embedded credentials (`postgres://user:pass@`)
   - **Private keys:** `-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN EC PRIVATE KEY-----`
   - **JWT tokens:** Base64-encoded strings matching `eyJ` header pattern
   - **Generic secrets:** Variables named `password`, `secret`, `token`, `api_key` with literal string values

2. **Scan configuration files.** Check files that commonly contain secrets:
   - `.env`, `.env.local`, `.env.production` (should be gitignored)
   - `config/*.json`, `config/*.yaml` with credential fields
   - `docker-compose.yml` with inline environment values
   - `application.properties`, `appsettings.json` with connection strings
   - CI/CD pipeline files with hardcoded values

3. **Check `.gitignore` coverage.** Verify that sensitive files are excluded from version control:
   - `.env*` files (except `.env.example`)
   - `*.pem`, `*.key` private key files
   - `credentials/`, `secrets/` directories
   - Service account JSON files (`*-credentials.json`)
   - IDE-specific files that may cache environment variables

4. **Scan git history for leaked secrets.** Check recent commits:
   - Run `git log --diff-filter=A --name-only` for recently added files
   - Check if any `.env` or credential files were committed and later removed
   - Flag files that appear in git history but are now gitignored (the secret is still in history)

5. **Present scan results:**

   ```
   Secret Scan: 7 findings in 5 files

   CRITICAL (2):
     src/config/database.ts:8 -- Hardcoded PostgreSQL connection string with password
     src/services/stripe.ts:3 -- Stripe secret key (sk_example_...)

   HIGH (3):
     docker-compose.yml:15 -- MySQL root password in plaintext
     src/config/aws.ts:12 -- AWS access key pattern (AKIA...)
     .env.production:1 -- File committed to git (should be gitignored)

   MEDIUM (2):
     src/utils/auth.ts:45 -- JWT secret as string literal
     config/app.json:22 -- Generic "apiKey" field with literal value
   ```

---

### Phase 2: CLASSIFY -- Categorize by Risk and Type

1. **Assign severity levels.** Classify each finding:
   - **CRITICAL:** Live production credentials, private keys, cloud provider access keys. Immediate rotation required.
   - **HIGH:** Secrets in committed files, database passwords, service API keys. Rotation strongly recommended.
   - **MEDIUM:** Development-only secrets in source, JWT signing keys, generic tokens. Should be externalized.
   - **LOW:** Example values that look like secrets but are placeholders (`YOUR_API_KEY_HERE`), test-only credentials in test fixtures.

2. **Identify secret type.** Categorize each finding:
   - Cloud provider credentials (AWS, GCP, Azure)
   - Database credentials (connection strings, passwords)
   - Third-party API keys (Stripe, SendGrid, Twilio)
   - Authentication secrets (JWT keys, OAuth client secrets)
   - Encryption keys (symmetric keys, private keys)
   - Internal service tokens (inter-service auth)

3. **Assess blast radius.** For each CRITICAL and HIGH finding:
   - What systems does this credential access?
   - Is the credential scoped (read-only, limited permissions) or broad (admin)?
   - Is the credential shared across environments?
   - When was the credential last rotated?

4. **Check for false positives.** Verify findings are actual secrets:
   - Example/placeholder values in documentation
   - Test fixtures with fake credentials
   - Base64-encoded non-secret data matching JWT patterns
   - Hash values that match key patterns but are not keys

5. **Generate classification report:**

   ```
   Classification:
     CRITICAL: 2 (require immediate rotation)
     HIGH: 3 (require rotation within 24 hours)
     MEDIUM: 2 (require externalization)
     LOW: 0
     False positives: 1 (removed from findings)

   Affected systems:
     - PostgreSQL database (production)
     - Stripe payment processing
     - AWS S3 storage
   ```

---

### Phase 3: REMEDIATE -- Extract and Secure Secrets

1. **Recommend secret externalization.** For each finding, provide the remediation:
   - Replace hardcoded value with environment variable reference
   - Add the variable to `.env.example` with a placeholder value
   - Add the actual value to the deployment secret store
   - Verify `.gitignore` includes the actual `.env` file

2. **Recommend secret management integration.** Based on the project's infrastructure:
   - **HashiCorp Vault:** Dynamic secrets, lease-based rotation, transit encryption
   - **AWS Secrets Manager:** Native AWS integration, automatic rotation for RDS
   - **Google Secret Manager:** GCP-native, IAM-based access control
   - **Azure Key Vault:** Azure-native, HSM-backed key storage
   - **dotenv + CI secrets:** Minimum viable approach for smaller projects

3. **Recommend rotation procedure.** For each CRITICAL and HIGH finding:
   - Generate a new credential in the source system
   - Update the secret store with the new value
   - Deploy the updated configuration
   - Verify the service works with the new credential
   - Revoke the old credential
   - Confirm no systems depend on the old credential

4. **Provide code transformation examples.** Show before/after for each finding:

   ```typescript
   // BEFORE (hardcoded)
   const stripe = new Stripe('sk_example_abc123...');

   // AFTER (externalized)
   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
   ```

5. **If `--fix` flag is set,** apply automatic transformations:
   - Extract hardcoded values to environment variables
   - Add `.env.example` entries with placeholder values
   - Update `.gitignore` if `.env` files are not excluded
   - Present the diff for review before committing

---

### Phase 4: VALIDATE -- Verify Remediation Completeness

1. **Re-scan after remediation.** Run the same scan from Phase 1 to verify:
   - All CRITICAL and HIGH findings are resolved
   - No new secrets were introduced during remediation
   - Environment variable references resolve correctly

2. **Verify `.gitignore` coverage.** Confirm:
   - All `.env` files (except `.env.example`) are gitignored
   - Private key files are gitignored
   - The gitignore patterns are specific enough (not overly broad)

3. **Verify `.env.example` completeness.** Check that:
   - Every environment variable referenced in code has an entry
   - Values are placeholders, not actual secrets
   - Each entry has a comment describing the variable's purpose
   - Required vs. optional variables are clearly marked

4. **Check git history for residual exposure.** If secrets were previously committed:
   - Warn that the secret exists in git history even after removal
   - Recommend `git filter-repo` or BFG Repo-Cleaner for history rewriting
   - Emphasize that rotation is required regardless of history cleanup
   - Note that force-push to remote may be required after history rewrite

5. **Generate validation report:**

   ```
   Secret Validation: [PASS/WARN/FAIL]

   Rescan: PASS (0 CRITICAL, 0 HIGH findings)
   .gitignore: PASS (all sensitive patterns covered)
   .env.example: WARN (missing STRIPE_WEBHOOK_SECRET entry)
   Git history: WARN (2 secrets exist in history -- rotation required)

   Actions remaining:
     1. Add STRIPE_WEBHOOK_SECRET to .env.example
     2. Rotate PostgreSQL password (exposed in commit abc1234)
     3. Rotate Stripe key (exposed in commit def5678)
     4. Consider git history rewrite after rotation
   ```

---

## Harness Integration

- **`harness skill run harness-secrets`** -- Primary invocation for secret scanning and remediation.
- **`harness validate`** -- Run after remediation to verify project health.
- **`harness check-security`** -- Complementary mechanical security scan that includes basic secret detection.
- **`emit_interaction`** -- Present findings and gather decisions on remediation approach.

## Success Criteria

- All source files are scanned for secret patterns
- Findings are classified by severity with accurate false-positive filtering
- CRITICAL and HIGH findings have specific rotation recommendations
- Environment variable externalization is verified
- `.gitignore` covers all sensitive file patterns
- `.env.example` is complete with placeholder values
- Git history exposure is flagged with rotation guidance

## Examples

### Example: Express.js API with Hardcoded Stripe Keys

```
Phase 1: SCAN
  Scanned: 86 files
  Findings: 4

  CRITICAL: src/payments/stripe.ts:5 -- sk_example_EXAMPLE_KEY_REDACTED_0000
  HIGH: docker-compose.yml:22 -- POSTGRES_PASSWORD=supersecret
  MEDIUM: src/config/jwt.ts:3 -- JWT_SECRET = "my-jwt-secret-key"
  LOW: tests/fixtures/auth.ts:8 -- fake-api-key-for-testing (false positive)

Phase 2: CLASSIFY
  CRITICAL: 1 (Stripe production secret key -- full payment access)
  HIGH: 1 (PostgreSQL password -- database access)
  MEDIUM: 1 (JWT secret -- token forgery risk)
  False positives: 1 (test fixture removed from findings)

Phase 3: REMEDIATE
  1. Stripe key -> process.env.STRIPE_SECRET_KEY
  2. Postgres password -> ${POSTGRES_PASSWORD} in compose, actual value in .env
  3. JWT secret -> process.env.JWT_SECRET
  Added 3 entries to .env.example
  Updated .gitignore with .env* pattern

Phase 4: VALIDATE
  Rescan: PASS (0 findings)
  .gitignore: PASS
  .env.example: PASS (all 3 variables documented)
  Git history: WARN (Stripe key in commit history)
  Result: WARN -- secrets externalized, rotation required for Stripe and Postgres
```

### Example: Django Application with AWS Credentials

```
Phase 1: SCAN
  Scanned: 124 files
  Findings: 5

  CRITICAL: settings/production.py:45 -- AWS_ACCESS_KEY_ID = "AKIA..."
  CRITICAL: settings/production.py:46 -- AWS_SECRET_ACCESS_KEY = "wJal..."
  HIGH: .env.production committed to git (12 secrets inside)
  MEDIUM: settings/base.py:88 -- SECRET_KEY = "django-insecure-..."
  MEDIUM: settings/base.py:92 -- DATABASE_URL with embedded password

Phase 2: CLASSIFY
  CRITICAL: 2 (AWS IAM credentials -- full account access)
  HIGH: 1 (.env.production in git -- 12 leaked values)
  MEDIUM: 2 (Django secret key and database URL)

Phase 3: REMEDIATE
  1. AWS credentials -> boto3 credential chain (env vars or IAM role)
  2. Remove .env.production from git, add to .gitignore
  3. Django SECRET_KEY -> os.environ["DJANGO_SECRET_KEY"]
  4. DATABASE_URL -> os.environ["DATABASE_URL"]
  Recommend: Switch to django-environ for all settings
  Recommend: Use IAM roles instead of access keys for production

Phase 4: VALIDATE
  Rescan: PASS
  .gitignore: PASS
  .env.example: PASS
  Git history: CRITICAL (AWS keys and .env.production in history)
  Result: FAIL -- rotation required before deployment, history rewrite recommended
```

## Rationalizations to Reject

| Rationalization                                             | Reality                                                                                                                                                                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "That key is read-only so it's not a big deal if it leaks"  | Read-only credentials still enable data exfiltration, reconnaissance, and discovery of other vulnerabilities. A leaked read-only database credential exposes every row in the database. Scope does not eliminate risk.                               |
| "We removed it from the file — it's cleaned up now"         | Removing a secret from the current tree does not remove it from git history. Anyone with a clone of the repository can recover the secret with `git log -p`. Rotation is required regardless of file deletion.                                       |
| "That's a test environment key, not production"             | Test environment credentials are frequently reused, shared informally, and rotated less often. Leaked test keys also reveal credential patterns and naming conventions that help attackers guess production secrets.                                 |
| "It's in a private repo so only our team can see it"        | Private repos are accessed by CI/CD systems, third-party integrations, contractors, and former employees. Repository access controls are not a substitute for secret externalization. Breaches routinely originate from compromised internal access. |
| "We'll move it to an environment variable before we deploy" | Intent does not prevent exposure. The secret is in the codebase now and may already be in commit history, CI logs, or developer machine caches. Remediation must happen at the moment of detection, not at deployment time.                          |

## Gates

- **No CRITICAL findings may remain unaddressed.** Production credentials exposed in source code are blocking. Execution halts until the credential is rotated and the code is remediated.
- **No `.env` files with actual secrets committed to git.** A committed `.env` file containing real credentials is a blocking finding, even if the file is later gitignored.
- **No secrets in git history without rotation.** If a secret was previously committed, it must be rotated regardless of whether it was removed from the current tree.
- **No remediation without verification.** The `--fix` flag must be followed by a rescan to confirm all findings are resolved.

## Escalation

- **When a production credential is exposed in a public repository:** This is an emergency. Immediately recommend rotating the credential, then address code remediation. Do not wait for a PR review cycle -- rotation must happen within minutes.
- **When git history contains secrets and the repo is public:** Recommend making the repo private temporarily, rotating all exposed credentials, running BFG Repo-Cleaner, and force-pushing. Note that GitHub caches may retain the data -- contact GitHub support if needed.
- **When the team has no secret management infrastructure:** Recommend starting with CI/CD platform secrets (GitHub Secrets, GitLab CI variables) as a minimum viable approach. Design a migration path to a dedicated secret manager for later.
- **When false positive rate is high:** Adjust scan patterns for the project's domain. Add a `.harness/secret-scan-ignore` file with documented exceptions for known false positives (test fixtures, example values, hash constants).
