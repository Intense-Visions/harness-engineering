# Angular Performance Patterns

> Optimize Angular rendering with OnPush change detection, trackBy, virtual scrolling, deferrable views, and signals for zoneless-ready apps

## When to Use

- A list or table is causing visible jank during scrolling or filtering
- The Angular DevTools profiler shows excessive change detection cycles
- A component tree is deep and updates are propagating to many unrelated components
- Rendering thousands of items in a `*ngFor` causes memory or scroll performance issues
- Heavy components below the fold are delaying time-to-interactive

## Instructions

1. Set `changeDetection: ChangeDetectionStrategy.OnPush` on every component. With `OnPush`, Angular only checks a component when its input references change, an `async` pipe emits, or a signal updates — not on every browser event.
2. Use `trackBy` with `*ngFor` to prevent Angular from destroying and re-creating DOM nodes when the array reference changes: `*ngFor="let item of items; trackBy: trackById"`. The track function should return a stable unique identifier (e.g., the item's ID).
3. Use `@angular/cdk/scrolling` `CdkVirtualScrollViewport` for lists with more than ~100 items. Virtual scrolling renders only the visible items, keeping DOM size constant regardless of data size.
4. Use `@defer (on viewport)` for components below the fold — they won't load until the user scrolls to them, reducing initial bundle execution time.
5. Move expensive pure calculations into `computed()` signals or pure pipes — both memoize their results and only recompute when dependencies change.
6. Avoid function calls in templates (`{{ computeTotal() }}`) — they execute on every change detection cycle. Replace with `computed()` signals or `@Input()` derived values.
7. Avoid `setTimeout`/`setInterval` without wrapping in `NgZone.runOutsideAngular()` for non-UI timers — they trigger change detection on every tick.
8. Adopt signals for local component state to prepare for zoneless change detection (`provideExperimentalZonelessChangeDetection()` in Angular 18+).

```typescript
// OnPush + trackBy
@Component({
  selector: 'app-product-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-product-card *ngFor="let product of products(); trackBy: trackById" [product]="product" />
  `,
})
export class ProductListComponent {
  products = input.required<Product[]>();
  trackById = (_: number, item: Product) => item.id;
}
```

```typescript
// Virtual scrolling with CDK
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

@Component({
  imports: [ScrollingModule],
  template: `
    <cdk-virtual-scroll-viewport itemSize="72" style="height: 600px">
      <div
        *cdkVirtualFor="let item of items; trackBy: trackById"
        class="list-item"
        style="height: 72px"
      >
        {{ item.name }}
      </div>
    </cdk-virtual-scroll-viewport>
  `,
})
export class VirtualListComponent {
  items = input.required<Item[]>();
  trackById = (_: number, i: Item) => i.id;
}
```

```typescript
// Computed signal instead of template method call
@Component({
  template: `<p>Total: {{ formattedTotal() }}</p>`,
})
export class CartComponent {
  items = signal<CartItem[]>([]);

  // Memoized — only recomputes when items() changes
  total = computed(() => this.items().reduce((s, i) => s + i.price * i.qty, 0));
  formattedTotal = computed(() =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(this.total())
  );
}
```

```typescript
// Running non-UI work outside Angular zone
@Injectable({ providedIn: 'root' })
export class PollingService {
  private ngZone = inject(NgZone);

  startPolling(callback: () => void, intervalMs: number): () => void {
    let id: ReturnType<typeof setInterval>;
    this.ngZone.runOutsideAngular(() => {
      id = setInterval(() => {
        // Run callback back inside zone to trigger CD if needed
        this.ngZone.run(callback);
      }, intervalMs);
    });
    return () => clearInterval(id);
  }
}
```

## Details

**Change detection cost model:** In the default strategy, Angular traverses the entire component tree on every browser event (click, input, scroll, setTimeout, XHR). With `OnPush`, Angular marks a component as "dirty" only when:

- An `@Input()` reference changes (new object/array reference)
- A signal read inside the component template emits
- An observable bound with `async` pipe emits
- `ChangeDetectorRef.markForCheck()` is called explicitly

**`trackBy` mechanics:** Without `trackBy`, Angular compares list items by identity. When the array reference changes (even with the same data), Angular destroys and recreates all DOM nodes — re-triggering child lifecycle hooks. `trackBy` returns a key; if the key matches an existing node, Angular reuses the DOM element and only updates the changed properties.

**Virtual scrolling sizing:** `CdkVirtualScrollViewport` requires `itemSize` (in pixels) for fixed-height items. For variable-height items, use `AutoSizeVirtualScrollStrategy` from CDK (experimental). The viewport must have an explicit height for scrolling to work.

**`NgZone.runOutsideAngular` use cases:**

- WebSocket message handlers that update a signal
- `requestAnimationFrame` loops for canvas rendering
- `setInterval` for polling when only some callbacks need UI updates

**Bundle performance:** `@defer` creates a separate chunk for the deferred component. Use `ng build --stats-json && npx webpack-bundle-analyzer dist/stats.json` to verify chunk sizes. Set `bundleBudgets` in `angular.json` to fail the build if chunks exceed defined thresholds.

**Profiling with Angular DevTools:** Install the Angular DevTools Chrome extension. In the "Profiler" tab, record a change detection cycle and inspect which components checked and how long each took. Components with unnecessary check counts are candidates for `OnPush` or signal migration.

**Memoization with pure pipes:** A `pure: true` pipe (default) is essentially a memoized function — Angular caches the result for the same input references. For expensive formatting applied in a large `*ngFor`, a pure pipe avoids recomputing the format on every CD cycle.

## Source

https://angular.dev/guide/best-practices/runtime-performance

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
