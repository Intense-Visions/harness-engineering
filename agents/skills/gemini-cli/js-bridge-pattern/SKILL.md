# JS Bridge Pattern

> Decouple abstraction from implementation so both can vary independently

## When to Use

- You want to avoid a combinatorial explosion of classes when abstractions and implementations vary orthogonally
- The implementation should be swappable at runtime (e.g., different rendering backends)
- You need to extend both the abstraction and the implementation hierarchies independently

## Instructions

1. Separate the abstraction (high-level logic) from the implementation (low-level detail).
2. The abstraction holds a reference to an implementation object.
3. Both can be subclassed independently — new abstractions do not require new implementations and vice versa.
4. Inject the implementation via the constructor.

```javascript
// Implementation interface
class Renderer {
  renderCircle(radius) {
    throw new Error('Not implemented');
  }
}

class SVGRenderer extends Renderer {
  renderCircle(radius) {
    return `<circle r="${radius}"/>`;
  }
}

class CanvasRenderer extends Renderer {
  renderCircle(radius) {
    return `ctx.arc(0,0,${radius},0,2*PI)`;
  }
}

// Abstraction
class Shape {
  constructor(renderer) {
    this.renderer = renderer;
  }
}

class Circle extends Shape {
  constructor(radius, renderer) {
    super(renderer);
    this.radius = radius;
  }
  draw() {
    return this.renderer.renderCircle(this.radius);
  }
}
```

## Details

The Bridge pattern separates an abstraction from its implementation so that the two can evolve independently. Without Bridge, combining M abstractions with N implementations requires M\*N classes. With Bridge, it requires M + N.

**Trade-offs:**

- More complex initial setup — two parallel hierarchies
- Adds indirection — the abstraction delegates to the implementation
- Over-engineering for simple cases with one abstraction and one implementation

**When NOT to use:**

- When there is only one implementation — just use it directly
- When the abstraction and implementation are tightly coupled and always change together
- For simple delegation — a function parameter is clearer than the full Bridge structure

## Source

https://patterns.dev/javascript/bridge-pattern

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
