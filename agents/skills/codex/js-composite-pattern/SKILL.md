# JS Composite Pattern

> Compose objects into tree structures and treat individual objects and composites uniformly

## When to Use

- You have a tree/hierarchy structure (file system, org chart, UI component tree, menu system)
- Clients should treat individual objects and groups of objects the same way
- Operations need to recurse naturally over the tree

## Instructions

1. Define a component interface with the operation that both leaves and composites share.
2. Leaf classes implement the operation directly.
3. Composite classes hold a collection of children and delegate the operation to each child.
4. Clients call the operation on any component without checking whether it is a leaf or composite.

```javascript
class File {
  constructor(name, size) {
    this.name = name;
    this.size = size;
  }
  getSize() {
    return this.size;
  }
}

class Folder {
  constructor(name) {
    this.name = name;
    this.children = [];
  }
  add(child) {
    this.children.push(child);
    return this;
  }
  getSize() {
    return this.children.reduce((sum, child) => sum + child.getSize(), 0);
  }
}

const root = new Folder('src')
  .add(new File('index.js', 120))
  .add(new Folder('utils').add(new File('helpers.js', 80)));
root.getSize(); // 200
```

## Details

The Composite pattern lets you build tree structures where clients do not need to distinguish between leaves and branches. Every node in the tree responds to the same interface, so operations naturally recurse.

**Trade-offs:**

- The uniform interface may expose methods on leaves that do not make sense (e.g., `add()` on a File)
- Deep trees can cause stack overflows with recursive operations — consider iterative traversal for very large trees
- Type checking is harder — all nodes look the same at the interface level

**When NOT to use:**

- When the structure is flat (no nesting) — just use an array
- When leaves and composites have very different behaviors — forcing a common interface is awkward
- When the hierarchy is dynamic and deeply nested — consider a database or graph instead

## Source

https://patterns.dev/javascript/composite-pattern

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
