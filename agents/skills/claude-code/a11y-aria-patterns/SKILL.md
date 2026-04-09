# ARIA Patterns

> Apply ARIA roles, states, and properties correctly to enhance assistive technology support for custom widgets

## When to Use

- Building custom interactive widgets that have no native HTML equivalent
- Adding accessible names or descriptions to elements
- Announcing dynamic content changes to screen readers
- Indicating expanded/collapsed, selected, or error states
- When native HTML semantics are insufficient (and only then)

## Instructions

1. **Follow the first rule of ARIA: do not use ARIA if native HTML works.** A `<button>` is better than `<div role="button">`. A `<nav>` is better than `<div role="navigation">`. ARIA overrides semantics; native HTML provides them for free.

2. **Use `aria-label` and `aria-labelledby` to provide accessible names.** Every interactive element needs an accessible name — screen readers announce it.

```tsx
// aria-label — inline text label (when no visible label exists)
<button aria-label="Close dialog">
  <XIcon />
</button>

// aria-labelledby — reference a visible label element
<h2 id="dialog-title">Confirm Deletion</h2>
<div role="dialog" aria-labelledby="dialog-title">
```

- Prefer `aria-labelledby` over `aria-label` when a visible text element exists — it avoids translation gaps.
- `aria-label` replaces the element's visible text for screen readers. If the button says "X", `aria-label="Close"` makes screen readers say "Close button."

3. **Use `aria-describedby` for supplementary information.** Unlike `aria-labelledby` (which names the element), `aria-describedby` provides additional context read after the name.

```tsx
<input
  type="password"
  aria-label="Password"
  aria-describedby="password-help"
/>
<p id="password-help">Must be at least 8 characters with one number.</p>
```

4. **Use `aria-live` regions to announce dynamic content.** When content updates without a page reload (toast notifications, form validation, live scores), use `aria-live` to announce the change.

```tsx
// polite — waits for the screen reader to finish current speech
<div aria-live="polite" role="status">
  {statusMessage}
</div>

// assertive — interrupts current speech (use sparingly)
<div aria-live="assertive" role="alert">
  {errorMessage}
</div>
```

- Render the live region in the DOM before populating it — screen readers only track changes to existing live regions.
- Use `role="status"` for informational updates and `role="alert"` for urgent errors.

5. **Use state attributes to reflect widget state.** Keep ARIA states synchronized with visual state.

```tsx
// Expandable section
<button
  aria-expanded={isOpen}
  aria-controls="panel-1"
  onClick={() => setIsOpen(!isOpen)}
>
  Settings
</button>
<div id="panel-1" hidden={!isOpen}>
  {/* panel content */}
</div>

// Toggle button
<button aria-pressed={isMuted} onClick={toggleMute}>
  Mute
</button>

// Disabled state
<button aria-disabled={isSubmitting} onClick={isSubmitting ? undefined : handleSubmit}>
  Submit
</button>
```

6. **Use `aria-hidden="true"` to hide decorative or redundant content from screen readers.** Icons next to text labels, decorative images, and duplicate content should be hidden.

```tsx
<button>
  <SearchIcon aria-hidden="true" />
  <span>Search</span>
</button>
```

Do not use `aria-hidden="true"` on focusable elements — it creates a confusing state where the element receives focus but is invisible to assistive technology.

7. **Use roles for custom widgets that have no native equivalent.** Common role patterns:

```tsx
// Tab interface
<div role="tablist">
  <button role="tab" aria-selected={activeTab === 0} aria-controls="panel-0">Tab 1</button>
  <button role="tab" aria-selected={activeTab === 1} aria-controls="panel-1">Tab 2</button>
</div>
<div role="tabpanel" id="panel-0" aria-labelledby="tab-0">Content 1</div>

// Combobox (autocomplete)
<input role="combobox" aria-expanded={isOpen} aria-controls="listbox-1" aria-activedescendant={activeOptionId} />
<ul role="listbox" id="listbox-1">
  <li role="option" id="opt-1" aria-selected={selected === 'opt-1'}>Option 1</li>
</ul>

// Alert dialog
<div role="alertdialog" aria-labelledby="alert-title" aria-describedby="alert-desc">
  <h2 id="alert-title">Delete Account?</h2>
  <p id="alert-desc">This action cannot be undone.</p>
  <button>Cancel</button>
  <button>Delete</button>
</div>
```

8. **Use `aria-invalid` and `aria-errormessage` for form validation errors.**

```tsx
<input
  aria-invalid={!!errors.email}
  aria-errormessage={errors.email ? 'email-error' : undefined}
/>;
{
  errors.email && (
    <span id="email-error" role="alert">
      {errors.email}
    </span>
  );
}
```

## Details

**ARIA categories:**

- **Roles:** Define what an element is (e.g., `tab`, `dialog`, `alert`, `progressbar`). Set once; do not change dynamically.
- **States:** Dynamic boolean/tristate values that change with user interaction (e.g., `aria-expanded`, `aria-selected`, `aria-pressed`).
- **Properties:** Relatively static attributes that describe relationships or characteristics (e.g., `aria-label`, `aria-describedby`, `aria-controls`).

**The five rules of ARIA:**

1. Do not use ARIA if native HTML works.
2. Do not change native semantics (do not put `role="button"` on an `<a>`).
3. All interactive ARIA elements must be keyboard-operable.
4. Do not use `role="presentation"` or `aria-hidden="true"` on focusable elements.
5. All interactive elements must have an accessible name.

**Common mistakes:**

- Adding `role="button"` without keyboard support (Enter and Space activation)
- Using `aria-label` on non-interactive elements where it has no effect
- Setting `aria-expanded` without updating it when state changes
- Overusing `aria-live="assertive"` (interrupts users constantly)
- Using `aria-hidden="true"` on a parent containing focusable children

**Testing:** Use the accessibility tree in browser DevTools to verify that ARIA attributes produce the expected accessible name, role, and state.

## Source

https://www.w3.org/TR/wai-aria-1.2/

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
