# Angular Service & Dependency Injection

> Design Angular services with the right provider scope, injection tokens, and hierarchical injector strategy

## When to Use

- Creating a shared service (data fetching, state, utilities) and deciding on its scope
- Replacing a module-level provider with `providedIn: 'root'` or a standalone provider
- Using `InjectionToken` to inject non-class values (config objects, feature flags, URLs)
- Injecting services into other services without circular dependencies
- Providing mock implementations in tests

## Instructions

1. Decorate every service with `@Injectable`. Use `providedIn: 'root'` as the default — it makes the service a singleton and tree-shakeable without needing to list it in a module.
2. Use `providedIn: 'root'` for app-wide singletons. Use component-level `providers: [MyService]` only when you need a fresh instance per component subtree.
3. Create `InjectionToken<T>` for any non-class dependency: API base URLs, feature flags, environment config, or factory functions.
4. Use the `inject()` function (Angular 14+) instead of constructor injection when writing standalone functions, guards, or effects. It reads more cleanly and is required outside class constructors.
5. Avoid circular dependencies by extracting shared state into a lower-level service that neither service imports.
6. Prefer `DestroyRef` injection over implementing `OnDestroy` in services — it keeps cleanup co-located with subscription setup.

```typescript
// environment config token
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => 'https://api.example.com',
});

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly destroyRef = inject(DestroyRef);

  getProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(`${this.baseUrl}/products`);
  }
}

// Override in tests or feature modules
providers: [{ provide: API_BASE_URL, useValue: 'https://staging.example.com' }];
```

```typescript
// Component-scoped service — new instance per component tree
@Component({
  selector: 'app-wizard',
  providers: [WizardStateService], // fresh instance, destroyed with component
  template: `...`,
})
export class WizardComponent {}
```

## Details

**Injector hierarchy:** Angular maintains a tree of injectors that mirrors the component tree. When a token is requested, Angular walks up the tree until it finds a provider. Root injector covers the entire app. Module injectors cover lazy-loaded modules. Component injectors cover a component and its descendants. This hierarchy is the mechanism behind scoped singletons.

**`providedIn: 'root'` vs module providers:** Module providers were the Angular 2–12 idiom. They work but require importing the module to get the service. `providedIn: 'root'` eliminates that coupling and enables tree-shaking — unused services are removed from the bundle automatically.

**`inject()` function:** Available in any injection context (constructor, field initializer, factory function, guard, resolver). It cannot be called in a method body called outside the injection context. Use it freely in class field initializers and `@Component` function callbacks.

**Multi-providers:** Use `multi: true` with a token to collect multiple implementations under one token. Angular's `HTTP_INTERCEPTORS` and `APP_INITIALIZER` tokens use this pattern.

```typescript
export const VALIDATORS = new InjectionToken<Validator[]>('VALIDATORS');
providers: [
  { provide: VALIDATORS, useClass: EmailValidator, multi: true },
  { provide: VALIDATORS, useClass: PhoneValidator, multi: true },
];
// inject(VALIDATORS) → [EmailValidator, PhoneValidator]
```

**Service isolation for testing:** Provide a mock in `TestBed.configureTestingModule`:

```typescript
TestBed.configureTestingModule({
  providers: [{ provide: ProductService, useValue: mockProductService }],
});
```

**Tree-shakeable tokens:** Pair `InjectionToken` with a `factory` to make the default value tree-shakeable:

```typescript
export const FEATURE_FLAGS = new InjectionToken<FeatureFlags>('FEATURE_FLAGS', {
  providedIn: 'root',
  factory: () => ({ darkMode: false, betaSearch: false }),
});
```

## Source

https://angular.dev/guide/di
