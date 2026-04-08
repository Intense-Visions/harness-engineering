# Keyboard Navigation

> Ensure all interactive elements are reachable and operable via keyboard alone without requiring a mouse

## When to Use

- Building any interactive web component
- Adding custom widgets (dropdowns, sliders, tabs, drag-and-drop)
- Reviewing focus order after layout changes
- Implementing focus management for modals, drawers, or dynamic content
- Ensuring compliance with WCAG 2.1 Success Criterion 2.1.1 (Keyboard)

## Instructions

1. **Use native interactive elements.** `<button>`, `<a>`, `<input>`, `<select>`, and `<textarea>` are keyboard-accessible by default. They receive focus, respond to Enter/Space, and are announced by screen readers. Never recreate this behavior on `<div>` or `<span>`.

2. **Provide a visible focus indicator.** Users must see where focus is. Never remove the outline without providing an alternative.

```css
/* Remove default only if providing a custom indicator */
:focus-visible {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}

/* Never do this without a replacement */
/* :focus { outline: none; } */
```

Use `:focus-visible` instead of `:focus` so the indicator appears only for keyboard users, not mouse clicks.

3. **Add a skip navigation link** as the first focusable element on every page. This lets keyboard users bypass repetitive navigation.

```html
<body>
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <nav><!-- navigation --></nav>
  <main id="main-content"><!-- content --></main>
</body>
```

```css
.skip-link {
  position: absolute;
  left: -10000px;
}
.skip-link:focus {
  position: static;
  display: block;
}
```

4. **Maintain a logical tab order.** The DOM order should match the visual order. Avoid `tabindex` values greater than 0 — they disrupt the natural flow. Use only `tabindex="0"` (add to tab order) and `tabindex="-1"` (programmatically focusable but not in tab order).

```tsx
// tabindex="0" — makes a non-interactive element focusable
<div role="listbox" tabIndex={0}>

// tabindex="-1" — focusable via JavaScript, not via Tab
<div id="error-message" tabIndex={-1} ref={errorRef}>
```

5. **Implement keyboard event handlers for custom widgets.** Follow WAI-ARIA Authoring Practices for expected key bindings:
   - **Tabs:** Arrow keys move between tabs, Tab moves to the tab panel
   - **Menus:** Arrow keys navigate items, Enter selects, Escape closes
   - **Combobox:** Arrow keys navigate options, Enter selects, Escape clears
   - **Dialog:** Tab cycles within the dialog, Escape closes

```tsx
function handleKeyDown(e: React.KeyboardEvent) {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      focusNextItem();
      break;
    case 'ArrowUp':
      e.preventDefault();
      focusPreviousItem();
      break;
    case 'Home':
      e.preventDefault();
      focusFirstItem();
      break;
    case 'End':
      e.preventDefault();
      focusLastItem();
      break;
    case 'Escape':
      closeMenu();
      break;
  }
}
```

6. **Manage focus when content changes dynamically.** When a modal opens, move focus into it. When it closes, return focus to the trigger element. When a route changes in a SPA, move focus to the new page heading or main content.

```tsx
function openModal() {
  triggerRef.current = document.activeElement as HTMLElement;
  setIsOpen(true);
  // Focus the modal after render
  requestAnimationFrame(() => modalRef.current?.focus());
}

function closeModal() {
  setIsOpen(false);
  triggerRef.current?.focus(); // return focus to trigger
}
```

7. **Implement focus trapping in modals and dialogs.** When a modal is open, Tab and Shift+Tab should cycle only through focusable elements within the modal — not escape to the page behind.

```typescript
function trapFocus(container: HTMLElement) {
  const focusable = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}
```

8. **Never create keyboard traps.** Users must always be able to navigate away from any component using standard keys (Tab, Escape). The only exception is modal dialogs, which trap focus intentionally but provide an Escape key exit.

## Details

**WCAG requirements:** SC 2.1.1 (Keyboard) requires all functionality to be operable via keyboard. SC 2.1.2 (No Keyboard Trap) requires users to be able to move focus away from any component. SC 2.4.7 (Focus Visible) requires a visible focus indicator.

**`tabindex` values:**

- Omitted or not applicable: Element follows default focusability (interactive elements are focusable, non-interactive are not)
- `0`: Element is added to the natural tab order based on DOM position
- `-1`: Element is focusable via `element.focus()` but not via Tab key
- Positive values (`1`, `2`, etc.): Avoid — they override natural tab order and create maintenance nightmares

**Roving tabindex pattern:** For composite widgets (tab lists, toolbars), only one item has `tabindex="0"` at a time. Arrow keys move `tabindex="0"` to the next item and `tabindex="-1"` to the previous. Tab moves focus out of the widget entirely.

**Testing keyboard navigation:** Unplug your mouse and use the application with keyboard only. Tab through every page, activate every button, fill every form, dismiss every dialog. If you get stuck or cannot see where focus is, there is a bug.

## Source

https://www.w3.org/WAI/WCAG21/Understanding/keyboard
