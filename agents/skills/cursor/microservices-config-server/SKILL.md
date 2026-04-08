# Microservices: Config Server

> Centralize configuration, feature flags, and secrets management across services.

## When to Use

- Multiple services share configuration and you're managing it via environment variables per service
- You need to change feature flags or configuration without redeploying services
- You need secrets management — services should not store credentials in source code or environment variables directly
- You need to audit who changed which configuration and when

## Instructions

**Environment variables (baseline — always start here):**

```typescript
// config.ts — typed config validation at startup
import { z } from 'zod';

const ConfigSchema = z.object({
  // Server
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),

  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  // Redis
  REDIS_URL: z.string().url(),

  // External services
  PAYMENT_SERVICE_URL: z.string().url(),
  NOTIFICATION_SERVICE_URL: z.string().url(),

  // Feature flags (simple boolean env vars)
  FEATURE_NEW_CHECKOUT: z.coerce.boolean().default(false),
  FEATURE_LOYALTY_PROGRAM: z.coerce.boolean().default(false),
});

// Validate on startup — fail fast if config is missing
const parseResult = ConfigSchema.safeParse(process.env);
if (!parseResult.success) {
  console.error('Invalid configuration:', parseResult.error.format());
  process.exit(1);
}

export const config = parseResult.data;
```

**AWS Secrets Manager (for credentials):**

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });

// Cache secrets to avoid per-request API calls
const secretCache = new Map<string, { value: unknown; expiresAt: number }>();

async function getSecret<T>(secretId: string, ttlMs = 300_000): Promise<T> {
  const cached = secretCache.get(secretId);
  if (cached && Date.now() < cached.expiresAt) return cached.value as T;

  const command = new GetSecretValueCommand({ SecretId: secretId });
  const response = await secretsManager.send(command);

  const value = JSON.parse(response.SecretString!);
  secretCache.set(secretId, { value, expiresAt: Date.now() + ttlMs });
  return value as T;
}

// At startup: load secrets into config
const dbSecret = await getSecret<{ username: string; password: string }>(
  `${process.env.NODE_ENV}/order-service/database`
);

const databaseUrl = `postgresql://${dbSecret.username}:${dbSecret.password}@${process.env.DB_HOST}/orders`;
```

**Feature flags with LaunchDarkly (runtime flags):**

```typescript
import { LDClient, init as ldInit } from '@launchdarkly/node-server-sdk';

let ldClient: LDClient;

async function initFeatureFlags(): Promise<void> {
  ldClient = ldInit(process.env.LAUNCHDARKLY_SDK_KEY!);
  await ldClient.waitForInitialization({ timeout: 10 });
  console.log('Feature flags initialized');
}

async function isFeatureEnabled(
  flagKey: string,
  userId: string,
  defaultValue = false
): Promise<boolean> {
  return ldClient.variation(flagKey, { key: userId }, defaultValue);
}

// Usage in route handler
app.post('/orders', async (req, res) => {
  const useNewCheckout = await isFeatureEnabled('new-checkout-flow', req.user.id);

  if (useNewCheckout) {
    return newCheckoutFlow(req, res);
  }
  return legacyCheckoutFlow(req, res);
});
```

**Kubernetes ConfigMap + Secret (for containerized services):**

```yaml
# configmap.yaml — non-sensitive config
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-service-config
  namespace: production
data:
  NODE_ENV: 'production'
  DATABASE_POOL_MIN: '2'
  DATABASE_POOL_MAX: '10'
  PAYMENT_SERVICE_URL: 'http://payment-service:8080'

---
# secret.yaml — sensitive config (base64 encoded values)
apiVersion: v1
kind: Secret
metadata:
  name: order-service-secrets
  namespace: production
type: Opaque
stringData:
  DATABASE_URL: 'postgresql://user:pass@postgres:5432/orders'
  STRIPE_SECRET_KEY: 'sk_live_...'

---
# deployment.yaml — inject config into container
spec:
  containers:
    - name: order-service
      envFrom:
        - configMapRef:
            name: order-service-config
        - secretRef:
            name: order-service-secrets
```

**Consul KV for dynamic config:**

```typescript
import Consul from 'consul';

const consul = new Consul({ host: process.env.CONSUL_HOST });

class DynamicConfig {
  private cache = new Map<string, unknown>();

  async get<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const result = await consul.kv.get(`config/order-service/${key}`);
      if (!result) return defaultValue;
      const value = JSON.parse(result.Value);
      this.cache.set(key, value);
      return value as T;
    } catch {
      return (this.cache.get(key) as T) ?? defaultValue;
    }
  }

  // Watch for changes — update at runtime without restart
  watch(key: string, callback: (value: unknown) => void): void {
    const watcher = consul.watch({
      method: consul.kv.get,
      options: { key: `config/order-service/${key}` },
    });

    watcher.on('change', (data) => {
      if (data) {
        const value = JSON.parse(data.Value);
        this.cache.set(key, value);
        callback(value);
      }
    });
  }
}
```

## Details

**Configuration hierarchy (start simple, grow as needed):**

1. Environment variables (all teams, simple services)
2. Kubernetes ConfigMaps + Secrets (Kubernetes shops)
3. AWS Parameter Store / Secrets Manager (AWS shops, rotation needs)
4. Consul KV / HashiCorp Vault (multi-cloud, complex rotation)
5. LaunchDarkly / Unleash (feature flag-heavy workflows)

**Secrets rotation:** Use AWS Secrets Manager or Vault with auto-rotation. Services should reload credentials on 401/403 responses (the secret may have rotated). Cache secrets with short TTLs (5-10 minutes).

**Anti-patterns:**

- Secrets in source code or committed environment files
- Configuration that changes behavior but isn't version-controlled — config is code; track it
- Loading all configuration at startup without validation — use Zod or similar to fail fast

**12-Factor App principle:** Configuration belongs in the environment, not in the code. Everything that varies between environments (dev, staging, production) must be an environment variable or externalized config. Never hardcode URLs, ports, or credentials.

## Source

microservices.io/patterns/externalized-configuration.html
