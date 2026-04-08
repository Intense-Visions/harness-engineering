# JS Abstract Factory Pattern

> Create families of related objects without specifying their concrete classes

## When to Use

- You need to create sets of related objects that must work together (e.g., a UI theme with buttons, inputs, and modals that all match)
- The exact family of objects is determined at runtime (e.g., based on platform or config)
- You want to enforce consistency across an entire family of products

## Instructions

1. Define an abstract factory interface listing all creation methods.
2. Implement one concrete factory per product family.
3. Clients use only the abstract factory interface — they never instantiate concrete products directly.
4. Switch families by swapping the factory instance, not by changing client code.

```javascript
// Abstract Factory (interface defined by convention)
class LightThemeFactory {
  createButton() {
    return { color: 'white', text: 'dark' };
  }
  createInput() {
    return { background: '#f0f0f0', border: '1px solid #ccc' };
  }
}

class DarkThemeFactory {
  createButton() {
    return { color: '#333', text: 'white' };
  }
  createInput() {
    return { background: '#222', border: '1px solid #555' };
  }
}

function renderUI(factory) {
  const button = factory.createButton();
  const input = factory.createInput();
  return { button, input };
}

const ui = renderUI(new DarkThemeFactory());
```

## Details

The Abstract Factory is a creational pattern that sits one level of abstraction above the Factory pattern. Where a Factory creates one type of product, an Abstract Factory creates an entire suite of related products.

**Trade-offs:**

- Significantly more code than a simple factory — only justified when product families truly need to be swapped
- Adding a new product type requires changes to every factory implementation

**When NOT to use:**

- When you only have one product family — a simple factory or `new` is sufficient
- When products do not need to be coordinated or consistent with each other

## Source

https://patterns.dev/javascript/abstract-factory-pattern
