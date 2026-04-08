# GraphQL Auth Patterns

> Implement authentication and authorization in GraphQL with context-based identity, directives, and field-level guards

## When to Use

- Adding authentication to a GraphQL API
- Implementing role-based or permission-based access control
- Protecting specific fields, types, or mutations
- Choosing between directive-based and resolver-based auth
- Preventing unauthorized data access in nested resolvers

## Instructions

1. **Authenticate in the context factory, not in resolvers.** Extract and verify the auth token during context creation. Every resolver then has access to `context.currentUser` without re-authenticating.

```typescript
const server = new ApolloServer({ typeDefs, resolvers });

app.use(
  '/graphql',
  expressMiddleware(server, {
    context: async ({ req }) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      const currentUser = token ? await verifyJWT(token) : null;
      return { currentUser };
    },
  })
);
```

2. **Create a reusable auth guard function** that resolvers call to check permissions. This keeps authorization logic in one place.

```typescript
function requireAuth(context: Context): AuthenticatedUser {
  if (!context.currentUser) {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return context.currentUser;
}

function requireRole(context: Context, role: string): AuthenticatedUser {
  const user = requireAuth(context);
  if (!user.roles.includes(role)) {
    throw new GraphQLError('Insufficient permissions', {
      extensions: { code: 'FORBIDDEN' },
    });
  }
  return user;
}
```

3. **Use schema directives for declarative auth.** Define `@auth` and `@hasRole` directives to annotate the schema. Implement them as schema transforms.

```graphql
directive @auth on FIELD_DEFINITION | OBJECT
directive @hasRole(role: String!) on FIELD_DEFINITION

type Query {
  me: User @auth
  adminDashboard: Dashboard @hasRole(role: "ADMIN")
  publicPosts: [Post!]!
}

type User @auth {
  id: ID!
  email: String!
  role: String!
}
```

4. **Implement directive transforms using `@graphql-tools/utils`.**

```typescript
import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';

function authDirectiveTransformer(schema: GraphQLSchema) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const authDirective = getDirective(schema, fieldConfig, 'auth')?.[0];
      const roleDirective = getDirective(schema, fieldConfig, 'hasRole')?.[0];

      if (authDirective || roleDirective) {
        const originalResolve = fieldConfig.resolve ?? defaultFieldResolver;
        fieldConfig.resolve = async (source, args, context, info) => {
          if (roleDirective) {
            requireRole(context, roleDirective.role);
          } else {
            requireAuth(context);
          }
          return originalResolve(source, args, context, info);
        };
      }
      return fieldConfig;
    },
  });
}
```

5. **Authorize at the data layer for defense in depth.** Even with resolver-level guards, validate ownership and access in data source methods. This prevents bypasses when resolvers are added or modified.

```typescript
class OrderDataSource {
  async findById(id: string, currentUser: User): Promise<Order> {
    const order = await this.db.orders.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Order');
    if (order.userId !== currentUser.id && !currentUser.roles.includes('ADMIN')) {
      throw new ForbiddenError('Not authorized to view this order');
    }
    return order;
  }
}
```

6. **Filter fields based on permissions when needed.** Some fields should be visible only to certain roles (e.g., `User.email` visible to admins and the user themselves).

```typescript
const resolvers = {
  User: {
    email: (user, _args, { currentUser }) => {
      if (currentUser?.id === user.id || currentUser?.roles.includes('ADMIN')) {
        return user.email;
      }
      return null; // or throw, depending on your schema nullability
    },
  },
};
```

7. **Protect against query depth and complexity attacks.** Authenticated users can still submit expensive queries. Use query depth limiting and cost analysis.

```typescript
import depthLimit from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-validation-complexity';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [depthLimit(10), createComplexityLimitRule(1000)],
});
```

8. **Return `UNAUTHENTICATED` for missing credentials and `FORBIDDEN` for insufficient permissions.** This distinction helps clients show the right UI (login prompt vs. access denied).

## Details

**Authentication vs. authorization:** Authentication answers "who are you?" (JWT verification, session lookup). Authorization answers "can you do this?" (role checks, ownership validation). Keep them separate — authenticate once in context, authorize per field/mutation.

**Auth approaches compared:**

- **Resolver-level guards:** Explicit, easy to test, but verbose in large schemas
- **Schema directives:** Declarative, DRY, but requires schema transformation setup
- **Middleware (graphql-shield):** Rule-based permission layer that sits between resolvers and execution. Good for complex permission matrices
- **Data-layer auth:** Defense in depth — catches bypasses, but harder to return GraphQL-specific errors

**graphql-shield example:**

```typescript
import { shield, rule, allow } from 'graphql-shield';

const isAuthenticated = rule()((parent, args, { currentUser }) => currentUser !== null);
const isAdmin = rule()((parent, args, { currentUser }) => currentUser?.roles.includes('ADMIN'));

const permissions = shield({
  Query: { '*': isAuthenticated, publicPosts: allow },
  Mutation: { deleteUser: isAdmin },
});
```

**Common mistakes:**

- Checking auth in the parent query resolver but not in nested field resolvers (nested fields can be queried through different parents)
- Returning different error shapes for auth failures (always use `GraphQLError` with standard codes)
- Trusting client-side role claims without server-side verification
- Not rate-limiting failed authentication attempts

## Source

https://www.apollographql.com/docs/apollo-server/security/authentication/
