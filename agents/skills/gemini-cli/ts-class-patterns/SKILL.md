# TypeScript Class Patterns

> Use abstract classes, private fields, access modifiers, and implements vs extends correctly

## When to Use

- Modeling domain entities with encapsulation and inheritance
- Defining abstract base classes with enforced method contracts
- Choosing between `implements` (interface conformance) and `extends` (inheritance)
- Using access modifiers and private fields for encapsulation

## Instructions

1. **Basic class with typed properties:**

```typescript
class User {
  readonly id: string;
  name: string;
  private email: string;

  constructor(id: string, name: string, email: string) {
    this.id = id;
    this.name = name;
    this.email = email;
  }

  getEmail(): string {
    return this.email;
  }
}
```

2. **Parameter properties** — shorthand for constructor assignment:

```typescript
class User {
  constructor(
    readonly id: string,
    public name: string,
    private email: string
  ) {}
}
// Equivalent to the longer form above
```

3. **Access modifiers:**
   - `public` (default) — accessible everywhere
   - `private` — accessible only within the class (TypeScript-only enforcement)
   - `protected` — accessible within the class and subclasses
   - `#field` — true private (JavaScript runtime enforcement, not just TypeScript)

```typescript
class Account {
  #balance: number; // True private — not accessible even via type assertions

  constructor(initial: number) {
    this.#balance = initial;
  }

  get balance(): number {
    return this.#balance;
  }
}
```

4. **Abstract classes** — define contracts with partial implementations:

```typescript
abstract class Shape {
  abstract area(): number;
  abstract perimeter(): number;

  describe(): string {
    return `Area: ${this.area()}, Perimeter: ${this.perimeter()}`;
  }
}

class Circle extends Shape {
  constructor(private radius: number) {
    super();
  }

  area(): number {
    return Math.PI * this.radius ** 2;
  }
  perimeter(): number {
    return 2 * Math.PI * this.radius;
  }
}
```

5. **`implements` for interface conformance:**

```typescript
interface Serializable {
  serialize(): string;
  deserialize(data: string): void;
}

class Config implements Serializable {
  constructor(private data: Record<string, string>) {}

  serialize(): string {
    return JSON.stringify(this.data);
  }
  deserialize(data: string): void {
    this.data = JSON.parse(data);
  }
}
```

6. **`extends` vs `implements`:**
   - `extends` — single inheritance, inherits implementation
   - `implements` — multiple interface conformance, no implementation inherited

```typescript
interface Loggable {
  log(message: string): void;
}
interface Cacheable {
  cache(): void;
}

class Service extends BaseService implements Loggable, Cacheable {
  log(message: string): void {
    /* ... */
  }
  cache(): void {
    /* ... */
  }
}
```

7. **Static members:**

```typescript
class IdGenerator {
  private static counter = 0;

  static next(): string {
    return `id_${++IdGenerator.counter}`;
  }
}
```

8. **Generic classes:**

```typescript
class Repository<T extends { id: string }> {
  private items = new Map<string, T>();

  save(item: T): void {
    this.items.set(item.id, item);
  }
  find(id: string): T | undefined {
    return this.items.get(id);
  }
  findAll(): T[] {
    return [...this.items.values()];
  }
}

const userRepo = new Repository<User>();
```

9. **Prefer composition over inheritance** when the relationship is "has-a" not "is-a":

```typescript
// Instead of: class UserService extends DatabaseService extends LoggingService
class UserService {
  constructor(
    private db: DatabaseService,
    private logger: LoggingService
  ) {}
}
```

## Details

TypeScript classes compile to JavaScript classes (ES2015+) or constructor functions (ES5 target). They add type annotations, access modifiers, and abstract members on top of standard JavaScript class syntax.

**`private` vs `#private`:**

- `private` — TypeScript compile-time only. The property is still accessible at runtime via `(obj as any).field` or `obj['field']`
- `#private` — JavaScript runtime enforcement. The property is truly inaccessible outside the class. Cannot be accessed even through reflection

**Abstract classes vs interfaces:**

- Abstract classes can contain implemented methods (shared logic) and abstract methods (contracts)
- Interfaces contain only type signatures (no implementation)
- A class can extend only one abstract class but implement many interfaces
- Use abstract classes when you need shared behavior; use interfaces when you need only a contract

**`override` keyword (TypeScript 4.3+):**

```typescript
class Animal {
  move(): void {
    /* ... */
  }
}

class Dog extends Animal {
  override move(): void {
    /* ... */
  } // Error if parent method does not exist
}
```

Enable `noImplicitOverride` to require the `override` keyword on all overridden methods.

**Trade-offs:**

- Classes provide clear encapsulation boundaries — but can lead to deep inheritance hierarchies
- Abstract classes enforce contracts AND share code — but restrict you to single inheritance
- Parameter properties reduce boilerplate — but can be surprising to developers from other languages
- `#private` fields are truly private — but cannot be accessed in tests, which some teams dislike

## Source

https://typescriptlang.org/docs/handbook/2/classes.html

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
