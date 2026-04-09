# GOF Template Method

> Define an algorithm skeleton in a base class with abstract steps filled by subclasses.

## When to Use

- Multiple classes share the same algorithm skeleton but differ in specific steps
- You want to enforce a fixed sequence of steps while allowing customization of each step
- You're building parsers, report generators, data importers, or test frameworks where the overall flow is fixed
- You want to avoid code duplication when variations follow the same high-level process

## Instructions

**Classic abstract base class with template method:**

```typescript
abstract class DataImporter {
  // Template method — defines the algorithm skeleton
  async import(source: string): Promise<ImportResult> {
    await this.connect(source);
    try {
      const raw = await this.extract();
      const validated = this.validate(raw);
      const transformed = this.transform(validated);
      const count = await this.load(transformed);
      await this.notify(count);
      return { success: true, count };
    } catch (err) {
      await this.onError(err as Error);
      return { success: false, count: 0, error: (err as Error).message };
    } finally {
      await this.disconnect();
    }
  }

  // Abstract steps — subclasses must implement
  protected abstract connect(source: string): Promise<void>;
  protected abstract extract(): Promise<unknown[]>;
  protected abstract transform(records: unknown[]): Record<string, unknown>[];

  // Hooks — subclasses can override (have defaults)
  protected validate(records: unknown[]): unknown[] {
    return records;
  }
  protected async load(records: Record<string, unknown>[]): Promise<number> {
    // Default load implementation
    console.log(`Loading ${records.length} records`);
    return records.length;
  }
  protected async notify(count: number): Promise<void> {
    console.log(`Import complete: ${count} records`);
  }
  protected async onError(err: Error): Promise<void> {
    console.error('Import failed:', err.message);
  }
  protected async disconnect(): Promise<void> {} // no-op by default
}

// Concrete implementation — CSV importer
class CSVImporter extends DataImporter {
  private connection: string = '';

  protected async connect(source: string): Promise<void> {
    this.connection = source;
    console.log(`Opening CSV file: ${source}`);
  }

  protected async extract(): Promise<unknown[]> {
    // Parse CSV rows
    return [{ name: 'Alice', email: 'alice@example.com' }];
  }

  protected override validate(records: unknown[]): unknown[] {
    return records.filter((r) => (r as Record<string, string>).email?.includes('@'));
  }

  protected transform(records: unknown[]): Record<string, unknown>[] {
    return records.map((r) => ({
      ...(r as Record<string, unknown>),
      importedAt: new Date(),
      source: 'csv',
    }));
  }
}

// Another concrete implementation — JSON API importer
class APIImporter extends DataImporter {
  private baseUrl: string = '';

  protected async connect(source: string): Promise<void> {
    this.baseUrl = source;
  }

  protected async extract(): Promise<unknown[]> {
    const response = await fetch(`${this.baseUrl}/data`);
    return response.json();
  }

  protected transform(records: unknown[]): Record<string, unknown>[] {
    return records.map((r) => ({
      ...(r as Record<string, unknown>),
      importedAt: new Date(),
      source: 'api',
    }));
  }

  protected override async notify(count: number): Promise<void> {
    await fetch(`${this.baseUrl}/ack`, { method: 'POST', body: JSON.stringify({ count }) });
  }
}

// Usage — call the template method, not the individual steps
const csvImporter = new CSVImporter();
await csvImporter.import('/data/users.csv');
```

**Hook methods for optional extension points:**

```typescript
abstract class ReportGenerator {
  generate(data: unknown[]): string {
    const header = this.renderHeader();
    const body = this.renderBody(data);
    const footer = this.renderFooter();

    // Hook — subclasses can add custom sections
    const custom = this.renderCustomSection();

    return [header, body, custom, footer].filter(Boolean).join('\n');
  }

  protected abstract renderHeader(): string;
  protected abstract renderBody(data: unknown[]): string;
  protected renderFooter(): string {
    return '--- End of Report ---';
  }
  protected renderCustomSection(): string {
    return '';
  } // hook — optional override
}
```

## Details

**Template Method vs. Strategy:** Template Method uses inheritance — the base class controls the algorithm; subclasses override steps. Strategy uses composition — the algorithm is injected from outside. Prefer Strategy when: you want to swap algorithms at runtime, or you want to avoid deep inheritance chains. Use Template Method when: the overall structure rarely changes but specific steps vary by subclass.

**Hooks vs. abstract methods:** Abstract methods must be overridden — they enforce required customization. Hooks are optional — they provide extension points with sensible defaults. Use abstract for mandatory steps, hooks for optional customization.

**Anti-patterns:**

- Template method that calls abstract methods in constructors — the subclass might not be fully initialized
- Too many abstract methods — if every step is abstract, the base class provides no value; use a plain interface instead
- Subclasses that override the template method itself — this breaks the invariant; mark the template method as `final` (or just document it clearly)

**TypeScript enforcement:** TypeScript doesn't have a `final` keyword for methods. Document non-overridable template methods with a comment or use the protected pattern:

```typescript
// Convention: prefix with _ to signal "do not override"
// Or use a wrapper:
class Base {
  process(): void {
    // callers use this
    this._doProcess(); // not intended to be overridden
  }
  protected _doProcess(): void {
    /* ... */
  }
}
```

## Source

refactoring.guru/design-patterns/template-method

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
