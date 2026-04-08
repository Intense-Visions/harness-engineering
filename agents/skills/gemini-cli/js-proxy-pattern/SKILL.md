# JS Proxy Pattern

> Intercept and control object property access with ES6 Proxy

## When to Use

- You need to validate, log, or transform property reads/writes without changing the target object
- Implementing reactive data systems (watching object mutations)
- Adding access control or lazy initialization to expensive objects
- Building observable models for state management

## Instructions

1. Create a handler object with trap methods (`get`, `set`, `deleteProperty`, etc.).
2. Wrap the target object: `const proxy = new Proxy(target, handler)`.
3. In `set` traps, always call `Reflect.set(target, prop, value)` to apply the change and return its boolean result.
4. In `get` traps, use `Reflect.get(target, prop, receiver)` to preserve prototype chain behavior.
5. Use `Reflect` methods in traps — they mirror the Proxy trap API and ensure correct semantics.

```javascript
const validator = {
  set(target, prop, value) {
    if (prop === 'age') {
      if (typeof value !== 'number' || value < 0) {
        throw new TypeError('Age must be a non-negative number');
      }
    }
    return Reflect.set(target, prop, value);
  },
};

const person = new Proxy({}, validator);
person.age = 30; // OK
person.age = -1; // Throws TypeError
```

6. Avoid deeply nested Proxy wrapping — it compounds performance overhead on every property access.

## Details

ES6 `Proxy` gives you a meta-programming hook at the object level. Traps intercept fundamental operations: get, set, has, deleteProperty, apply (for functions), and construct (for classes).

**Trade-offs:**

- Proxy adds overhead per property access — avoid on hot paths (tight loops, rendering cycles)
- Proxied objects are not equal to their targets (`proxy !== target`) — equality checks must use the target
- Proxies are not serializable — `JSON.stringify(proxy)` serializes the underlying target, which may surprise callers
- Debugging is harder — the DevTools shows the proxy wrapper, not the target directly

**When NOT to use:**

- For simple validation — just write a setter method or use a class
- For immutability at scale — `Object.freeze()` is simpler and has no runtime overhead per access
- When you need ES5 compatibility — Proxy cannot be polyfilled

**Related patterns:**

- Observer Pattern — Proxy can power reactive observation of object mutations
- Singleton Pattern — a Proxy can wrap a singleton to control access

## Source

https://patterns.dev/javascript/proxy-pattern
