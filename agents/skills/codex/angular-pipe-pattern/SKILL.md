# Angular Pipe Pattern

> Create custom Angular pipes for pure data transformation and use built-in pipes correctly to keep templates declarative and performant

## When to Use

- Formatting data in templates (currency, date, truncation, pluralization) without component logic
- Reusing a display transformation across multiple templates
- Replacing complex template expressions (`{{ item.name.length > 20 ? item.name.slice(0, 20) + '...' : item.name }}`) with a readable pipe
- Using `AsyncPipe` to handle observable/promise subscriptions and change detection automatically
- Building pipes that inject services for locale-aware or permission-aware formatting

## Instructions

1. Implement the `PipeTransform` interface and decorate with `@Pipe({ name: 'myPipe', standalone: true })`.
2. Keep pipes pure by default (`pure: true` is the default). Pure pipes only re-run when the input reference changes — this is a significant performance optimization.
3. Mark a pipe `pure: false` (impure) only when the output depends on something other than the input arguments (e.g., reading from a changing service or the current time). Impure pipes run on every change detection cycle.
4. Inject services into pipes via `inject()` for locale-aware formatting, permission checks, or translation.
5. Use `| async` in templates instead of manual subscriptions — it subscribes, unsubscribes on destroy, and triggers change detection when values emit.
6. Prefer `| date:'shortDate'`, `| currency:'USD'`, `| number:'1.2-2'`, `| titlecase`, `| keyvalue` built-ins before writing custom pipes.
7. Name pipes with a consistent convention: `camelCase` in the class, matching `camelCase` in the `name` field. Use verb-noun for transformation pipes (`truncate`, `highlight`, `formatBytes`).
8. Add the standalone pipe to the `imports` array of components that use it.

```typescript
// truncate.pipe.ts — pure transformation
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'truncate', standalone: true })
export class TruncatePipe implements PipeTransform {
  transform(value: string, limit = 100, suffix = '...'): string {
    if (!value) return '';
    return value.length > limit ? `${value.slice(0, limit)}${suffix}` : value;
  }
}
```

```typescript
// format-bytes.pipe.ts — custom formatting with multiple args
@Pipe({ name: 'formatBytes', standalone: true })
export class FormatBytesPipe implements PipeTransform {
  transform(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
  }
}
```

```typescript
// highlight.pipe.ts — service-injected pipe
import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'highlight', standalone: true })
export class HighlightPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(text: string, search: string): SafeHtml {
    if (!search) return text;
    const regex = new RegExp(`(${search})`, 'gi');
    const highlighted = text.replace(regex, '<mark>$1</mark>');
    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }
}
```

```html
<!-- Template usage -->
<p>{{ product.description | truncate:150 }}</p>
<p>{{ fileSize | formatBytes }}</p>
<p [innerHTML]="product.name | highlight:searchTerm"></p>
<li *ngFor="let user of users$ | async">{{ user.name }}</li>
<p>{{ price | currency:'EUR':'symbol':'1.2-2' | uppercase }}</p>
```

## Details

**Pure vs impure pipes:** Pure pipes cache their result for a given set of input references. If the input is the same object reference, Angular returns the cached result without calling `transform()` again. This makes pipes very efficient with `OnPush` components. Impure pipes (`pure: false`) run on every change detection cycle — use sparingly and only when necessary (e.g., a pipe filtering a mutable array).

**`AsyncPipe` advantages over manual subscriptions:**

- Automatically calls `subscribe()` and `unsubscribe()` on the observable lifecycle tied to the component
- Calls `markForCheck()` on `OnPush` components when new values arrive — without this, `OnPush` components won't update
- Handles both `Observable` and `Promise` transparently

**Pipe chaining:** Pipes compose left to right: `{{ value | pipe1 | pipe2:arg }}`. Each pipe's output is the next pipe's input.

**Avoiding impure pipes for filtering/sorting:** A common mistake is creating an impure pipe that filters or sorts an array. Because the array reference doesn't change when items are pushed, a pure pipe won't re-run. Better solutions: filter in the component with `computed()` or a getter, or create a new array reference when the data changes.

**Locale-aware built-in pipes:** `DatePipe`, `CurrencyPipe`, `DecimalPipe`, and `PercentPipe` all use Angular's locale system. Provide a locale with `{ provide: LOCALE_ID, useValue: 'de-DE' }` to format numbers and dates for the user's locale automatically.

**Testing pipes:**

```typescript
describe('TruncatePipe', () => {
  const pipe = new TruncatePipe();
  it('truncates long strings', () => {
    expect(pipe.transform('a'.repeat(200), 50)).toBe('a'.repeat(50) + '...');
  });
  it('returns short strings unchanged', () => {
    expect(pipe.transform('short', 50)).toBe('short');
  });
});
```

## Source

https://angular.dev/guide/pipes

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
