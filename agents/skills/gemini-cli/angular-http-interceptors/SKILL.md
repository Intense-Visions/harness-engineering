# Angular HTTP Interceptors

> Intercept HTTP requests and responses with HttpInterceptorFn for auth headers, retry logic, loading state, and centralized error handling

## When to Use

- Attaching JWT or session tokens to every outbound request automatically
- Retrying failed requests with exponential backoff before propagating the error
- Showing a global loading spinner while any HTTP request is in flight
- Logging all HTTP errors in one place instead of per-service
- Transforming request or response bodies (e.g., camelCase/snake_case conversion)

## Instructions

1. Write interceptors as `HttpInterceptorFn` (functional, Angular 15+) rather than class-based `HttpInterceptor`. Functional interceptors use `inject()` and compose cleanly as arrays.
2. Register interceptors with `provideHttpClient(withInterceptors([authInterceptor, loggingInterceptor]))` in your app config. Order matters — interceptors run in order on request, reverse order on response.
3. Clone the request before modifying it — `HttpRequest` is immutable: `req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })`.
4. Call `next(clonedReq)` to pass the (possibly modified) request down the chain. The `next` function returns an `Observable<HttpEvent<unknown>>`.
5. Use `catchError` on the response to handle errors centrally. Return `throwError(() => err)` to propagate after logging, or return a recovery observable.
6. Implement retry with `retry({ count: 3, delay: retryStrategy })` or `retryWhen`. Only retry idempotent methods (GET, PUT, DELETE) — never POST by default.
7. Skip interceptor logic for specific requests by reading custom context values with `req.context.get(MY_TOKEN)` using `HttpContextToken`.
8. Avoid injecting services that themselves make HTTP calls from an interceptor — this creates circular request chains.

```typescript
// auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();

  if (!token) return next(req);

  const authedReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });

  return next(authedReq);
};
```

```typescript
// retry.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { retry, timer } from 'rxjs';

const RETRY_METHODS = new Set(['GET', 'PUT', 'DELETE']);

export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  if (!RETRY_METHODS.has(req.method)) return next(req);

  return next(req).pipe(
    retry({
      count: 3,
      delay: (error, retryCount) => {
        if (error.status === 0 || error.status >= 500) {
          return timer(Math.pow(2, retryCount) * 1000); // 2s, 4s, 8s
        }
        throw error; // Don't retry 4xx errors
      },
    })
  );
};
```

```typescript
// error.interceptor.ts — centralized error logging
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from './notification.service';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifications = inject(NotificationService);
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) {
        auth.logout();
        router.navigate(['/login']);
      } else if (err.status === 403) {
        router.navigate(['/forbidden']);
      } else if (err.status >= 500) {
        notifications.error('Server error. Please try again.');
      }
      return throwError(() => err);
    })
  );
};
```

```typescript
// main.ts — register interceptors in order
bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor, retryInterceptor, errorInterceptor])),
  ],
});
```

## Details

**Functional vs class-based:** Class-based interceptors implement `HttpInterceptor` and are registered via the `HTTP_INTERCEPTORS` multi-token. Functional interceptors are registered with `withInterceptors()`. You can mix both using `withInterceptorsFromDi()` alongside `withInterceptors()`, but prefer the functional approach for new code.

**`HttpContextToken` for opt-out:**

```typescript
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

// In the interceptor
if (req.context.get(SKIP_AUTH)) return next(req);

// In a service — skip auth for this request
this.http.get('/public', {
  context: new HttpContext().set(SKIP_AUTH, true),
});
```

**Loading indicator pattern:**

```typescript
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(LoadingService);
  loading.increment();
  return next(req).pipe(finalize(() => loading.decrement()));
};
```

**Token refresh (401 retry):** Handle expired tokens by catching 401, refreshing the token, then retrying the original request:

```typescript
return next(req).pipe(
  catchError((err: HttpErrorResponse) => {
    if (err.status !== 401) return throwError(() => err);
    return inject(AuthService)
      .refreshToken()
      .pipe(
        switchMap((token) => next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))),
        catchError(() => {
          inject(Router).navigate(['/login']);
          return throwError(() => err);
        })
      );
  })
);
```

**Interceptor order:** Request interceptors execute top-to-bottom in the `withInterceptors` array. Response handling (`catchError`, `tap` on response) executes bottom-to-top. Think of it as middleware wrapping.

## Source

https://angular.dev/guide/http/interceptors

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
