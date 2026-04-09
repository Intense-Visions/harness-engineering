# Accessible Form Patterns

> Build accessible forms with proper labeling, grouped controls, inline validation, and clear error communication

## When to Use

- Creating any form — login, registration, checkout, settings
- Adding validation feedback that assistive technology can perceive
- Grouping related form controls (address fields, payment details)
- Implementing multi-step forms or wizards
- Reviewing existing forms for accessibility compliance

## Instructions

1. **Associate every input with a visible `<label>`.** Use `htmlFor` (React) or `for` (HTML) to link the label to the input. Clicking the label should focus the input.

```tsx
<label htmlFor="email">Email address</label>
<input id="email" type="email" name="email" />
```

Never use placeholder text as a substitute for a label — it disappears when the user starts typing and has poor contrast.

2. **Use `<fieldset>` and `<legend>` to group related controls.** Screen readers announce the legend as context for each control within the group.

```html
<fieldset>
  <legend>Shipping Address</legend>
  <label for="street">Street</label>
  <input id="street" name="street" />
  <label for="city">City</label>
  <input id="city" name="city" />
</fieldset>

<fieldset>
  <legend>Payment method</legend>
  <label><input type="radio" name="payment" value="card" /> Credit card</label>
  <label><input type="radio" name="payment" value="paypal" /> PayPal</label>
</fieldset>
```

3. **Mark required fields explicitly.** Use the `required` attribute for native validation and `aria-required="true"` for custom validation. Include a visible indicator (asterisk with explanation).

```tsx
<label htmlFor="name">
  Full name <span aria-hidden="true">*</span>
</label>
<input id="name" required aria-required="true" />
<p className="form-note">Fields marked with * are required.</p>
```

4. **Provide inline validation errors linked to the input.** Use `aria-invalid` to mark the field and `aria-describedby` or `aria-errormessage` to point to the error text.

```tsx
<label htmlFor="password">Password</label>
<input
  id="password"
  type="password"
  aria-invalid={!!errors.password}
  aria-describedby={errors.password ? 'password-error' : 'password-hint'}
/>
<p id="password-hint">Must be at least 8 characters.</p>
{errors.password && (
  <p id="password-error" role="alert" className="error">
    {errors.password}
  </p>
)}
```

5. **Use `aria-live` or `role="alert"` for dynamic validation messages.** When errors appear after form submission or as the user types, screen readers must be notified.

6. **Provide an error summary at the top of the form on submission failure.** List all errors with links to the corresponding fields. Move focus to the summary.

```tsx
{
  errors.length > 0 && (
    <div role="alert" tabIndex={-1} ref={errorSummaryRef}>
      <h2>There are {errors.length} errors in this form</h2>
      <ul>
        {errors.map((err) => (
          <li key={err.field}>
            <a href={`#${err.field}`}>{err.message}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

7. **Use `autocomplete` attributes for common fields.** This enables browser autofill and password managers, which benefit users with motor and cognitive disabilities.

```html
<input name="name" autocomplete="name" />
<input name="email" autocomplete="email" />
<input name="tel" autocomplete="tel" />
<input name="address" autocomplete="street-address" />
<input name="cc-number" autocomplete="cc-number" />
```

8. **Do not disable the submit button while the form is incomplete.** Disabled buttons are not focusable and provide no feedback about what is wrong. Instead, allow submission and show validation errors.

9. **Support keyboard submission.** Forms should submit when the user presses Enter in a text input. Use `<form>` with a `<button type="submit">` — do not rely on JavaScript click handlers alone.

10. **Use `inputmode` and `type` to show the right keyboard on mobile.** `type="email"` shows an email keyboard, `inputmode="numeric"` shows a number pad.

## Details

**Label association methods (in order of preference):**

1. `<label for="id">` — explicit association, most reliable
2. `<label>` wrapping the input — implicit association, works in all browsers
3. `aria-label` — invisible label, use only when no visible label is possible
4. `aria-labelledby` — references another element as the label
5. `title` attribute — last resort, announced inconsistently

**Multi-step forms:** Indicate progress with a step indicator using `aria-current="step"`. Announce step transitions with `aria-live`. Allow backward navigation without losing data.

**Custom select/dropdown:** Native `<select>` is fully accessible. Custom dropdowns must implement the combobox or listbox pattern with full keyboard support and ARIA attributes. Consider whether the customization is worth the complexity.

**Common mistakes:**

- Using `placeholder` instead of `<label>` (disappears, poor contrast)
- Disabling paste on password fields (breaks password managers)
- Time-limited forms without extension options (WCAG 2.2.1)
- Validation that only uses color (red border without error text)
- CAPTCHAs without accessible alternatives

## Source

https://www.w3.org/WAI/tutorials/forms/

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
