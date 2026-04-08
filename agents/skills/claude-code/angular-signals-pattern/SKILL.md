# Angular Signals Pattern

> Manage reactive state with Angular Signals — signal(), computed(), effect(), and toSignal() — for fine-grained, zone-free reactivity

## When to Use

- Building new components in Angular 17+ that need reactive local state
- Replacing `BehaviorSubject` + `async` pipe patterns with simpler signal-based state
- Deriving display values from multiple state pieces without manual subscription management
- Bridging RxJS observables into signal-based components via `toSignal()`
- Preparing for zoneless change detection (Angular 18+)

## Instructions

1. Create mutable state with `signal<T>(initialValue)`. The returned `WritableSignal<T>` exposes `.set()`, `.update()`, and `.mutate()` (arrays/objects).
2. Derive values with `computed(() => ...)`. Computed signals are lazy and memoized — they only recompute when their dependencies change. Never compute inside a template expression; use `computed()` instead.
3. Run side effects with `effect(() => ...)`. Effects re-run automatically when any signal they read changes. Clean up resources by returning a cleanup function or using the `onCleanup` callback.
4. Convert an RxJS `Observable` to a signal with `toSignal(obs$, { initialValue: ... })`. This subscribes for you and unsubscribes on destroy. Provide `initialValue` to avoid the `undefined` initial state.
5. Convert a signal to an Observable with `toObservable(sig)` when you need to compose it with RxJS operators.
6. Prefer signal inputs (`input()`) over `@Input()` for new components — they integrate with the reactivity graph natively.
7. Do not call `.set()` or `.update()` inside a `computed()` — computed signals must be pure.
8. Wrap mutable signal state in a service when it needs to be shared across components.

```typescript
import { Component, signal, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProductService } from './product.service';

@Component({
  selector: 'app-cart',
  template: `
    <p>Items: {{ itemCount() }}</p>
    <p>Total: {{ formattedTotal() }}</p>
    <button (click)="addItem(selectedProduct())">Add</button>
  `,
})
export class CartComponent {
  private productService = inject(ProductService);

  // Convert observable to signal — auto-unsubscribed on destroy
  selectedProduct = toSignal(this.productService.selected$, {
    initialValue: null,
  });

  items = signal<CartItem[]>([]);

  itemCount = computed(() => this.items().length);

  total = computed(() => this.items().reduce((sum, item) => sum + item.price * item.qty, 0));

  formattedTotal = computed(() =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(this.total())
  );

  constructor() {
    // Side effect: persist cart to localStorage whenever items change
    effect(() => {
      localStorage.setItem('cart', JSON.stringify(this.items()));
    });
  }

  addItem(product: Product | null): void {
    if (!product) return;
    this.items.update((items) => [...items, { ...product, qty: 1 }]);
  }
}
```

## Details

**Signal vs BehaviorSubject:** A `BehaviorSubject` requires `.subscribe()`, `.next()`, and `.unsubscribe()` (or `takeUntil`). A `WritableSignal` has no subscription overhead and integrates with Angular's change detection graph directly. Signals also compose with `computed()` without the `combineLatest` ceremony required by observables.

**Lazy computation:** `computed()` is lazy and cached. If no consumer reads the computed signal, it never runs. If the dependencies haven't changed since last read, the cached value is returned without re-running the function. This makes computed signals safe to use in templates even for expensive derivations.

**Effect cleanup:** Effects that set up subscriptions, timers, or DOM listeners should clean up on re-run:

```typescript
effect((onCleanup) => {
  const id = setInterval(() => this.tick.update((t) => t + 1), 1000);
  onCleanup(() => clearInterval(id));
});
```

**`toSignal` guarantees:** `toSignal()` must be called in an injection context (constructor or field initializer). It auto-subscribes and auto-unsubscribes using `DestroyRef`. The `initialValue` option avoids the `T | undefined` type widening; `requireSync: true` can be used when the observable is known to emit synchronously (e.g., `BehaviorSubject`).

**Mutation helpers:** For arrays and objects, use `.update()` to apply a pure transform:

```typescript
this.items.update((list) => list.filter((i) => i.id !== removedId));
```

Avoid mutating in place then calling `.set(this.items())` — signal equality checks use reference equality, so this won't trigger updates.

**Zoneless change detection:** Angular 18+ supports `provideExperimentalZonelessChangeDetection()`. With signals, components no longer need Zone.js to trigger change detection — signal writes schedule DOM updates directly. Adopting signals now future-proofs components for zoneless.

**When to keep RxJS:** Signals are not a replacement for RxJS when you need time-based operators (`debounceTime`, `throttleTime`), combination operators (`combineLatest`, `forkJoin`), or error handling (`catchError`, `retry`). Bridge with `toSignal()` / `toObservable()` at the boundary.

## Source

https://angular.dev/guide/signals
