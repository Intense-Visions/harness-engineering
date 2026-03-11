# Best Practices Guide

This guide covers proven patterns, strategies, and recommendations for successful Harness Engineering implementation.

## Code Organization

### Directory Structure

Follow a consistent, hierarchical structure:

```
packages/
├── core/
│   ├── src/
│   │   ├── types/           # Type definitions
│   │   ├── config/          # Configuration
│   │   ├── repository/      # Data access
│   │   ├── service/         # Business logic
│   │   ├── ui/              # User interface
│   │   └── __tests__/       # Tests
│   └── package.json
├── cli/
│   ├── src/
│   │   ├── commands/        # CLI commands
│   │   ├── utils/           # Utilities
│   │   └── __tests__/
│   └── package.json
└── shared/
    ├── src/
    │   ├── types/           # Shared types
    │   ├── utils/           # Shared utilities
    │   └── __tests__/
    └── package.json
docs/
├── standard/                # Principles and architecture
├── guides/                  # This section
└── reference/               # CLI and config reference
```

### Key Principles

1. **One-Way Dependencies**: Types → Config → Repository → Service → UI
2. **Layer Isolation**: Each layer has clear responsibilities
3. **Explicit Exports**: Use index.ts files to control API surfaces
4. **Consistent Naming**: Use descriptive, domain-specific names

## Common Patterns

### Pattern: Domain Entity

```typescript
// types/User.ts
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

// repository/UserRepository.ts
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

// service/UserService.ts
export class UserService {
  constructor(private repository: IUserRepository) {}

  async getUser(id: string): Promise<User | null> {
    return this.repository.findById(id);
  }
}
```

### Pattern: Configuration

```typescript
// config/AppConfig.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  database: z.object({
    url: z.string().url(),
    maxConnections: z.number().positive()
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'error'])
  })
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AppConfig {
  const config = JSON.parse(process.env.CONFIG || '{}');
  return ConfigSchema.parse(config);
}
```

### Pattern: Testing

```typescript
// __tests__/UserService.test.ts
import { UserService } from '../service/UserService';

describe('UserService', () => {
  let mockRepository: jest.Mocked<IUserRepository>;
  let service: UserService;

  beforeEach(() => {
    mockRepository = {
      findById: jest.fn()
    };
    service = new UserService(mockRepository);
  });

  it('should fetch user by id', async () => {
    const user: User = { id: '1', email: 'test@example.com', name: 'Test', createdAt: new Date() };
    mockRepository.findById.mockResolvedValue(user);

    const result = await service.getUser('1');

    expect(result).toEqual(user);
    expect(mockRepository.findById).toHaveBeenCalledWith('1');
  });
});
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Circular Dependencies

```typescript
// WRONG: Circular dependency
// user/User.ts imports from auth/Auth.ts
// auth/Auth.ts imports from user/User.ts

// RIGHT: Introduce interface
// shared/types/Auth.ts defines IAuthService
// user/User.ts depends on IAuthService
// auth/Auth.ts implements IAuthService
```

### Anti-Pattern 2: God Objects

```typescript
// WRONG: One massive service
export class UserService {
  createUser() {}
  updateUser() {}
  deleteUser() {}
  sendEmail() {}
  logActivity() {}
  validatePayment() {}
  // ... 50 more methods
}

// RIGHT: Split responsibilities
export class UserService {
  createUser() {}
  updateUser() {}
  deleteUser() {}
}

export class UserNotificationService {
  sendEmail() {}
}

export class UserAuditService {
  logActivity() {}
}
```

### Anti-Pattern 3: Magic Strings

```typescript
// WRONG: Magic strings scattered throughout code
if (user.role === 'admin') { }
if (user.role === 'Admin') { } // Inconsistent!

// RIGHT: Enum or constant
enum Role {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest'
}

if (user.role === Role.Admin) { }
```

## Testing Strategies

### Unit Testing

Test individual functions and methods in isolation:

```typescript
// Test behavior, not implementation
describe('calculateTotal', () => {
  it('should sum item prices', () => {
    const items = [
      { price: 10 },
      { price: 20 }
    ];
    expect(calculateTotal(items)).toBe(30);
  });
});
```

### Integration Testing

Test interactions between components:

```typescript
describe('UserService with Repository', () => {
  it('should persist and retrieve user', async () => {
    const service = new UserService(realRepository);
    const user = await service.createUser('test@example.com');
    const retrieved = await service.getUser(user.id);
    expect(retrieved).toEqual(user);
  });
});
```

### Test Organization

```typescript
// __tests__/
// ├── unit/
// │   └── service.test.ts
// ├── integration/
// │   └── repository.test.ts
// └── fixtures/
//     └── mockData.ts
```

### Test Coverage Goals

- Aim for 80%+ coverage on critical paths
- 100% coverage on types and validators
- Focus on behavior, not line coverage
- Document why uncovered code exists

## Documentation Guidelines

### Document These Things

1. **Architecture Decisions** - Why this structure?
2. **Complex Logic** - What problem does this solve?
3. **Configuration** - How to configure the system?
4. **API Contract** - What inputs/outputs are expected?
5. **Trade-offs** - What alternatives were considered?

### Document Like This

```markdown
# Feature: User Authentication

## Overview
Implements JWT-based authentication with refresh tokens.

## Architecture
1. User submits credentials
2. Service validates against database
3. Returns access + refresh tokens
4. Client stores tokens locally

## Configuration
See `/docs/reference/configuration.md` for environment variables.

## API
- POST /auth/login - Returns tokens
- POST /auth/refresh - Refreshes access token

## Status
Complete. In use in production.

## Related
- [Security Guidelines](/docs/standard/security.md)
- [API Reference](/docs/reference/cli.md)
```

### Keep Documentation Sync'd

- Update docs when code changes
- Link from code to documentation
- Use code comments sparingly (let code speak for itself)
- Run documentation validation in CI/CD

## Agent Workflow Tips

### Setting Up Your Project for Agents

1. **Create AGENTS.md**
   - Navigation for agent understanding
   - Links to key documentation
   - Project structure overview

2. **Clear Architecture**
   - Define layers and dependencies
   - Document constraint rules
   - Provide linter configurations

3. **Comprehensive Tests**
   - Agents need tests to validate changes
   - Use test errors as feedback
   - Keep tests maintainable

4. **Documentation-First**
   - Document before implementing
   - Use docs as specifications
   - Keep docs up-to-date

### Agent-Friendly Code

```typescript
// Good: Clear intent, easy to understand
export async function fetchUserById(userId: string): Promise<User> {
  const user = await repository.findById(userId);
  if (!user) {
    throw new NotFoundError(`User ${userId} not found`);
  }
  return user;
}

// Agents understand this because:
// - Type hints are clear
// - Function name describes what it does
// - Error handling is explicit
// - Behavior is predictable
```

### Agent-Friendly Tests

```typescript
// Good: Tests document expected behavior
describe('fetchUserById', () => {
  it('should return user when found', async () => {
    // Clear test name, clear setup, clear assertion
  });

  it('should throw NotFoundError when user does not exist', async () => {
    // Tests edge cases - agents can learn from this
  });
});
```

## Code Review Checklist

When reviewing code (human or agent-generated):

- [ ] Follows established patterns
- [ ] No circular dependencies
- [ ] Tests pass and cover new code
- [ ] Documentation updated
- [ ] Types are complete (no `any`)
- [ ] Error handling is explicit
- [ ] No magic strings/numbers
- [ ] Configuration is externalized
- [ ] Performance implications considered
- [ ] Security implications reviewed

## Common Mistakes and Fixes

### Mistake: Over-engineering Early

```typescript
// WRONG: Premature optimization
export class UserService {
  private cache = new Cache();
  private queue = new MessageQueue();
  private logger = new Logger();
  // etc.
}

// RIGHT: Simple first, optimize when needed
export class UserService {
  constructor(private repository: IUserRepository) {}
}
// Add caching only after profiling shows it's needed
```

### Mistake: Ignoring Types

```typescript
// WRONG: Types ignored
function processUser(user: any) {
  return user.name.toUpperCase();
  // Agents won't know what properties exist
  // Runtime errors will occur
}

// RIGHT: Strong types
function processUser(user: User): string {
  return user.name.toUpperCase();
  // Clear contract, easier to test, agents understand
}
```

### Mistake: Missing Error Handling

```typescript
// WRONG: No error handling
export async function getUser(id: string) {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

// RIGHT: Explicit error handling
export async function getUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) {
    throw new UserNotFoundError(`User ${id} not found`);
  }
  return response.json();
}
```

## Performance Considerations

### Lazy Loading

```typescript
// Load dependencies only when needed
export class UserService {
  private _emailService: IEmailService | null = null;

  get emailService(): IEmailService {
    if (!this._emailService) {
      this._emailService = new EmailService();
    }
    return this._emailService;
  }
}
```

### Caching Strategy

- Cache computed values with clear TTL
- Invalidate cache on related updates
- Document cache behavior
- Monitor cache hit rates

### Batch Operations

```typescript
// Bad: Multiple individual operations
for (const userId of userIds) {
  await service.deleteUser(userId);
}

// Good: Batch operation
await service.deleteUsers(userIds);
```

## Deployment Best Practices

### Before Deployment

- [ ] All tests pass
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Performance profiled
- [ ] Security audited
- [ ] Secrets not committed

### Deployment Strategy

1. Deploy to staging first
2. Run integration tests
3. Verify documentation renders
4. Get approval from team
5. Deploy to production
6. Monitor for errors

## Resources

- [Implementation Guide](/docs/standard/implementation.md)
- [Configuration Reference](/docs/reference/configuration.md)
- [CLI Reference](/docs/reference/cli.md)

---

*Last Updated: 2026-03-11*
