# JS Revealing Module Pattern

> Define all logic privately and selectively reveal only the public API

## When to Use

- You want clear separation between private implementation and public interface
- You need a consistent API where all functions are defined in the same scope
- You are refactoring legacy IIFE-based modules to improve readability

## Instructions

1. Define all functions and variables in a private closure scope.
2. At the end of the module, return an object that maps public names to private implementations.
3. Internal functions can call each other freely — only the return object is public.

```javascript
const counterModule = (() => {
  let _count = 0;

  function increment() {
    _count++;
  }
  function decrement() {
    _count--;
  }
  function getCount() {
    return _count;
  }
  function reset() {
    _count = 0;
  }

  // Reveal only the public API
  return { increment, decrement, getCount };
  // Note: reset() is private — not revealed
})();

counterModule.increment();
counterModule.increment();
console.log(counterModule.getCount()); // 2
```

## Details

The Revealing Module is a refinement of the Module pattern. The key insight: all code (including private functions) is defined in the same flat scope, which makes it easy to see the full implementation. The final `return` statement is the sole arbiter of what is public.

**Trade-offs:**

- References in the returned object point to the original private function — if a public method is overridden externally, internal calls still use the original
- Hard to extend after creation — you cannot add new public methods to an IIFE-based module
- In modern ESM, just not exporting a function achieves the same result with less boilerplate

**When NOT to use:**

- In modern codebases using ESM — prefer named exports directly
- When dynamic extension of the module is needed

## Source

https://patterns.dev/javascript/revealing-module-pattern
