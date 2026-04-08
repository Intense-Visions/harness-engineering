# OWASP Secrets Management

> Keep credentials out of code, logs, and version control by using environment variables, secrets managers, and strict access controls

## When to Use

- Handling API keys, database credentials, or signing secrets
- Setting up a new service or deployment pipeline
- Reviewing code for hardcoded credentials
- Implementing configuration loading in Node.js/NestJS applications
- Designing secret rotation workflows

## Instructions

### Never Hardcode Secrets

```typescript
// BAD — will end up in version control
const db = new Client({ password: 'super_secret_password' });
const stripe = new Stripe('sk_live_abc123xyz');

// GOOD — always from environment
const db = new Client({ password: process.env.DB_PASSWORD });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
```

Add a startup validation to catch missing secrets early:

```typescript
// config/secrets.ts
const required = ['DB_PASSWORD', 'JWT_SECRET', 'STRIPE_SECRET_KEY', 'REDIS_URL'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  db: { password: process.env.DB_PASSWORD! },
  jwt: { secret: process.env.JWT_SECRET! },
  stripe: { secretKey: process.env.STRIPE_SECRET_KEY! },
} as const;
```

### AWS Secrets Manager / Parameter Store

For production, fetch secrets from a managed service at startup:

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });

async function getSecret(secretId: string): Promise<Record<string, string>> {
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  return JSON.parse(response.SecretString!);
}

// Bootstrap — called once at app startup
async function loadSecrets() {
  const dbCreds = await getSecret('prod/myapp/database');
  process.env.DB_PASSWORD = dbCreds.password;
  process.env.DB_USERNAME = dbCreds.username;

  const appSecrets = await getSecret('prod/myapp/app');
  process.env.JWT_SECRET = appSecrets.jwt_secret;
}
```

### HashiCorp Vault Integration

```typescript
import Vault from 'node-vault';

const vault = Vault({
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN, // Use AppRole in prod, not static token
});

async function getDbCredentials() {
  // Dynamic secrets — Vault generates a new DB user per request
  const result = await vault.read('database/creds/my-role');
  return { username: result.data.username, password: result.data.password };
}
```

### dotenv — Local Development Only

```typescript
// Only load .env in non-production environments
if (process.env.NODE_ENV !== 'production') {
  const { config } = await import('dotenv');
  config(); // loads .env file
}
```

```
# .gitignore — ALWAYS ignore .env files containing real secrets
.env
.env.local
.env.production
*.env

# Commit only the template with no values
.env.example  ← commit this
```

```bash
# .env.example — document required vars without values
DB_PASSWORD=
JWT_SECRET=
STRIPE_SECRET_KEY=
REDIS_URL=
```

### Never Log Secrets

```typescript
// BAD — password appears in logs
logger.info('Connecting to database', { host, port, password });

// GOOD — redact sensitive fields
logger.info('Connecting to database', { host, port, password: '[REDACTED]' });

// Use a redaction library with pino
import pino from 'pino';
const logger = pino({
  redact: {
    paths: ['password', 'secret', 'token', 'apiKey', '*.password', '*.secret'],
    censor: '[REDACTED]',
  },
});
```

## Details

**Secret rotation:** Build services to reload secrets without restart. Use a secrets manager's automatic rotation feature. Store the secret ARN/path in env vars, not the secret value.

**Scanning for leaked secrets:** Add pre-commit hooks with `git-secrets` or `trufflehog`. Run `gitleaks detect` in CI to catch secrets in commit history.

**Principle of least privilege for secrets access:**

- Lambda/ECS tasks should use IAM roles, not hardcoded AWS credentials
- Each service should only have access to its own secrets, not a shared master secret

**Environment hierarchy:**

- Local dev: `.env` file (never commit real secrets)
- CI/CD: encrypted pipeline variables
- Production: IAM role + Secrets Manager / Vault

## Source

https://owasp.org/www-project-top-ten/
