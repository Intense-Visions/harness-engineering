# JS Factory Pattern

> Create objects via a factory function without exposing instantiation logic to callers

## When to Use

- Object creation logic is complex and should be encapsulated
- The exact type of object to create is determined at runtime
- You want to return different implementations based on input without exposing `new` to callers

## Instructions

1. Write a factory function (or static class method) that accepts configuration and returns the correct object.
2. The caller never uses `new` directly — they call the factory.
3. Validate inputs inside the factory before creating the object.
4. Return a consistent interface regardless of which concrete type was created.

```javascript
function createUser(type, name) {
  const roles = {
    admin: { permissions: ['read', 'write', 'delete'] },
    editor: { permissions: ['read', 'write'] },
    viewer: { permissions: ['read'] },
  };

  if (!roles[type]) throw new Error(`Unknown user type: ${type}`);

  return {
    name,
    type,
    ...roles[type],
    greet() {
      return `Hi, I'm ${name} (${type})`;
    },
  };
}

const admin = createUser('admin', 'Alice');
console.log(admin.permissions); // ['read', 'write', 'delete']
```

## Details

The Factory pattern is one of the most common patterns in JavaScript. Unlike `new ClassName()`, a factory function can return different types, apply caching, run validation, or perform async initialization.

**Trade-offs:**

- Callers cannot use `instanceof` to check the type (unless the factory returns a class instance)
- Can become a large switch/if-else block if not maintained

**When NOT to use:**

- When all instances are always the same type — just use `new` directly
- For very simple objects with no creation logic — plain object literals are sufficient

## Source

https://patterns.dev/javascript/factory-pattern
