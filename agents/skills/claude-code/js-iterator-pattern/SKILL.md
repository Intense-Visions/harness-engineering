# JS Iterator Pattern

> Traverse a collection sequentially without exposing its internal structure

## When to Use

- You need to iterate over a custom data structure (tree, graph, linked list) with `for...of`
- You want to provide lazy, on-demand values without generating the entire collection upfront
- Building data pipelines that compose iterables (filter, map, take)

## Instructions

1. Implement the iterator protocol: an object with a `next()` method returning `{ value, done }`.
2. Make a collection iterable by adding `[Symbol.iterator]()` that returns an iterator.
3. Use generator functions (`function*`) for the cleanest iterator implementation.
4. Use `for...of` to consume iterables.

```javascript
class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }

  [Symbol.iterator]() {
    let current = this.start;
    const end = this.end;
    return {
      next() {
        return current <= end
          ? { value: current++, done: false }
          : { value: undefined, done: true };
      },
    };
  }
}

for (const n of new Range(1, 3)) {
  console.log(n); // 1, 2, 3
}
```

5. Generator shorthand: `*[Symbol.iterator]() { for (let i = this.start; i <= this.end; i++) yield i; }`.

## Details

JavaScript has a built-in iteration protocol. Any object with a `[Symbol.iterator]()` method is iterable and works with `for...of`, spread (`...`), destructuring, `Array.from()`, and `Promise.all()`. Generators (`function*`) are the simplest way to create custom iterators.

**Trade-offs:**

- Custom iterators add complexity — only worthwhile for non-trivial data structures
- Infinite iterators (no `done: true`) will hang `for...of` loops unless guarded
- Generator objects are single-use — once exhausted, they cannot be reset

**When NOT to use:**

- For arrays and built-in collections — they are already iterable
- When you need random access — iterators are sequential by design

## Source

https://patterns.dev/javascript/iterator-pattern
