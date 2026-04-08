# GOF Prototype Pattern

> Clone objects using prototype registry and structured clone for deep copy scenarios.

## When to Use

- Creating a new object from scratch is expensive (network call, heavy computation) and cloning is cheaper
- You need many variations of a base object with slight differences
- You want to avoid subclassing for object variations — prefer cloning over inheritance
- You maintain a registry of pre-initialized templates to clone on demand

## Instructions

**Explicit clone method (most control):**

```typescript
interface Cloneable<T> {
  clone(): T;
}

class DocumentTemplate implements Cloneable<DocumentTemplate> {
  constructor(
    public title: string,
    public sections: string[],
    public metadata: Record<string, string>
  ) {}

  clone(): DocumentTemplate {
    return new DocumentTemplate(
      this.title,
      [...this.sections], // shallow copy of array
      { ...this.metadata } // shallow copy of object
    );
  }
}

// Use a cloned base instead of constructing from scratch
const invoiceTemplate = new DocumentTemplate(
  'Invoice',
  ['Header', 'Line Items', 'Total', 'Footer'],
  { type: 'invoice', version: '1.0' }
);

const march = invoiceTemplate.clone();
march.title = 'Invoice - March 2024';
march.metadata['period'] = '2024-03';
```

**structuredClone for deep copies (Node 17+, no custom classes):**

```typescript
interface ConfigSnapshot {
  database: { host: string; port: number; pool: { min: number; max: number } };
  features: string[];
  limits: Record<string, number>;
}

function cloneConfig(config: ConfigSnapshot): ConfigSnapshot {
  return structuredClone(config); // deep clone, no circular reference issues
}

const baseConfig: ConfigSnapshot = {
  database: { host: 'localhost', port: 5432, pool: { min: 2, max: 10 } },
  features: ['auth', 'billing'],
  limits: { rateLimit: 100, timeout: 5000 },
};

const devConfig = cloneConfig(baseConfig);
devConfig.database.pool.max = 2; // doesn't affect baseConfig
devConfig.features.push('debug');
```

**Prototype registry:**

```typescript
class ShapeRegistry {
  private prototypes = new Map<string, Shape>();

  register(name: string, prototype: Shape): void {
    this.prototypes.set(name, prototype);
  }

  create(name: string): Shape {
    const proto = this.prototypes.get(name);
    if (!proto) throw new Error(`Unknown shape prototype: ${name}`);
    return proto.clone();
  }
}

// Pre-warm registry at startup
const registry = new ShapeRegistry();
registry.register('red-circle', new Circle({ radius: 10, color: 'red' }));
registry.register('blue-rect', new Rectangle({ width: 20, height: 10, color: 'blue' }));

// Clone cheaply at runtime
const shape1 = registry.create('red-circle');
const shape2 = registry.create('red-circle');
```

**Object.assign for simple shallow clones:**

```typescript
class UserProfile {
  constructor(
    public name: string,
    public email: string,
    public preferences: { theme: string; locale: string }
  ) {}

  withPreferences(overrides: Partial<typeof this.preferences>): UserProfile {
    return Object.assign(new UserProfile(this.name, this.email, { ...this.preferences }), {
      preferences: { ...this.preferences, ...overrides },
    });
  }
}
```

## Details

**Deep vs. shallow clone — pick the right tool:**
| Scenario | Tool |
|---|---|
| Simple POJOs, no class methods needed | `structuredClone()` |
| Class instances with methods | Explicit `clone()` method |
| Shallow one-level copy | `{ ...obj }` or `Object.assign({}, obj)` |
| Arrays | `[...arr]` or `arr.slice()` |

**structuredClone limitations:** Cannot clone functions, class instances (loses prototype chain), DOM nodes, or WeakMap. If you need class instances, use an explicit `clone()` method.

**Anti-patterns:**

- Forgetting to deep-copy nested mutable objects — mutations in the clone affect the original
- Cloning objects with circular references without handling them — `structuredClone` handles this, `JSON.parse(JSON.stringify())` does not
- Treating prototype as a substitute for dependency injection — cloning infrastructure objects (DB pools, HTTP clients) is wrong; inject them instead

**JSON round-trip clone (legacy, avoid):**

```typescript
// Works for simple data, but loses: undefined, Date, functions, class prototypes
const copy = JSON.parse(JSON.stringify(original));
// Prefer structuredClone() instead
```

## Source

refactoring.guru/design-patterns/prototype
