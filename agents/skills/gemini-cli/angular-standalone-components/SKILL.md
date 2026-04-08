# Angular Standalone Components

> Build module-free Angular apps with standalone: true, bootstrapApplication, and lazy-loaded standalone routes

## When to Use

- Starting a new Angular 17+ application (standalone is the default and recommended approach)
- Migrating from NgModule-based apps to reduce boilerplate and improve tree-shaking
- Adding lazy-loaded feature routes without creating a dedicated NgModule
- Publishing a reusable component library that consumers can import without module ceremony

## Instructions

1. Set `standalone: true` in the `@Component`, `@Directive`, or `@Pipe` decorator. Standalone components declare their own dependencies in the `imports` array instead of through a module.
2. List every dependency the template uses in the `imports` array: other standalone components, directives, pipes, and Angular built-ins like `NgIf`, `NgFor`, `AsyncPipe`, `RouterLink`, `ReactiveFormsModule`.
3. Bootstrap the app with `bootstrapApplication(AppComponent, appConfig)` in `main.ts`. Move all providers (`provideRouter`, `provideHttpClient`, `provideAnimations`) into the `appConfig` object.
4. Configure routing with `provideRouter(routes)`. Use `loadComponent` for lazy-loaded standalone components and `loadChildren` for lazy feature route arrays.
5. Import `CommonModule` only as a last resort when migrating. Prefer importing individual directives (`NgIf`, `NgFor`, `AsyncPipe`) for better tree-shaking.
6. Share providers across a lazy route group by using the `providers` array on a route object — this creates a scoped injector for that route subtree.
7. Run `ng generate component --standalone` (or set `standalone: true` as the default in `angular.json` schematics) to generate standalone components by default.

```typescript
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/auth.interceptor';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
  ],
});
```

```typescript
// app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes').then((m) => m.ADMIN_ROUTES),
    // providers scoped to this route subtree
    providers: [AdminStateService],
  },
];
```

```typescript
// A standalone component
import { Component } from '@angular/core';
import { NgFor, AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProductCardComponent } from '../product-card/product-card.component';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [NgFor, AsyncPipe, RouterLink, ProductCardComponent],
  template: `
    <app-product-card
      *ngFor="let p of products$ | async"
      [product]="p"
      [routerLink]="['/product', p.id]"
    />
  `,
})
export class ProductListComponent { ... }
```

## Details

**Why standalone over NgModules:** NgModules were a layer of indirection that required declaring, exporting, and importing components in multiple places. Standalone components are self-describing — the `imports` array is the entire dependency manifest. This makes the component portable, tree-shakeable, and easier to test (no `TestBed.configureTestingModule` module imports needed, just the component itself).

**`provideRouter` features:** The functional router API supports feature flags as composable functions:

```typescript
provideRouter(
  routes,
  withDebugTracing(), // logs route events to console
  withPreloading(PreloadAllModules),
  withComponentInputBinding(), // binds route params to @Input()
  withViewTransitions() // enables View Transitions API
);
```

**`withComponentInputBinding`:** Enables binding route params, query params, and data directly to component inputs without injecting `ActivatedRoute`. The route param `id` maps to `@Input() id: string`.

**Migrating from NgModules:** Use the Angular CLI migration: `ng generate @angular/core:standalone`. It runs in three passes: convert declarations to standalone, remove unnecessary NgModules, switch the bootstrap call.

**Scoped providers on routes:** When a provider is listed in a route's `providers` array, it creates an Environment Injector scoped to that route. Services provided here are singletons within the lazy subtree but destroyed when the route is unloaded. This replaces the `forRoot()`/`forChild()` pattern from modules.

**Testing standalone components:**

```typescript
await TestBed.configureTestingModule({
  imports: [ProductListComponent], // import, not declare
}).compileComponents();
```

## Source

https://angular.dev/guide/components/importing
