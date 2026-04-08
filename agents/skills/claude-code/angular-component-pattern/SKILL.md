# Angular Component Pattern

> Author Angular components with correct inputs/outputs, change detection strategy, and lifecycle hooks

## When to Use

- Creating a new Angular component and deciding on its API surface (inputs, outputs, queries)
- Choosing between `Default` and `OnPush` change detection strategies
- Wiring parent-child communication without a shared service
- Using lifecycle hooks (`ngOnInit`, `ngOnDestroy`, `ngAfterViewInit`) correctly
- Querying child elements with `@ViewChild` or `@ContentChild`

## Instructions

1. Declare the component with `@Component` and always set `selector`, `template`/`templateUrl`, and `changeDetection`.
2. Prefer `changeDetection: ChangeDetectionStrategy.OnPush` for all new components — it prevents unnecessary re-renders and forces explicit data flow.
3. Declare inputs with the `input()` signal function (Angular 17+) or `@Input()` decorator. Prefer signal inputs for new code.
4. Declare outputs with `output()` (Angular 17+) or `@EventEmitter` with `@Output()`. Signal outputs compose with effects naturally.
5. Keep component logic in the class; keep templates declarative. Move complex expressions into computed properties or pipes.
6. Implement `OnDestroy` (or use `DestroyRef`) to clean up subscriptions, timers, and manual DOM listeners.
7. Use `@ViewChild` to access child component or DOM element references after `ngAfterViewInit`. Never access them in `ngOnInit` — they are not yet rendered.
8. Scope CSS with `ViewEncapsulation.Emulated` (the default) unless you have a specific reason to pierce the shadow DOM.

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  computed,
  OnDestroy,
} from '@angular/core';

export interface Product {
  id: string;
  name: string;
  price: number;
}

@Component({
  selector: 'app-product-card',
  template: `
    <div class="card">
      <h2>{{ product().name }}</h2>
      <p>{{ formattedPrice() }}</p>
      <button (click)="onAdd()">Add to cart</button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent implements OnDestroy {
  // Signal input — reactive by default
  product = input.required<Product>();

  // Derived value — recalculates only when product() changes
  formattedPrice = computed(() =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      this.product().price
    )
  );

  // Typed output
  addToCart = output<Product>();

  onAdd(): void {
    this.addToCart.emit(this.product());
  }

  ngOnDestroy(): void {
    // Clean up any manual subscriptions here
  }
}
```

## Details

**Change detection in depth:** Angular's default change detection walks the entire component tree on every browser event. `OnPush` restricts checks to components whose input references have changed, an async pipe resolves, or a signal emits. This makes rendering O(changed subtree) instead of O(entire tree). Adopt it globally by setting it as the default in `angular.json` under `schematics`.

**Signal inputs vs `@Input()`:** Signal inputs (Angular 17.1+) return a `Signal<T>` rather than a plain value. This means the input participates in the reactivity graph — `computed()` and `effect()` can read it without subscribing to a subject or change detection cycle. Prefer `input()` for new components; `@Input()` still works and is required for libraries targeting older Angular versions.

**Lifecycle hook order:**

1. `ngOnChanges` — fires before `ngOnInit` and on every `@Input()` change
2. `ngOnInit` — fires once after first `ngOnChanges`; safe to read inputs but NOT view children
3. `ngAfterViewInit` — fires after the component's view and child views are initialized; safe to use `@ViewChild`
4. `ngOnDestroy` — fires just before the component is removed; clean up subscriptions and effects

**ViewChild timing pitfall:** Accessing a `@ViewChild` in `ngOnInit` returns `undefined` because the view hasn't been created yet. Move that logic to `ngAfterViewInit`.

**Output naming:** Angular convention for outputs is camelCase event names without the `on` prefix in the class, but HTML consumers use `(addToCart)`. Avoid naming outputs with the `on` prefix in the property name — it creates `(onAddToCart)` which reads redundantly in templates.

**Host bindings:** Use `host: { '[class.active]': 'isActive()' }` in the decorator instead of `@HostBinding` — it is more declarative and compatible with the component metadata compiler.

## Source

https://angular.dev/guide/components
