# API Reference

## User Management

### `createUser(email, name)`

Creates a new user with the given email and name.

```typescript
import { createUser } from './src';

const user = createUser('test@example.com', 'John');
```

### `findUserById(id)`

Finds a user by their ID.

```typescript
import { findUserById } from './src';

const user = findUserById('123');
```

## Utilities

### `validateEmail(email)`

Validates an email address format.
