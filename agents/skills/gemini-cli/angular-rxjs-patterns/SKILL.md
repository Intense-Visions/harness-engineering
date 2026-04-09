# Angular RxJS Patterns

> Apply RxJS patterns correctly in Angular — switchMap for HTTP, takeUntilDestroyed for cleanup, async pipe for templates, and catchError for resilience

## When to Use

- Fetching data in response to route params, search input, or user events
- Managing multiple concurrent HTTP requests (cancel-on-change, parallel, sequential)
- Cleaning up subscriptions when a component or service is destroyed
- Sharing a single HTTP response across multiple subscribers
- Handling errors from observables without breaking the stream

## Instructions

1. Always unsubscribe from observables in components. Use `takeUntilDestroyed(this.destroyRef)` (Angular 16+) instead of `ngOnDestroy` + `Subject` teardown patterns.
2. Use `switchMap` when a new event should cancel the previous in-flight request (e.g., search typeahead). Use `concatMap` when order matters and requests must not overlap. Use `mergeMap` when all concurrent requests are independent.
3. Use the `async` pipe in templates instead of manual subscriptions in the component class. It handles subscribe, unsubscribe, and change detection automatically.
4. Share expensive observables (HTTP calls) with `shareReplay(1)` to prevent duplicate requests when multiple consumers subscribe.
5. Handle errors with `catchError` inside a `pipe()` chain. Return `of(fallbackValue)` to recover, or `throwError(() => err)` to propagate. Never swallow errors silently.
6. Use `BehaviorSubject` for state that needs an initial value and synchronous read (`.value`). Expose only the observable side via `asObservable()` — keep `.next()` private to the service.
7. Avoid nested subscriptions (`subscribe()` inside `subscribe()`). Flatten with `switchMap`, `mergeMap`, or `combineLatest`.
8. Debounce user input with `debounceTime(300)` before triggering HTTP requests. Pair with `distinctUntilChanged()` to skip identical values.

```typescript
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly http = inject(HttpClient);

  search(query$: Observable<string>): Observable<SearchResult[]> {
    return query$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      filter((q) => q.length >= 2),
      switchMap((q) =>
        this.http.get<SearchResult[]>(`/api/search?q=${q}`).pipe(
          catchError(() => of([])) // recover from HTTP errors
        )
      ),
      shareReplay(1)
    );
  }
}

// Component
@Component({
  template: `
    <input [formControl]="queryControl" />
    <ul>
      <li *ngFor="let result of results$ | async">{{ result.name }}</li>
    </ul>
  `,
})
export class SearchComponent {
  private searchService = inject(SearchService);
  private destroyRef = inject(DestroyRef);

  queryControl = new FormControl('');

  results$ = this.searchService.search(this.queryControl.valueChanges as Observable<string>);
}
```

```typescript
// takeUntilDestroyed for imperative subscriptions
@Component({...})
export class DashboardComponent {
  private destroyRef = inject(DestroyRef);
  private statsService = inject(StatsService);

  stats: Stats | null = null;

  ngOnInit(): void {
    this.statsService.getStats().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(stats => {
      this.stats = stats;
    });
  }
}
```

## Details

**Flattening operators compared:**

| Operator     | Behavior                                          | Use when                                     |
| ------------ | ------------------------------------------------- | -------------------------------------------- |
| `switchMap`  | Cancels previous inner observable on new emission | Search, route params, latest-only            |
| `concatMap`  | Queues — waits for previous to complete           | Sequential saves, ordered requests           |
| `mergeMap`   | All concurrent, results interleaved               | Fire-and-forget, parallel independent        |
| `exhaustMap` | Ignores new emissions while inner is active       | Submit button, login — prevent double-submit |

**BehaviorSubject pattern:**

```typescript
@Injectable({ providedIn: 'root' })
export class CartService {
  private _items = new BehaviorSubject<CartItem[]>([]);
  readonly items$ = this._items.asObservable();

  add(item: CartItem): void {
    this._items.next([...this._items.value, item]);
  }
}
```

**Error boundary in services:** Use `catchError` inside the inner observable (inside `switchMap`) rather than at the top level. This keeps the outer stream alive so subsequent events continue to work after an error:

```typescript
switchMap((id) =>
  this.http.get(`/api/item/${id}`).pipe(
    catchError((err) => {
      this.notificationService.error(err.message);
      return of(null);
    })
  )
);
```

**`shareReplay` pitfall:** `shareReplay(1)` without `refCount: true` keeps the subscription alive even after all consumers unsubscribe. For HTTP calls this is usually acceptable. For WebSocket or timer streams, use `shareReplay({ bufferSize: 1, refCount: true })` to allow cleanup.

**Avoiding `async` pipe duplication:** Multiple `| async` pipes on the same observable in a template create multiple subscriptions. Extract into one subscription with `*ngIf="results$ | async as results"` or use the `ng-container` pattern.

**`takeUntilDestroyed` vs manual teardown:** The legacy pattern used a `Subject` destroyed in `ngOnDestroy`:

```typescript
private destroy$ = new Subject<void>();
obs$.pipe(takeUntil(this.destroy$)).subscribe(...);
ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
```

`takeUntilDestroyed(this.destroyRef)` eliminates the boilerplate and works in services too (not just components).

## Source

https://angular.dev/guide/rxjs-best-practices

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
