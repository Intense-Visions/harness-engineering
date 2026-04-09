# GOF Composite Pattern

> Compose objects into tree structures and treat individual and composite objects uniformly.

## When to Use

- You need to represent a part-whole hierarchy (file system, org chart, menu tree, AST)
- Client code should be able to treat leaf nodes and composite nodes identically
- You need to apply an operation recursively across an entire tree structure
- You want to build flexible tree structures without client code knowing whether it's a leaf or branch

## Instructions

**Core structure — Component interface, Leaf, Composite:**

```typescript
// Component — uniform interface for both leaves and composites
interface FileSystemItem {
  name: string;
  size(): number;
  print(indent?: string): void;
}

// Leaf — no children
class File implements FileSystemItem {
  constructor(
    public readonly name: string,
    private readonly bytes: number
  ) {}

  size(): number {
    return this.bytes;
  }

  print(indent = ''): void {
    console.log(`${indent}📄 ${this.name} (${this.bytes}B)`);
  }
}

// Composite — has children, delegates to them
class Directory implements FileSystemItem {
  private children: FileSystemItem[] = [];

  constructor(public readonly name: string) {}

  add(item: FileSystemItem): this {
    this.children.push(item);
    return this;
  }

  remove(item: FileSystemItem): void {
    this.children = this.children.filter((c) => c !== item);
  }

  size(): number {
    // Recursion handled uniformly — leaves and composites both have size()
    return this.children.reduce((total, child) => total + child.size(), 0);
  }

  print(indent = ''): void {
    console.log(`${indent}📁 ${this.name}`);
    for (const child of this.children) {
      child.print(indent + '  ');
    }
  }
}

// Client code treats everything as FileSystemItem
function printSummary(item: FileSystemItem): void {
  item.print();
  console.log(`Total size: ${item.size()}B`);
}

// Build the tree
const root = new Directory('project')
  .add(new File('package.json', 512))
  .add(new File('tsconfig.json', 256))
  .add(
    new Directory('src')
      .add(new File('index.ts', 1024))
      .add(new Directory('utils').add(new File('logger.ts', 768)))
  );

printSummary(root);
```

**Permission tree (practical RBAC example):**

```typescript
interface Permission {
  name: string;
  check(userId: string, action: string): boolean;
}

class AtomicPermission implements Permission {
  constructor(
    public readonly name: string,
    private readonly resource: string
  ) {}

  check(userId: string, action: string): boolean {
    // Real implementation would check DB
    return action === this.resource;
  }
}

class PermissionGroup implements Permission {
  private permissions: Permission[] = [];

  constructor(public readonly name: string) {}

  add(permission: Permission): this {
    this.permissions.push(permission);
    return this;
  }

  // OR semantics: granted if any child grants it
  check(userId: string, action: string): boolean {
    return this.permissions.some((p) => p.check(userId, action));
  }
}

const adminRole = new PermissionGroup('admin')
  .add(new AtomicPermission('read-users', 'users'))
  .add(new AtomicPermission('write-users', 'users'))
  .add(
    new PermissionGroup('billing')
      .add(new AtomicPermission('read-invoices', 'invoices'))
      .add(new AtomicPermission('write-invoices', 'invoices'))
  );
```

## Details

**TypeScript discriminated union alternative:** For simpler cases, a discriminated union often beats a class hierarchy:

```typescript
type TreeNode =
  | { kind: 'leaf'; name: string; value: number }
  | { kind: 'branch'; name: string; children: TreeNode[] };

function sum(node: TreeNode): number {
  if (node.kind === 'leaf') return node.value;
  return node.children.reduce((acc, child) => acc + sum(child), 0);
}
```

**Anti-patterns:**

- Composite that exposes `add`/`remove` on the Component interface — leaves can't implement these; use optional methods or a type guard
- Circular references in the tree — add parent tracking and validate on `add()`
- Excessive depth causing stack overflow in recursive operations — add iteration-based traversal for very deep trees

**Traversal strategies:**

```typescript
function* depthFirst(item: FileSystemItem): Generator<FileSystemItem> {
  yield item;
  if (item instanceof Directory) {
    for (const child of item.getChildren()) {
      yield* depthFirst(child);
    }
  }
}

// Count all files
const fileCount = [...depthFirst(root)].filter((item) => item instanceof File).length;
```

## Source

refactoring.guru/design-patterns/composite

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
