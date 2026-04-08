# GOF Builder Pattern

> Construct complex objects step-by-step using fluent builders and director classes.

## When to Use

- An object requires many optional parameters and a telescoping constructor is unreadable
- You need to construct the same object through different representations (JSON, XML, plain object)
- You want immutable objects with a mutable construction phase
- Validation should happen at `build()` time, not during individual setters

## Instructions

**Fluent builder with TypeScript (most common pattern):**

```typescript
interface QueryConfig {
  table: string;
  conditions: string[];
  orderBy?: string;
  limit?: number;
  offset?: number;
  joins: string[];
}

class QueryBuilder {
  private config: Partial<QueryConfig> = { conditions: [], joins: [] };

  from(table: string): this {
    this.config.table = table;
    return this;
  }

  where(condition: string): this {
    this.config.conditions!.push(condition);
    return this;
  }

  join(clause: string): this {
    this.config.joins!.push(clause);
    return this;
  }

  orderBy(column: string): this {
    this.config.orderBy = column;
    return this;
  }

  limit(n: number): this {
    this.config.limit = n;
    return this;
  }

  offset(n: number): this {
    this.config.offset = n;
    return this;
  }

  build(): string {
    if (!this.config.table) throw new Error('Table is required');

    let query = `SELECT * FROM ${this.config.table}`;
    if (this.config.joins!.length > 0) {
      query += ` ${this.config.joins!.join(' ')}`;
    }
    if (this.config.conditions!.length > 0) {
      query += ` WHERE ${this.config.conditions!.join(' AND ')}`;
    }
    if (this.config.orderBy) query += ` ORDER BY ${this.config.orderBy}`;
    if (this.config.limit !== undefined) query += ` LIMIT ${this.config.limit}`;
    if (this.config.offset !== undefined) query += ` OFFSET ${this.config.offset}`;

    return query;
  }
}

// Usage
const query = new QueryBuilder()
  .from('users')
  .join('LEFT JOIN orders ON orders.user_id = users.id')
  .where('users.active = true')
  .where('users.age > 18')
  .orderBy('users.created_at DESC')
  .limit(20)
  .offset(40)
  .build();
```

**Immutable result via build():**

```typescript
class EmailBuilder {
  private to: string[] = [];
  private subject = '';
  private body = '';
  private cc: string[] = [];
  private attachments: Buffer[] = [];

  addTo(address: string): this {
    this.to.push(address);
    return this;
  }
  withSubject(subject: string): this {
    this.subject = subject;
    return this;
  }
  withBody(body: string): this {
    this.body = body;
    return this;
  }
  addCC(address: string): this {
    this.cc.push(address);
    return this;
  }
  addAttachment(data: Buffer): this {
    this.attachments.push(data);
    return this;
  }

  build(): Readonly<Email> {
    if (this.to.length === 0) throw new Error('At least one recipient required');
    if (!this.subject) throw new Error('Subject is required');
    return Object.freeze({
      to: [...this.to],
      subject: this.subject,
      body: this.body,
      cc: [...this.cc],
      attachments: [...this.attachments],
    });
  }
}
```

**Director class (for reusable construction sequences):**

```typescript
class ReportDirector {
  constructor(private builder: ReportBuilder) {}

  buildSummaryReport(): void {
    this.builder
      .setTitle('Summary Report')
      .addSection('Overview')
      .addSection('KPIs')
      .setFooter('Confidential');
  }

  buildDetailedReport(): void {
    this.builder
      .setTitle('Detailed Report')
      .addSection('Executive Summary')
      .addSection('Data Analysis')
      .addSection('Charts')
      .addSection('Raw Data')
      .addSection('Appendix')
      .setFooter('Confidential');
  }
}
```

## Details

**Why not just use an options object?** Options objects work well for simple configs, but builders shine when:

- Validation logic is non-trivial and should fail loudly at `build()`
- The construction process has ordering constraints
- You need to produce multiple output formats from one construction process

**Anti-patterns:**

- Builder methods that mutate the built object after `build()` — freeze the result
- Builders with required fields that can only be caught at runtime — consider marking with the type system or throwing at `build()`
- Directors that mix construction logic with business logic — keep Directors thin

**TypeScript step builder (enforce required fields at compile time):**

```typescript
// Forces callers to provide required fields before optional ones
interface NeedsTable {
  from(table: string): NeedsCondition;
}
interface NeedsCondition {
  where(cond: string): NeedsCondition;
  build(): string;
  limit(n: number): NeedsCondition;
}

class TypeSafeQueryBuilder implements NeedsTable, NeedsCondition {
  private table = '';
  private conditions: string[] = [];
  private limitVal?: number;

  from(table: string): NeedsCondition {
    this.table = table;
    return this;
  }
  where(cond: string): NeedsCondition {
    this.conditions.push(cond);
    return this;
  }
  limit(n: number): NeedsCondition {
    this.limitVal = n;
    return this;
  }
  build(): string {
    return `SELECT * FROM ${this.table} WHERE ${this.conditions.join(' AND ')}`;
  }

  static create(): NeedsTable {
    return new TypeSafeQueryBuilder();
  }
}

// Compile error if you skip from()
const q = TypeSafeQueryBuilder.create().from('users').where('active = true').build();
```

## Source

refactoring.guru/design-patterns/builder
