# JS Template Method Pattern

> Define the skeleton of an algorithm in a base class and let subclasses override specific steps

## When to Use

- Multiple classes share the same algorithmic structure but differ in specific steps
- You want to enforce a fixed sequence of operations while allowing step customization
- Building frameworks or libraries where users extend base behavior

## Instructions

1. Create a base class with a "template method" that calls a series of step methods in order.
2. Implement default behavior for shared steps; leave varying steps abstract or as no-ops.
3. Subclasses override only the steps they need to customize.
4. Never let subclasses change the template method itself — keep it final via convention or documentation.

```javascript
class DataProcessor {
  process(data) {
    const validated = this.validate(data);
    const transformed = this.transform(validated);
    return this.format(transformed);
  }
  validate(data) {
    return data;
  } // default: no-op
  transform(data) {
    throw new Error('Subclass must implement transform()');
  }
  format(data) {
    return JSON.stringify(data);
  } // default: JSON
}

class CSVProcessor extends DataProcessor {
  transform(data) {
    return data.map((row) => row.join(','));
  }
  format(data) {
    return data.join('\n');
  }
}
```

## Details

The Template Method pattern uses inheritance to vary parts of an algorithm. The base class defines the algorithm's skeleton, and subclasses fill in the blanks. This is the inverse of the Strategy pattern — Template Method uses inheritance, Strategy uses composition.

**Trade-offs:**

- Tight coupling through inheritance — subclasses are bound to the base class structure
- Hard to compose — you cannot mix steps from different base classes
- JavaScript's prototype chain makes "final" methods hard to enforce

**When NOT to use:**

- When steps vary independently and need to be composed freely — use Strategy pattern instead
- When there are only one or two implementations — inheritance overhead is not worth it
- When functional composition (pipe/compose) achieves the same result more flexibly

## Source

https://patterns.dev/javascript/template-method-pattern
