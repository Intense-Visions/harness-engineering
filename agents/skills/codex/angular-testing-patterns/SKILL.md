# Angular Testing Patterns

> Test Angular components, services, directives, and pipes with TestBed, ComponentFixture, fakeAsync, and service mocks

## When to Use

- Writing unit tests for Angular components with shallow or deep rendering
- Mocking service dependencies in component and service tests
- Testing asynchronous code (HTTP, timers, observables) with `fakeAsync` + `tick`
- Using `spectator` to reduce `TestBed` boilerplate for component tests
- Testing standalone components without NgModule ceremony

## Instructions

1. Use `TestBed.configureTestingModule({ imports: [MyStandaloneComponent] })` for standalone components — import, not declare.
2. Mock services with `{ provide: MyService, useValue: mockService }` in the `providers` array. Define mocks as `jasmine.createSpyObj` (Jasmine) or `jest.fn()` (Jest) objects.
3. Always call `fixture.detectChanges()` after setup and after state mutations to trigger change detection before asserting on the DOM.
4. Use `fakeAsync` + `tick()` for timer-based code. Use `fakeAsync` + `flush()` for promise-based code. Use `fakeAsync` + `flushMicrotasks()` for microtasks.
5. Query DOM elements with `fixture.debugElement.query(By.css('selector'))` or `fixture.nativeElement.querySelector()`. Prefer `By.css` — it returns a `DebugElement` with Angular context.
6. Test outputs by subscribing to the `EventEmitter` or signal output directly: `component.myOutput.subscribe(spy)`.
7. For HTTP services, use `HttpClientTestingModule` and `HttpTestingController` to verify requests and flush mock responses.
8. Use the `spectator` library (`@ngneat/spectator`) to reduce boilerplate — it wraps `TestBed` and adds ergonomic query helpers.

```typescript
// product-card.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { ProductCardComponent } from './product-card.component';
import { CartService } from '../cart.service';

describe('ProductCardComponent', () => {
  let component: ProductCardComponent;
  let fixture: ComponentFixture<ProductCardComponent>;
  let mockCartService: jasmine.SpyObj<CartService>;

  beforeEach(async () => {
    mockCartService = jasmine.createSpyObj('CartService', ['addItem']);

    await TestBed.configureTestingModule({
      imports: [ProductCardComponent], // standalone component
      providers: [{ provide: CartService, useValue: mockCartService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductCardComponent);
    component = fixture.componentInstance;

    // Set required signal input
    fixture.componentRef.setInput('product', {
      id: '1',
      name: 'Widget',
      price: 9.99,
    });

    fixture.detectChanges();
  });

  it('should display the product name', () => {
    const heading = fixture.debugElement.query(By.css('h2'));
    expect(heading.nativeElement.textContent).toBe('Widget');
  });

  it('should emit addToCart when button clicked', () => {
    const addSpy = jasmine.createSpy();
    component.addToCart.subscribe(addSpy);

    fixture.debugElement.query(By.css('button')).nativeElement.click();
    expect(addSpy).toHaveBeenCalledWith({ id: '1', name: 'Widget', price: 9.99 });
  });
});
```

```typescript
// product.service.spec.ts — HTTP service test
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ProductService } from './product.service';

describe('ProductService', () => {
  let service: ProductService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ProductService],
    });
    service = TestBed.inject(ProductService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify()); // assert no pending requests

  it('should fetch products', () => {
    const mockProducts = [{ id: '1', name: 'Widget', price: 9.99 }];
    let result: Product[] | undefined;

    service.getProducts().subscribe((p) => (result = p));

    const req = httpMock.expectOne('/api/products');
    expect(req.request.method).toBe('GET');
    req.flush(mockProducts);

    expect(result).toEqual(mockProducts);
  });
});
```

```typescript
// async test with fakeAsync
import { fakeAsync, tick } from '@angular/core/testing';

it('should debounce search input', fakeAsync(() => {
  component.searchControl.setValue('widget');
  tick(300); // advance timer by 300ms (debounce time)
  fixture.detectChanges();

  expect(mockSearchService.search).toHaveBeenCalledWith('widget');
}));
```

```typescript
// spectator usage — reduces boilerplate significantly
import { createComponentFactory, Spectator } from '@ngneat/spectator';

describe('ProductCardComponent', () => {
  let spectator: Spectator<ProductCardComponent>;
  const createComponent = createComponentFactory({
    component: ProductCardComponent,
    mocks: [CartService],
  });

  beforeEach(() => {
    spectator = createComponent({ props: { product: mockProduct } });
  });

  it('shows product name', () => {
    expect(spectator.query('h2')).toHaveText('Widget');
  });

  it('calls addItem on click', () => {
    spectator.click('button');
    expect(spectator.inject(CartService).addItem).toHaveBeenCalled();
  });
});
```

## Details

**Setting signal inputs in tests:** Signal inputs (`input()`) cannot be set directly via `component.myInput = value` because they are read-only signals. Use `fixture.componentRef.setInput('inputName', value)` instead — this is the supported API for setting signal inputs in tests.

**`compileComponents()` requirement:** In tests that use `templateUrl` or `styleUrls`, call `await TestBed.configureTestingModule({...}).compileComponents()` to compile the external resources asynchronously. For inline templates, it is not strictly required but harmless.

**Testing `OnPush` components:** `OnPush` components only update when inputs change, an async pipe resolves, or signals emit. In tests, `fixture.detectChanges()` triggers a change detection cycle. If you mutate state without changing a signal or input reference, the template won't update. Set signal values with `.set()` and call `fixture.detectChanges()` afterward.

**Test isolation:** Each `TestBed.configureTestingModule` call in `beforeEach` creates a fresh Angular testing environment. Avoid sharing mutable state across tests — reset spies in `afterEach` if reused.

**Avoiding real HTTP calls:** Always provide `HttpClientTestingModule` or mock the service. `HttpTestingController.verify()` in `afterEach` ensures no unexpected HTTP requests were made.

**Signal stores in tests:** Provide a test version of the store or override state with `patchState` if the store is provided in the component.

## Source

https://angular.dev/guide/testing

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
