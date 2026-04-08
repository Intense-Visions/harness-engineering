# JS Mixin Pattern

> Add reusable behaviors to classes without deep inheritance chains

## When to Use

- Multiple unrelated classes need the same capability (e.g., serialization, event handling, logging)
- Single inheritance is not sufficient to compose all required behaviors
- You want to share behavior without creating a shared base class

## Instructions

1. Define a mixin as a function that takes a superclass and returns a new class extending it.
2. Apply mixins by chaining: `class MyClass extends Mixin2(Mixin1(Base)) {}`.
3. Keep mixins focused on a single capability — avoid fat mixins that do too much.
4. Alternatively, use `Object.assign(Target.prototype, mixinMethods)` for simpler method injection.

```javascript
// Functional mixin approach
const Serializable = (Base) =>
  class extends Base {
    serialize() {
      return JSON.stringify(this);
    }
    static deserialize(json) {
      return Object.assign(new this(), JSON.parse(json));
    }
  };

const Timestamped = (Base) =>
  class extends Base {
    constructor(...args) {
      super(...args);
      this.createdAt = new Date();
    }
  };

class User extends Serializable(Timestamped(class {})) {
  constructor(name) {
    super();
    this.name = name;
  }
}

const u = new User('Alice');
console.log(u.serialize()); // {"name":"Alice","createdAt":"..."}
```

5. Use TypeScript intersection types to type mixed-in methods correctly.

## Details

JavaScript's single-prototype-chain inheritance means a class can only extend one parent. Mixins work around this by composing behaviors through function application rather than inheritance.

**Trade-offs:**

- Method name collisions between mixins are silent — the last applied mixin wins
- Stack traces can be confusing — intermediate mixin classes appear in the trace
- `instanceof` checks do not work for mixins applied via `Object.assign` (only for the class mixin approach)

**When NOT to use:**

- When composition via plain function calls or hooks would work just as well
- When the behaviors are tightly coupled to specific base classes — inheritance is cleaner
- For simple utility methods — just import a utility function

## Source

https://patterns.dev/javascript/mixin-pattern
