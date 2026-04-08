# GOF Strategy Pattern

> Encapsulate interchangeable algorithms behind a common interface for runtime selection.

## When to Use

- You have multiple algorithms that do the same job but differently (sorting, pricing, routing, formatting)
- You want to switch algorithms at runtime without changing the client
- You're eliminating large `if/else` chains where each branch implements a different algorithm
- You want algorithms to be testable in isolation from the context that uses them

## Instructions

**Interface + concrete strategies:**

```typescript
// Strategy interface
interface PricingStrategy {
  calculate(basePrice: number, quantity: number, customer: Customer): number;
}

// Concrete strategies
class StandardPricing implements PricingStrategy {
  calculate(basePrice: number, quantity: number): number {
    return basePrice * quantity;
  }
}

class BulkDiscountPricing implements PricingStrategy {
  constructor(
    private readonly threshold: number,
    private readonly discount: number
  ) {}

  calculate(basePrice: number, quantity: number): number {
    if (quantity >= this.threshold) {
      return basePrice * quantity * (1 - this.discount);
    }
    return basePrice * quantity;
  }
}

class MemberPricing implements PricingStrategy {
  calculate(basePrice: number, quantity: number, customer: Customer): number {
    const rate = customer.memberTier === 'gold' ? 0.8 : 0.9;
    return basePrice * quantity * rate;
  }
}

// Context — uses a strategy
class ShoppingCart {
  private strategy: PricingStrategy = new StandardPricing();
  private items: { name: string; price: number; qty: number }[] = [];

  setStrategy(strategy: PricingStrategy): void {
    this.strategy = strategy;
  }

  addItem(name: string, price: number, qty: number): void {
    this.items.push({ name, price, qty });
  }

  calculateTotal(customer: Customer): number {
    return this.items.reduce((total, item) => {
      return total + this.strategy.calculate(item.price, item.qty, customer);
    }, 0);
  }
}

// Runtime selection
const cart = new ShoppingCart();
cart.addItem('Widget', 10.0, 5);

const customer: Customer = { id: 'u1', memberTier: 'gold' };

// Default
console.log(cart.calculateTotal(customer)); // 50.00

// Switch to member pricing
cart.setStrategy(new MemberPricing());
console.log(cart.calculateTotal(customer)); // 40.00

// Switch to bulk discount (20% off 10+)
cart.setStrategy(new BulkDiscountPricing(10, 0.2));
cart.addItem('Widget', 10.0, 6); // now 11 total
console.log(cart.calculateTotal(customer)); // 88.00 (20% off all)
```

**Function-based strategies (TypeScript idiomatic — skip the class):**

```typescript
type SortStrategy<T> = (a: T, b: T) => number;

const sortByName: SortStrategy<{ name: string }> = (a, b) => a.name.localeCompare(b.name);

const sortByDate: SortStrategy<{ createdAt: Date }> = (a, b) =>
  a.createdAt.getTime() - b.createdAt.getTime();

const sortByScore: SortStrategy<{ score: number }> = (a, b) => b.score - a.score; // descending

function sortItems<T>(items: T[], strategy: SortStrategy<T>): T[] {
  return [...items].sort(strategy);
}

// No strategy objects needed — functions are the strategies
const sortedByName = sortItems(users, sortByName);
const sortedByDate = sortItems(users, sortByDate);
```

**Strategy map for configuration-driven selection:**

```typescript
type CompressionType = 'gzip' | 'brotli' | 'zstd' | 'none';

interface Compressor {
  compress(data: Buffer): Promise<Buffer>;
  decompress(data: Buffer): Promise<Buffer>;
}

const compressionStrategies: Record<CompressionType, Compressor> = {
  gzip: new GzipCompressor(),
  brotli: new BrotliCompressor(),
  zstd: new ZstdCompressor(),
  none: new NoopCompressor(),
};

function getCompressor(type: CompressionType): Compressor {
  return compressionStrategies[type];
}

const compressor = getCompressor((process.env.COMPRESSION_TYPE as CompressionType) ?? 'gzip');
const compressed = await compressor.compress(data);
```

## Details

**Strategy vs. State:** Both use polymorphism to replace conditionals. Strategy: the algorithm is chosen externally and remains stable during execution. State: the context transitions between states internally. Ask "who decides when to switch?" — external caller → Strategy, object itself → State.

**Strategy vs. Template Method:** Template Method uses inheritance — the base class defines the algorithm skeleton and subclasses fill in steps. Strategy uses composition — the algorithm is injected. Prefer Strategy (composition) over Template Method (inheritance) in modern TypeScript.

**Anti-patterns:**

- Strategy that needs to access private context state — if it needs too much context data, consider making it a method on the context instead
- Context that exposes its internals specifically for strategies — the strategy interface should only receive what it needs to do its job
- One-off strategies that are never swapped — if you'll never switch the algorithm, don't introduce the indirection

**Testing strategies:** Each strategy can be tested in isolation without a context:

```typescript
describe('BulkDiscountPricing', () => {
  const strategy = new BulkDiscountPricing(10, 0.2);
  it('applies discount when quantity >= threshold', () => {
    expect(strategy.calculate(10, 10, mockCustomer)).toBe(80);
  });
  it('does not apply discount below threshold', () => {
    expect(strategy.calculate(10, 9, mockCustomer)).toBe(90);
  });
});
```

## Source

refactoring.guru/design-patterns/strategy
