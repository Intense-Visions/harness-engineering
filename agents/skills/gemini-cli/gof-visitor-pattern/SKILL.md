# GOF Visitor Pattern

> Add operations to object structures without modifying them using double dispatch.

## When to Use

- You need to add new operations to a stable object hierarchy without modifying those classes
- You're processing ASTs, expression trees, file system hierarchies, or DOM trees
- You have many unrelated operations on the same object structure and don't want to pollute it
- You want to accumulate state across a traversal (collecting, counting, validating)

## Instructions

**Double dispatch visitor:**

```typescript
// Element interface — accept any visitor
interface Expression {
  accept<T>(visitor: ExpressionVisitor<T>): T;
}

// Concrete elements
class NumberLiteral implements Expression {
  constructor(public readonly value: number) {}
  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitNumber(this);
  }
}

class AddExpression implements Expression {
  constructor(
    public readonly left: Expression,
    public readonly right: Expression
  ) {}
  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitAdd(this);
  }
}

class MultiplyExpression implements Expression {
  constructor(
    public readonly left: Expression,
    public readonly right: Expression
  ) {}
  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitMultiply(this);
  }
}

// Visitor interface — one method per element type
interface ExpressionVisitor<T> {
  visitNumber(node: NumberLiteral): T;
  visitAdd(node: AddExpression): T;
  visitMultiply(node: MultiplyExpression): T;
}

// Concrete visitors — separate operations from the object structure

// Evaluate the expression
class EvaluateVisitor implements ExpressionVisitor<number> {
  visitNumber(node: NumberLiteral): number {
    return node.value;
  }
  visitAdd(node: AddExpression): number {
    return node.left.accept(this) + node.right.accept(this);
  }
  visitMultiply(node: MultiplyExpression): number {
    return node.left.accept(this) * node.right.accept(this);
  }
}

// Pretty print the expression
class PrintVisitor implements ExpressionVisitor<string> {
  visitNumber(node: NumberLiteral): string {
    return `${node.value}`;
  }
  visitAdd(node: AddExpression): string {
    return `(${node.left.accept(this)} + ${node.right.accept(this)})`;
  }
  visitMultiply(node: MultiplyExpression): string {
    return `(${node.left.accept(this)} * ${node.right.accept(this)})`;
  }
}

// Count nodes
class CountVisitor implements ExpressionVisitor<number> {
  visitNumber(_: NumberLiteral): number {
    return 1;
  }
  visitAdd(node: AddExpression): number {
    return 1 + node.left.accept(this) + node.right.accept(this);
  }
  visitMultiply(node: MultiplyExpression): number {
    return 1 + node.left.accept(this) + node.right.accept(this);
  }
}

// Build and visit the AST: (2 + 3) * 4
const ast = new MultiplyExpression(
  new AddExpression(new NumberLiteral(2), new NumberLiteral(3)),
  new NumberLiteral(4)
);

const evaluator = new EvaluateVisitor();
const printer = new PrintVisitor();
const counter = new CountVisitor();

console.log(ast.accept(evaluator)); // 20
console.log(ast.accept(printer)); // ((2 + 3) * 4)
console.log(ast.accept(counter)); // 5
```

**Discriminated union alternative (TypeScript idiomatic — often cleaner):**

```typescript
type Expr =
  | { kind: 'number'; value: number }
  | { kind: 'add'; left: Expr; right: Expr }
  | { kind: 'multiply'; left: Expr; right: Expr };

function evaluate(expr: Expr): number {
  switch (expr.kind) {
    case 'number':
      return expr.value;
    case 'add':
      return evaluate(expr.left) + evaluate(expr.right);
    case 'multiply':
      return evaluate(expr.left) * evaluate(expr.right);
    // TypeScript errors if a case is missing — exhaustiveness checking
  }
}

function print(expr: Expr): string {
  switch (expr.kind) {
    case 'number':
      return `${expr.value}`;
    case 'add':
      return `(${print(expr.left)} + ${print(expr.right)})`;
    case 'multiply':
      return `(${print(expr.left)} * ${print(expr.right)})`;
  }
}
```

**Stateful visitor (accumulating results):**

```typescript
class FileSystemVisitor {
  private totalSize = 0;
  private fileCount = 0;
  private maxDepth = 0;

  visitFile(file: File, depth: number): void {
    this.totalSize += file.size;
    this.fileCount++;
    this.maxDepth = Math.max(this.maxDepth, depth);
  }

  visitDirectory(dir: Directory, depth: number): void {
    // No accumulation needed — just recurse
    for (const child of dir.children) {
      if (child instanceof File) this.visitFile(child, depth + 1);
      else if (child instanceof Directory) this.visitDirectory(child, depth + 1);
    }
  }

  getReport(): { totalSize: number; fileCount: number; maxDepth: number } {
    return { totalSize: this.totalSize, fileCount: this.fileCount, maxDepth: this.maxDepth };
  }
}
```

## Details

**When discriminated unions beat Visitor:** If you own both the element types and the operations (no third-party hierarchy to extend), prefer discriminated unions — they're simpler and TypeScript's exhaustiveness checking prevents missing cases. Use Visitor when you need to add operations to a class hierarchy you don't own.

**Adding a new element type forces all visitors to update** — this is the tradeoff. Adding new operations (new Visitor) is free. Adding new types breaks all existing Visitors. This is the "expression problem."

**Anti-patterns:**

- Visitor that modifies the element structure — visitors should read/compute, not mutate the structure they traverse
- Visitor methods that call back into visitor methods manually instead of using `accept()` — breaks double dispatch
- Using Visitor where a simple recursive function would suffice — prefer the simpler approach

**Double dispatch explained:** When you call `node.accept(visitor)`, the element type is resolved (first dispatch). The `accept` method then calls `visitor.visitNumber(this)` — the visitor type is resolved (second dispatch). This gives you the right behavior for each element-visitor combination without instanceof checks.

## Source

refactoring.guru/design-patterns/visitor

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
