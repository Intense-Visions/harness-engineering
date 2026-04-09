# Microservices: Strangler Fig

> Migrate monoliths incrementally using the strangler fig pattern with facade routing.

## When to Use

- You need to migrate a monolith to microservices without a big-bang rewrite
- You want to extract features one at a time with zero downtime
- You want to run new and old implementations in parallel for validation before cutting over
- You need to reduce risk by allowing rollback per feature, not per entire system

## Instructions

**Phase 1: Add a facade (gateway) in front of the monolith:**

```typescript
// The facade routes ALL traffic — monolith handles everything initially
// Gradually, you move routes to new services one by one

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const MONOLITH_URL = process.env.MONOLITH_URL!;

// Flag store to control which routes go to which target
class FeatureRouter {
  private flags: Map<string, boolean>;

  constructor() {
    this.flags = new Map([
      ['use-new-catalog-service', false],
      ['use-new-user-service', false],
      ['use-new-payment-service', false],
    ]);
  }

  isEnabled(flag: string): boolean {
    return this.flags.get(flag) ?? false;
  }

  // Loaded from DB/config at runtime — allows instant rollback
  async reload(): Promise<void> {
    const config = await db.featureFlags.findMany();
    for (const { key, enabled } of config) {
      this.flags.set(key, enabled);
    }
  }
}

const router = new FeatureRouter();

// Catalog routes — gradually migrated
app.use('/api/catalog', async (req, res, next) => {
  if (router.isEnabled('use-new-catalog-service')) {
    return createProxyMiddleware({
      target: process.env.CATALOG_SERVICE_URL,
      changeOrigin: true,
      pathRewrite: { '^/api/catalog': '' },
    })(req, res, next);
  }
  // Falls through to monolith proxy below
  next();
});

// Everything else goes to the monolith
app.use(
  '/',
  createProxyMiddleware({
    target: MONOLITH_URL,
    changeOrigin: true,
  })
);
```

**Phase 2: Extract a service with parallel-run validation:**

```typescript
// Before full cutover, run both implementations and compare
app.get('/api/catalog/products/:id', async (req, res) => {
  const [monolithResult, newServiceResult] = await Promise.allSettled([
    fetch(`${MONOLITH_URL}/products/${req.params.id}`).then((r) => r.json()),
    fetch(`${CATALOG_SERVICE_URL}/products/${req.params.id}`).then((r) => r.json()),
  ]);

  if (monolithResult.status === 'fulfilled' && newServiceResult.status === 'fulfilled') {
    const diff = deepDiff(monolithResult.value, newServiceResult.value);
    if (diff.length > 0) {
      logger.warn('Response mismatch', { productId: req.params.id, diff });
      metrics.increment('strangler.response_mismatch', { route: 'product_detail' });
    }
  }

  // Always return monolith response during parallel run
  if (monolithResult.status === 'fulfilled') {
    res.json(monolithResult.value);
  } else {
    res.status(500).json({ error: 'Failed' });
  }
});
```

**Phase 3: Full cutover with instant rollback:**

```typescript
// Feature flag controls routing — flip it to cut over
app.use(
  '/api/catalog',
  dynamicRouter(async (req, res, next) => {
    const enabled = await featureFlags.get('use-new-catalog-service');
    if (enabled) {
      proxyToService(CATALOG_SERVICE_URL)(req, res, next);
    } else {
      proxyToService(MONOLITH_URL)(req, res, next);
    }
  })
);

// Rollback = flip the flag back
// No deployment needed
```

**Migration checklist per feature:**

```typescript
const MIGRATION_STEPS = [
  '1. Identify the feature to extract (bounded context)',
  '2. Create the new service with its own database',
  '3. Set up data sync (dual-write or ETL) from monolith DB to new DB',
  '4. Deploy the facade in front of the monolith',
  '5. Run in parallel — route to both, compare responses',
  '6. Validate parity (no response diffs, same performance)',
  '7. Enable feature flag — route to new service',
  '8. Monitor for 1-2 weeks with instant rollback available',
  '9. Disable data sync from monolith',
  '10. Delete monolith code for this feature',
];
```

**Database migration strategy:**

```typescript
// During migration: dual-write to keep both DBs in sync
async function createProduct(data: CreateProductInput): Promise<Product> {
  // Write to monolith DB (source of truth during migration)
  const product = await monolithDb.query('INSERT INTO products ... RETURNING *', [
    data.name,
    data.price,
  ]);

  // Also write to new catalog service's DB (eventually will be primary)
  await catalogDb.product.create({ data: { ...product, migrated: true } }).catch((err) => {
    logger.error('Dual-write to catalog DB failed', { productId: product.id, err });
    // Don't fail the request — monolith is still source of truth
  });

  return product;
}
```

## Details

**Strangler Fig metaphor:** The strangler fig tree grows around a host tree, eventually replacing it. You build the new system around the old one, gradually replacing it piece by piece until the old system is gone.

**What to extract first:**

1. Most actively developed area (reduces developer friction fastest)
2. Independently scalable pieces (immediate operational benefit)
3. Areas with the clearest domain boundaries (lower risk)
4. Avoid: tightly coupled modules, shared database tables without clear ownership

**Anti-patterns:**

- Big bang migration (rewriting everything at once) — high risk, long feedback cycle
- Extracting without a facade — clients must change to call new service URLs
- Not having a rollback plan — always keep the monolith path available during migration
- Migrating data before migrating the service — the data migration is the hardest part; do it last

**Seam finding:** Look for natural boundaries in the monolith:

- Separate URL prefixes (`/catalog/`, `/orders/`)
- Database tables accessed by only one module
- Teams that work on separate features
- Performance hotspots that need independent scaling

## Source

microservices.io/patterns/refactoring/strangler-application.html

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
