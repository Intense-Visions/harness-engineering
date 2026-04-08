# Accessible Modal Dialog Patterns

> Build accessible modal dialogs with focus trapping, escape dismissal, background inertness, and screen reader announcements

## When to Use

- Implementing modal dialogs, confirmation prompts, or alert dialogs
- Building sheet/drawer overlays that require user attention
- Creating image lightboxes or video players in overlay
- Reviewing existing modals for keyboard and screen reader accessibility

## Instructions

1. **Use the native `<dialog>` element when possible.** Modern browsers support `<dialog>` with `.showModal()`, which provides built-in focus trapping, Escape dismissal, and backdrop styling.

```tsx
function Modal({ isOpen, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="dialog-title">
      {children}
    </dialog>
  );
}
```

2. **If using a custom modal (not `<dialog>`), implement all accessibility requirements manually:**

```tsx
function CustomModal({ isOpen, onClose, title, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      // Focus the first focusable element in the modal
      requestAnimationFrame(() => {
        const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      });
    }
    return () => {
      // Return focus to trigger when closing
      triggerRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <h2 id="dialog-title">{title}</h2>
        {children}
      </div>
    </>
  );
}
```

3. **Trap focus inside the modal.** Tab and Shift+Tab must cycle through focusable elements within the modal only. Use a focus trap library or implement manually.

```typescript
function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const container = ref.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [ref, active]);
}
```

4. **Make background content inert.** When the modal is open, background content must not be interactive. Use the `inert` attribute on the main content.

```tsx
useEffect(() => {
  const main = document.getElementById('app-root');
  if (isOpen && main) {
    main.setAttribute('inert', '');
    return () => main.removeAttribute('inert');
  }
}, [isOpen]);
```

5. **Close on Escape key press.** This is expected behavior — users should never be trapped in a dialog without a keyboard exit.

6. **Close on backdrop click** for non-critical dialogs. For confirmation dialogs (`role="alertdialog"`), require explicit button interaction.

7. **Use `role="alertdialog"` for confirmation prompts** that require the user to acknowledge or make a choice. These should not close on backdrop click.

```tsx
<div
  role="alertdialog"
  aria-modal="true"
  aria-labelledby="alert-title"
  aria-describedby="alert-desc"
>
  <h2 id="alert-title">Delete Account?</h2>
  <p id="alert-desc">
    This will permanently delete your account and all data. This cannot be undone.
  </p>
  <button onClick={onCancel}>Cancel</button>
  <button onClick={onConfirm}>Delete Account</button>
</div>
```

8. **Return focus to the trigger element when the modal closes.** Save a reference to `document.activeElement` before opening the modal and call `.focus()` on it after closing.

9. **Prevent body scroll when modal is open.**

```css
body.modal-open {
  overflow: hidden;
}
```

## Details

**`<dialog>` vs. custom modal:** The native `<dialog>` element with `.showModal()` provides focus trapping, Escape dismissal, `::backdrop` styling, top-layer rendering, and `inert` behavior on background content — all for free. It is supported in all modern browsers. Use custom implementations only when you need behavior that `<dialog>` does not support.

**Focus management sequence:**

1. User clicks trigger button
2. Save reference to trigger element
3. Open modal, move focus to first focusable element (or the modal container with `tabIndex={-1}`)
4. Trap focus within modal
5. User closes modal (Escape, close button, or backdrop click)
6. Return focus to saved trigger element

**`aria-modal="true"` vs. `inert`:** `aria-modal="true"` tells screen readers that content behind the dialog is not interactive. However, some screen readers do not fully respect this. Adding `inert` to background content provides a robust fallback that works at the browser level.

**Common mistakes:**

- Focus escaping the modal when Tab reaches the end (no focus trap)
- Not returning focus to trigger on close (user is lost on the page)
- Background content scrollable and interactive while modal is open
- Missing accessible name (`aria-labelledby` or `aria-label`)
- Auto-focusing a close button instead of the most relevant element

## Source

https://www.w3.org/WAI/ARIA/apd/patterns/dialog-modal/
