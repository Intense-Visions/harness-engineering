# Angular Reactive Forms

> Build type-safe reactive forms with FormGroup, FormControl, Validators, and dynamic FormArrays

## When to Use

- Building forms with non-trivial validation logic or cross-field validators
- Creating dynamic forms where controls are added/removed at runtime
- Needing to programmatically reset, patch, or observe form value changes via observables
- Replacing template-driven forms to gain full TypeScript type safety (Angular 14+ typed forms)
- Building wizard-style multi-step forms backed by a single FormGroup

## Instructions

1. Use `FormBuilder` (inject via `inject(FormBuilder)`) to construct `FormGroup` and `FormControl` — it reduces boilerplate significantly.
2. Type your forms explicitly: `FormGroup<{ email: FormControl<string>; password: FormControl<string> }>`. Angular 14+ infers types from the `FormBuilder.nonNullable` builder.
3. Use `FormBuilder.nonNullable` when controls should never be null — it eliminates null narrowing on `.value` reads.
4. Attach built-in validators via `Validators.required`, `Validators.email`, `Validators.minLength(n)`. Compose them as an array.
5. Write custom validators as plain functions: `(control: AbstractControl): ValidationErrors | null => ...`. Prefer synchronous validators; use async validators only for server-side checks (e.g., username availability).
6. Use `FormArray` for variable-length lists (e.g., multiple phone numbers, line items). Access controls via `.controls` and mutate via `.push()`, `.removeAt()`.
7. Subscribe to `form.statusChanges` and `form.valueChanges` sparingly — prefer template binding to `form.valid` and `form.value` in the submit handler.
8. Call `form.markAllAsTouched()` before showing validation errors on submit to trigger error display for untouched fields.

```typescript
import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormControl,
  FormArray,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';

function noWhitespace(control: AbstractControl): ValidationErrors | null {
  const trimmed = (control.value ?? '').trim();
  return trimmed.length === 0 && control.value?.length > 0 ? { whitespace: true } : null;
}

@Component({
  selector: 'app-signup',
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">
      <input formControlName="email" type="email" />
      <span *ngIf="form.controls.email.errors?.['email']">Invalid email</span>

      <div formArrayName="phones">
        <div *ngFor="let phone of phones.controls; let i = index">
          <input [formControlName]="i" type="tel" />
          <button type="button" (click)="removePhone(i)">Remove</button>
        </div>
        <button type="button" (click)="addPhone()">Add phone</button>
      </div>

      <button type="submit" [disabled]="form.invalid">Submit</button>
    </form>
  `,
})
export class SignupComponent {
  private fb = inject(FormBuilder).nonNullable;

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), noWhitespace]],
    phones: this.fb.array([this.fb.control('')]),
  });

  get phones(): FormArray<FormControl<string>> {
    return this.form.controls.phones;
  }

  addPhone(): void {
    this.phones.push(this.fb.control(''));
  }

  removePhone(index: number): void {
    this.phones.removeAt(index);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    console.log(this.form.getRawValue());
  }
}
```

## Details

**Typed forms (Angular 14+):** Before Angular 14, `.value` returned `any`. Typed forms make the value inferred from the control definition. Use `FormBuilder.nonNullable` (or `new FormControl<string>('')`) to avoid `string | null` everywhere. The `getRawValue()` method returns values including disabled controls; `.value` skips them.

**Cross-field validators:** Attach at the `FormGroup` level, not the control level. The validator receives the entire group and can compare controls:

```typescript
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const pw = group.get('password')?.value;
  const confirm = group.get('confirm')?.value;
  return pw === confirm ? null : { mismatch: true };
}
this.fb.nonNullable.group({ password: '', confirm: '' }, { validators: passwordsMatch });
```

**Async validators:** Return `Observable<ValidationErrors | null>` or `Promise<ValidationErrors | null>`. Angular sets `status` to `'PENDING'` while the validator runs. Debounce with `switchMap` to avoid hammering the server on every keystroke.

**`updateOn` strategy:** By default, validation runs on every value change. Use `updateOn: 'blur'` or `updateOn: 'submit'` on a control or group to reduce validation frequency:

```typescript
this.fb.nonNullable.control('', { validators: Validators.required, updateOn: 'blur' });
```

**Resetting vs patching:** `form.reset()` clears all controls and resets touched/dirty flags. `form.patchValue({ email: 'x' })` updates only the supplied keys. `form.setValue({...})` requires every key to be provided or throws. Prefer `patchValue` when loading partial data.

**Performance:** Avoid creating reactive form controls inside `*ngFor` loops without caching — Angular recreates them on every change detection cycle. Use `FormArray` and index-based `formControlName` instead.

## Source

https://angular.dev/guide/forms/reactive-forms

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
