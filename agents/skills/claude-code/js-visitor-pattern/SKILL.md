# JS Visitor Pattern

> Add new operations to object structures without modifying the objects

## When to Use

- You need to perform many unrelated operations on a complex object structure (AST, file tree, DOM)
- Adding new operations should not require changing the element classes
- You want to separate algorithms from the data structures they operate on

## Instructions

1. Define an `accept(visitor)` method on each element class in the object structure.
2. Each `accept` calls the visitor's corresponding method, passing `this` (double dispatch).
3. Create visitor objects with one method per element type (e.g., `visitFile`, `visitFolder`).
4. New operations = new visitor objects, without modifying element classes.

```javascript
class File {
  constructor(name, size) {
    this.name = name;
    this.size = size;
  }
  accept(visitor) {
    return visitor.visitFile(this);
  }
}

class Folder {
  constructor(name, children) {
    this.name = name;
    this.children = children;
  }
  accept(visitor) {
    return visitor.visitFolder(this);
  }
}

const sizeCalculator = {
  visitFile(file) {
    return file.size;
  },
  visitFolder(folder) {
    return folder.children.reduce((sum, child) => sum + child.accept(this), 0);
  },
};
```

5. For functional style, use a switch on type tags instead of double dispatch.

## Details

The Visitor pattern achieves the open/closed principle by separating operations from the object structure. New operations (visitors) can be added without modifying existing element classes. This is heavily used in compilers and AST processors (e.g., Babel plugins are visitors).

**Trade-offs:**

- Adding a new element type requires updating all visitors — the pattern favors stable structures with many operations
- Double dispatch adds indirection that can be hard to follow
- In dynamic JavaScript, a type-tag switch may be simpler than the full visitor ceremony

**When NOT to use:**

- When the object structure changes frequently — every new type breaks every visitor
- When there are few operations — just add methods directly to the classes
- For simple data — a `map`/`reduce` over an array is clearer

## Source

https://patterns.dev/javascript/visitor-pattern
