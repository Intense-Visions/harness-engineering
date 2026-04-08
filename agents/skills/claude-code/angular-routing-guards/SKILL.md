# Angular Routing Guards

> Protect and preload routes with functional CanActivateFn, CanDeactivateFn, ResolveFn, and CanMatchFn guards

## When to Use

- Redirecting unauthenticated users away from protected routes (`CanActivateFn`)
- Warning users about unsaved changes before navigating away (`CanDeactivateFn`)
- Pre-fetching data before a route renders to avoid loading spinners in the component (`ResolveFn`)
- Conditionally loading a lazy module based on feature flags or roles (`CanMatchFn`)
- Composing multiple guard conditions with `combineLatest` or short-circuit logic

## Instructions

1. Write guards as plain functions (functional guard pattern, Angular 14.2+), not class-based `CanActivate` implementations. Functional guards use `inject()` directly and are easier to test.
2. Return `true`, `false`, `UrlTree`, `Observable<boolean | UrlTree>`, or `Promise<boolean | UrlTree>` from a guard. Return a `UrlTree` (via `inject(Router).createUrlTree(['/login'])`) to redirect instead of just blocking.
3. Prefer `CanActivateFn` for authentication checks. Redirect to the login page and pass the attempted URL as a query param so the login page can redirect back after success.
4. Use `ResolveFn` to load required data before the route activates. The resolved data is available in `ActivatedRoute.data`. This eliminates the need for loading states in the component.
5. Use `CanDeactivateFn` to warn users about unsaved changes. The guard receives the component instance — define an interface the component implements (`HasUnsavedChanges`) and check it in the guard.
6. Use `CanMatchFn` instead of `CanActivateFn` when you want to prevent a lazy module from even loading (not just block navigation to it). This saves bundle bytes for unauthorized users.
7. Compose guards in the route's `canActivate` array — all must return `true` for the route to activate.

```typescript
// auth.guard.ts — functional authentication guard
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { map } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated$.pipe(
    map((isAuth) =>
      isAuth
        ? true
        : router.createUrlTree(['/login'], {
            queryParams: { returnUrl: state.url },
          })
    )
  );
};

// role.guard.ts — role-based access
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.hasRole('admin') ? true : router.createUrlTree(['/forbidden']);
};
```

```typescript
// unsaved-changes.guard.ts — CanDeactivateFn
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (component.hasUnsavedChanges()) {
    return confirm('You have unsaved changes. Leave anyway?');
  }
  return true;
};
```

```typescript
// product.resolver.ts — ResolveFn
import { ResolveFn } from '@angular/router';
import { inject } from '@angular/core';
import { ProductService } from './product.service';
import { Product } from './product.model';

export const productResolver: ResolveFn<Product> = (route) => {
  return inject(ProductService).getById(route.paramMap.get('id')!);
};

// Route config
{
  path: 'product/:id',
  component: ProductDetailComponent,
  resolve: { product: productResolver },
  canActivate: [authGuard],
}

// Component reads resolved data
export class ProductDetailComponent {
  product = inject(ActivatedRoute).snapshot.data['product'] as Product;
}
```

## Details

**Functional vs class guards:** Class-based guards implementing `CanActivate` interface are deprecated in Angular 15+. Functional guards have no class overhead, use `inject()` directly, and are composable as arrays in route config. If you need to wrap a class-based guard for migration, use `mapToCanActivate([LegacyGuard])` as a bridge.

**`CanMatchFn` vs `CanActivateFn`:** `CanActivate` runs after the route is matched but before it renders. `CanMatch` runs during route matching — if it returns `false`, Angular continues trying other route alternatives. This means `CanMatch` can prevent lazy chunks from loading entirely, reducing bandwidth for unauthorized users. It also enables showing different components for the same URL path based on conditions (e.g., A/B testing).

**Resolver error handling:** If a `ResolveFn` throws or the observable errors, Angular cancels navigation by default. Add error handling in the resolver or use a `catchError` to return a fallback:

```typescript
export const productResolver: ResolveFn<Product | null> = (route) => {
  return inject(ProductService)
    .getById(route.paramMap.get('id')!)
    .pipe(
      catchError(() => {
        inject(Router).navigate(['/not-found']);
        return of(null);
      })
    );
};
```

**Guard composition:** Angular runs `canActivate` guards in the array order, but all run in parallel by default if they return observables. For serial execution (first guard must pass before second runs), compose with `switchMap`:

```typescript
export const composedGuard: CanActivateFn = (route, state) =>
  authGuard(route, state).pipe(
    switchMap((authed) => (authed === true ? adminGuard(route, state) : of(authed)))
  );
```

**Testing functional guards:**

```typescript
TestBed.configureTestingModule({
  providers: [{ provide: AuthService, useValue: mockAuthService }, provideRouter([])],
});
const result = TestBed.runInInjectionContext(() => authGuard(mockRoute, mockState));
```

## Source

https://angular.dev/guide/routing/common-router-tasks
