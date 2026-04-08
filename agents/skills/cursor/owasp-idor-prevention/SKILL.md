# OWASP IDOR Prevention

> Enforce object-level authorization so users can only access resources they own or are permitted to access

## When to Use

- Building any endpoint that fetches a resource by ID (GET /orders/:id, GET /files/:id)
- Implementing multi-tenant applications where data isolation is critical
- Reviewing CRUD APIs for missing ownership checks
- Designing authorization middleware or guards for resource access
- Building admin vs. user role separation

## Instructions

### Always Scope Queries to the Authenticated User

The most reliable pattern: include `userId` in every database query, not just in authorization checks after the fact.

```typescript
// BAD — fetches by ID only, attacker can enumerate any order
app.get('/orders/:id', authenticate, async (req, res) => {
  const order = await db.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order); // returns order even if it belongs to another user
});

// GOOD — scope the query to the current user
app.get('/orders/:id', authenticate, async (req, res) => {
  const order = await db.order.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id, // IDOR prevention at query level
    },
  });
  if (!order) return res.status(404).json({ error: 'Not found' }); // same error for not found and unauthorized
  res.json(order);
});
```

### Authorization Service Pattern

Centralize ownership checks in a dedicated service to avoid scattered, inconsistent checks:

```typescript
// authorization.service.ts
@Injectable()
export class AuthorizationService {
  constructor(private db: PrismaService) {}

  async assertOwnsOrder(userId: string, orderId: string): Promise<Order> {
    const order = await this.db.order.findFirst({
      where: { id: orderId, userId },
    });
    if (!order) throw new ForbiddenException('Access denied');
    return order;
  }

  async assertCanAccessDocument(userId: string, docId: string): Promise<Document> {
    const doc = await this.db.document.findFirst({
      where: {
        id: docId,
        OR: [
          { ownerId: userId },
          { sharedWith: { some: { userId } } },
        ],
      },
    });
    if (!doc) throw new ForbiddenException('Access denied');
    return doc;
  }
}

// order.controller.ts
@Get(':id')
async getOrder(@Param('id') id: string, @CurrentUser() user: User) {
  return this.authz.assertOwnsOrder(user.id, id);
}
```

### Role-Based Access with Resource Guards

```typescript
// resource-owner.guard.ts
@Injectable()
export class ResourceOwnerGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user.id;
    const resourceId = req.params.id;
    const resourceType = this.reflector.get<string>('resourceType', context.getHandler());

    await this.authz.assertOwns(userId, resourceType, resourceId);
    return true;
  }
}

// Usage
@Get(':id')
@SetMetadata('resourceType', 'order')
@UseGuards(ResourceOwnerGuard)
getOrder(@Param('id') id: string) { ... }
```

### Indirect Reference Maps (UUIDs over Sequential IDs)

Use UUIDs for public-facing resource identifiers. Sequential IDs make enumeration trivial.

```typescript
// PREDICTABLE — easy to enumerate
// GET /invoices/1, /invoices/2, /invoices/3 ...

// BETTER — UUID makes guessing computationally infeasible
// GET /invoices/550e8400-e29b-41d4-a716-446655440000

// Prisma schema
model Order {
  id     String @id @default(uuid())
  userId String
  // ...
}
```

For extra security with internal sequential IDs, map them to tokens:

```typescript
// Return opaque tokens instead of raw IDs
function encodeResourceId(internalId: number, secret: string): string {
  // Use a deterministic encryption (not hash) so you can decode
  return Buffer.from(`${internalId}:${secret}`).toString('base64url');
}
```

## Details

IDOR (also called BOLA — Broken Object Level Authorization) is the #1 API security issue per OWASP API Security Top 10. Authentication tells you WHO the user is; authorization tells you WHAT they can access.

**Common IDOR mistakes:**

- Checking auth at controller level but using unchecked ID in a service call
- Returning 403 only after fetching the resource (information still leaked in timing)
- Trusting user-supplied `userId` in request body instead of the JWT/session

**Return 404 not 403 for unauthorized resources** — returning 403 confirms the resource exists, enabling enumeration.

**Audit checklist:**

- Every `findById` / `findUnique` call — does it include `userId` or equivalent scope?
- Every bulk list endpoint — does it filter to current user's data?
- Admin routes — are they properly gated behind role checks?

## Source

https://owasp.org/www-project-top-ten/
