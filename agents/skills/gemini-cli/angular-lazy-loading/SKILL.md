# Angular Lazy Loading

> Reduce initial bundle size with loadComponent, loadChildren, preloading strategies, and deferrable views (@defer)

## When to Use

- Splitting a large application into feature chunks that load on demand
- Reducing time-to-interactive for the initial page load
- Lazy-loading a single standalone component for a route without a dedicated route file
- Using `@defer` to defer heavy components below the fold until the user scrolls or interacts
- Configuring preloading to load non-critical routes in the background after initial load

## Instructions

1. Use `loadComponent` in route config for standalone components — the dynamic `import()` creates a code-split point:
   ```ts
   { path: 'settings', loadComponent: () => import('./settings/settings.component').then(m => m.SettingsComponent) }
   ```
2. Use `loadChildren` with a separate routes file for feature areas with multiple routes — this creates a single chunk for the entire feature:
   ```ts
   { path: 'admin', loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES) }
   ```
3. Add preloading with `withPreloading(PreloadAllModules)` to load all lazy routes in the background after the app boots. For fine-grained control, use `QuicklinkStrategy` from `ngx-quicklink` to preload only routes linked in the current viewport.
4. Use `@defer` blocks in templates to defer heavy components until needed. Combine with `@placeholder`, `@loading`, and `@error` blocks for smooth UX.
5. Use `@defer (on viewport)` for below-the-fold content, `@defer (on interaction)` for on-demand panels, and `@defer (on idle)` for low-priority widgets.
6. Keep lazy chunk boundaries at feature-level route files — not individual components. Over-splitting creates waterfall loading.
7. Analyze bundle output with `ng build --stats-json` and `webpack-bundle-analyzer` to verify expected chunking.

```typescript
// app.routes.ts — mixing loadComponent and loadChildren
export const routes: Routes = [
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes').then((m) => m.ADMIN_ROUTES),
    canMatch: [adminGuard],
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile.component').then((m) => m.ProfileComponent),
  },
];
```

```typescript
// admin/admin.routes.ts — feature route file
export const ADMIN_ROUTES: Routes = [
  { path: '', component: AdminDashboardComponent },
  {
    path: 'users',
    loadComponent: () => import('./users/users.component').then((m) => m.UsersComponent),
  },
  {
    path: 'reports',
    loadComponent: () => import('./reports/reports.component').then((m) => m.ReportsComponent),
  },
];
```

```typescript
// main.ts — preloading configuration
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
  ],
});
```

```html
<!-- @defer — deferrable views (Angular 17+) -->
<main>
  <app-hero />
  <!-- loads immediately, in critical bundle -->

  @defer (on viewport) {
  <app-product-recommendations />
  @placeholder {
  <div class="skeleton" style="height: 200px"></div>
  } @loading (minimum 300ms) { <app-spinner /> } @error {
  <p>Failed to load recommendations.</p>
  } } @defer (on idle) {
  <app-chat-widget />
  }
</main>
```

## Details

**`loadComponent` vs `loadChildren`:** `loadComponent` is ideal for a single route that maps to a single standalone component. `loadChildren` points to an entire route array — Angular loads the chunk once and registers all child routes. Use `loadChildren` when a feature has 3+ related routes to avoid multiple separate chunks for the same conceptual feature.

**Preloading strategies:**

| Strategy                    | Behavior                                                          |
| --------------------------- | ----------------------------------------------------------------- |
| `NoPreloading` (default)    | Lazy routes load on demand only                                   |
| `PreloadAllModules`         | All lazy routes preload after app bootstraps                      |
| `QuicklinkStrategy`         | Preloads routes linked in current viewport                        |
| Custom `PreloadingStrategy` | Full control — preload based on user role, connection speed, etc. |

**Custom preloading strategy:**

```typescript
@Injectable({ providedIn: 'root' })
export class SelectivePreloadingStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['preload'] ? load() : EMPTY;
  }
}
```

**`@defer` trigger options:**

- `on viewport` — element enters the viewport (uses `IntersectionObserver`)
- `on interaction` — user clicks or focuses the placeholder
- `on hover` — user hovers the placeholder
- `on idle` — browser is idle (`requestIdleCallback`)
- `on timer(2s)` — after a delay
- `when condition` — any boolean expression becomes true
- `prefetch on idle` — prefetch the chunk while displaying placeholder synchronously

**Chunk naming:** In `angular.json`, set `namedChunks: true` to get human-readable chunk names in build output. Combined with `bundleBudgets`, this helps catch lazy routes that grow unexpectedly.

**Testing lazy routes:**

```typescript
it('navigates to admin', async () => {
  await router.navigate(['/admin']);
  await fixture.whenStable();
  expect(location.path()).toBe('/admin');
});
```

## Source

https://angular.dev/guide/routing/lazy-loading-ngmodules

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
