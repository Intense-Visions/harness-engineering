# Angular State Management

> Manage application state with NgRx Store (Redux pattern) or NgRx SignalStore for signal-based state — choose the right tool for the complexity level

## When to Use

- Sharing state across many components that are not in a direct parent-child relationship
- Tracking complex state transitions that need to be logged, replayed, or time-traveled (NgRx DevTools)
- Managing server-state with optimistic updates, loading/error states, and caching (NgRx Entity)
- Building a feature with local, self-contained state that doesn't need global visibility (SignalStore)
- Replacing ad-hoc `BehaviorSubject` chains that have grown hard to maintain

## Instructions

### NgRx Store (global state)

1. Define actions with `createAction` and `props<{}>()` — one action per user intent or server event. Namespace with `[Feature] EventName` convention.
2. Write pure reducers with `createReducer` and `on()`. Reducers must be pure functions — no side effects, no mutation.
3. Use `createSelector` for memoized state projections. Selectors compose and cache; never derive state in component templates.
4. Write effects with `createEffect` to handle side effects (HTTP, routing, localStorage). Effects listen to actions and dispatch new actions on success/failure.
5. Use `createEntityAdapter` from `@ngrx/entity` for normalized collections (list of records by ID). It generates standard CRUD reducers and selectors.
6. Connect components with `store.dispatch(action)` and `store.select(selector)`. Pipe the selector observable through the `async` pipe or convert with `toSignal()`.

```typescript
// counter.actions.ts
import { createAction, props } from '@ngrx/store';
export const increment = createAction('[Counter] Increment');
export const decrement = createAction('[Counter] Decrement');
export const reset = createAction('[Counter] Reset', props<{ value: number }>());
```

```typescript
// counter.reducer.ts
import { createReducer, on } from '@ngrx/store';
import { increment, decrement, reset } from './counter.actions';

export interface CounterState {
  count: number;
}
const initialState: CounterState = { count: 0 };

export const counterReducer = createReducer(
  initialState,
  on(increment, (state) => ({ ...state, count: state.count + 1 })),
  on(decrement, (state) => ({ ...state, count: state.count - 1 })),
  on(reset, (state, { value }) => ({ ...state, count: value }))
);
```

```typescript
// counter.selectors.ts
import { createFeatureSelector, createSelector } from '@ngrx/store';
import { CounterState } from './counter.reducer';

const selectCounterState = createFeatureSelector<CounterState>('counter');
export const selectCount = createSelector(selectCounterState, (s) => s.count);
export const selectIsZero = createSelector(selectCount, (count) => count === 0);
```

```typescript
// products.effects.ts
import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { switchMap, map, catchError, of } from 'rxjs';
import * as ProductActions from './product.actions';
import { ProductService } from './product.service';

export const loadProducts = createEffect(
  (actions$ = inject(Actions), productService = inject(ProductService)) =>
    actions$.pipe(
      ofType(ProductActions.loadProducts),
      switchMap(() =>
        productService.getAll().pipe(
          map((products) => ProductActions.loadProductsSuccess({ products })),
          catchError((error) => of(ProductActions.loadProductsFailure({ error: error.message })))
        )
      )
    ),
  { functional: true }
);
```

### NgRx SignalStore (local/feature state)

```typescript
import { signalStore, withState, withComputed, withMethods } from '@ngrx/signals';
import { computed } from '@angular/core';
import { inject } from '@angular/core';

type CartState = { items: CartItem[]; loading: boolean };

export const CartStore = signalStore(
  { providedIn: 'root' }, // or provide in component for local scope
  withState<CartState>({ items: [], loading: false }),
  withComputed(({ items }) => ({
    totalItems: computed(() => items().length),
    totalPrice: computed(() => items().reduce((s, i) => s + i.price, 0)),
  })),
  withMethods((store, productService = inject(ProductService)) => ({
    addItem(item: CartItem) {
      patchState(store, { items: [...store.items(), item] });
    },
    async loadCart() {
      patchState(store, { loading: true });
      const items = await productService.getCart().toPromise();
      patchState(store, { items: items ?? [], loading: false });
    },
  }))
);
```

## Details

**When to use NgRx Store vs SignalStore vs Service:**

| Scenario                                 | Recommended             |
| ---------------------------------------- | ----------------------- |
| Global shared state across many features | NgRx Store              |
| Dev Tools, time travel, action logging   | NgRx Store              |
| Feature-scoped state, self-contained     | SignalStore             |
| Simple component-local state             | `signal()` in component |
| Shared state, 2-3 components             | Service with signals    |

**Entity adapter pattern:** `@ngrx/entity` normalizes a list of records into `{ ids: [], entities: {} }` for O(1) lookup by ID. It generates `addOne`, `addMany`, `updateOne`, `removeOne` adapter methods and `getAll`, `getEntities`, `selectById` selectors.

**Selector memoization:** `createSelector` caches the last output. If the inputs haven't changed, the projector function is not called. This makes selectors safe to use in templates with `OnPush` change detection — the observable only emits when the derived value actually changes.

**NgRx DevTools:** Install `@ngrx/store-devtools` and open Redux DevTools in Chrome to inspect action history, diff state, and replay actions. Invaluable for debugging complex state transitions.

**Action hygiene:** One action per intent, not one action per state field. Actions should describe what happened (`[Cart] Item Added`) not what should change (`[Cart] Set Items`). This makes the action log human-readable.

## Source

https://ngrx.io/guide/store

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
