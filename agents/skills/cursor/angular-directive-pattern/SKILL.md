# Angular Directive Pattern

> Create attribute and structural directives with @Directive to add behavior, handle host events, and conditionally render DOM without modifying component templates

## When to Use

- Adding reusable behavior to elements without wrapping them in a component (tooltip, click-outside, auto-focus, ripple)
- Conditionally rendering or structurally manipulating the DOM (custom `*ngIf`, `*appRole`)
- Binding CSS classes, styles, or ARIA attributes to host elements reactively
- Abstracting interaction patterns (drag handles, keyboard navigation, form field enhancement)
- Creating a composable behavior that can be applied to any element via a CSS selector

## Instructions

1. Use `@Directive({ selector: '[appHighlight]', standalone: true })` for attribute directives. Use attribute selectors (`[appX]`) by convention — element selectors are reserved for components.
2. Use `host: { '(click)': 'onClick()', '[class.active]': 'isActive' }` in the decorator instead of `@HostListener` and `@HostBinding` — it is compile-time verified and more readable.
3. Inject `ElementRef<HTMLElement>` to access the host DOM element. Inject `Renderer2` when manipulating the DOM to preserve server-side rendering compatibility — never manipulate `nativeElement` directly in SSR.
4. Accept configuration via `input()` or `@Input()`. Use `input.required()` for mandatory config.
5. Clean up event listeners and subscriptions in `ngOnDestroy`. Prefer `inject(DestroyRef)` over implementing `OnDestroy`.
6. For structural directives, inject `TemplateRef` and `ViewContainerRef`. Call `viewContainer.createEmbeddedView(templateRef)` to render and `viewContainer.clear()` to remove.
7. Compose directives — a single element can have multiple attribute directives applied simultaneously.
8. Add the standalone directive to the `imports` array of the components that use it.

```typescript
// highlight.directive.ts — attribute directive
import { Directive, ElementRef, Renderer2, input, inject, DestroyRef } from '@angular/core';

@Directive({
  selector: '[appHighlight]',
  standalone: true,
  host: {
    '(mouseenter)': 'onEnter()',
    '(mouseleave)': 'onLeave()',
    '[style.backgroundColor]': 'highlightColor()',
  },
})
export class HighlightDirective {
  private el = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);

  color = input<string>('yellow', { alias: 'appHighlight' });

  highlightColor = computed(() => (this.active ? this.color() : 'transparent'));

  private active = false;

  onEnter(): void {
    this.active = true;
  }
  onLeave(): void {
    this.active = false;
  }
}
```

```typescript
// click-outside.directive.ts — global event on document
import { Directive, output, inject, ElementRef, OnInit, DestroyRef } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';

@Directive({ selector: '[appClickOutside]', standalone: true })
export class ClickOutsideDirective implements OnInit {
  clickOutside = output<void>();

  private el = inject(ElementRef);
  private document = inject(DOCUMENT);
  private destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    fromEvent<MouseEvent>(this.document, 'click')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (!this.el.nativeElement.contains(event.target)) {
          this.clickOutside.emit();
        }
      });
  }
}
```

```typescript
// role.directive.ts — structural directive
import { Directive, inject, input, TemplateRef, ViewContainerRef, effect } from '@angular/core';
import { AuthService } from './auth.service';

@Directive({ selector: '[appRole]', standalone: true })
export class RoleDirective {
  private auth = inject(AuthService);
  private templateRef = inject(TemplateRef<unknown>);
  private viewContainer = inject(ViewContainerRef);

  requiredRole = input.required<string>({ alias: 'appRole' });

  constructor() {
    effect(() => {
      if (this.auth.hasRole(this.requiredRole())) {
        this.viewContainer.createEmbeddedView(this.templateRef);
      } else {
        this.viewContainer.clear();
      }
    });
  }
}
```

```html
<!-- Usage -->
<p appHighlight="lightblue">Hover me</p>
<div [appClickOutside]="close()" (appClickOutside)="isOpen = false">...</div>
<button *appRole="'admin'">Delete All</button>
```

## Details

**Attribute vs structural directives:** Attribute directives add or modify behavior on an existing element (classes, styles, events, ARIA). Structural directives change the DOM layout by adding or removing elements — they use the `*` prefix sugar which desugars to `[ngTemplateOutlet]` with a `<ng-template>`.

**`host` vs `@HostListener`/`@HostBinding`:** The `host` metadata in the decorator is the preferred approach in Angular 17+. It is statically analyzable, doesn't require decorator imports in the class body, and maps directly to what the compiler emits. `@HostListener` and `@HostBinding` still work but are considered legacy style.

**Renderer2 for SSR safety:** Direct DOM manipulation (`this.el.nativeElement.style.color = 'red'`) breaks in server-side rendering because `document` and DOM APIs don't exist. `Renderer2` abstracts the rendering layer and works in both browser and Node environments:

```typescript
this.renderer.setStyle(this.el.nativeElement, 'color', 'red');
this.renderer.addClass(this.el.nativeElement, 'is-active');
this.renderer.setAttribute(this.el.nativeElement, 'aria-expanded', 'true');
```

**TypeScript context type for structural directives:** Provide a static `ngTemplateContextGuard` to type the template variables exposed by a structural directive:

```typescript
static ngTemplateContextGuard<T>(
  dir: LetDirective<T>,
  ctx: unknown
): ctx is { appLet: T } { return true; }
```

**Testing directives:**

```typescript
@Component({ template: '<span appHighlight="yellow">Test</span>', imports: [HighlightDirective] })
class TestHostComponent {}

const fixture = TestBed.createComponent(TestHostComponent);
const directive = fixture.debugElement.query(By.directive(HighlightDirective));
```

## Source

https://angular.dev/guide/directives
