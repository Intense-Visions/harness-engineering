# Valid Project

A sample project for testing entropy detection.

## Usage

```typescript
import { createUser, validateEmail } from './src';

if (validateEmail('test@example.com')) {
  const user = createUser('test@example.com', 'John');
}
```
