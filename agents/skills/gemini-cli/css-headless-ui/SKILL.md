# Headless UI Styling

> Style accessible headless components from Radix UI and Headless UI with Tailwind data-attribute selectors

## When to Use

- Building accessible components (dialogs, dropdowns, tabs, tooltips) without reinventing ARIA patterns
- Using Radix UI primitives and styling them with Tailwind
- Using Headless UI components with Tailwind classes
- Needing full control over visual design while getting accessibility for free

## Instructions

1. Headless components expose data attributes (`data-state`, `data-side`, `data-orientation`) that reflect internal state. Use Tailwind's `data-*:` variants to style these states.
2. For Radix UI, style with `data-[state=open]:`, `data-[state=closed]:`, `data-[side=top]:`, etc.
3. For Headless UI, use render props or the `className` function pattern for state-based styling.
4. Add enter/leave animations using Tailwind's `data-[state=open]:animate-*` or the `Transition` component.
5. Always test with keyboard navigation and screen readers after styling.

```tsx
// Radix UI Dialog styled with Tailwind
import * as Dialog from '@radix-ui/react-dialog';

function Modal({
  trigger,
  title,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className="
          fixed inset-0 bg-black/50
          data-[state=open]:animate-fade-in
          data-[state=closed]:animate-fade-out
        "
        />
        <Dialog.Content
          className="
          fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          w-full max-w-md bg-white rounded-lg shadow-xl p-6
          data-[state=open]:animate-scale-in
          data-[state=closed]:animate-scale-out
          focus:outline-none
        "
        >
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="text-sm text-gray-500 mt-1">{children}</Dialog.Description>
          <Dialog.Close className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
            <XIcon className="h-4 w-4" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

```tsx
// Radix UI Dropdown Menu
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

function UserMenu() {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-gray-100">
        <Avatar /> <ChevronDown className="h-4 w-4" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[200px] bg-white rounded-md shadow-lg border p-1 data-[state=open]:animate-scale-in"
          sideOffset={5}
        >
          <DropdownMenu.Item
            className="
            flex items-center gap-2 rounded px-2 py-1.5 text-sm
            outline-none cursor-pointer
            data-[highlighted]:bg-gray-100
          "
          >
            Profile
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="
            flex items-center gap-2 rounded px-2 py-1.5 text-sm
            outline-none cursor-pointer
            data-[highlighted]:bg-gray-100
          "
          >
            Settings
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
          <DropdownMenu.Item
            className="
            flex items-center gap-2 rounded px-2 py-1.5 text-sm text-red-600
            outline-none cursor-pointer
            data-[highlighted]:bg-red-50
          "
          >
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

## Details

**Radix UI data attributes:**

- `data-state="open" | "closed"` — Dialog, Popover, Dropdown, Collapsible
- `data-state="checked" | "unchecked" | "indeterminate"` — Checkbox, Switch
- `data-state="active" | "inactive"` — Tabs
- `data-highlighted` — currently focused menu item (keyboard/hover)
- `data-disabled` — disabled item
- `data-side="top" | "right" | "bottom" | "left"` — Popover, Tooltip positioning
- `data-orientation="horizontal" | "vertical"` — Tabs, Slider

**Tailwind data attribute syntax:** `data-[attribute=value]:` maps to `[data-attribute="value"]`:

```tsx
className = 'data-[state=open]:bg-blue-50 data-[disabled]:opacity-50';
```

**Headless UI (Tailwind Labs):**

```tsx
import { Menu } from '@headlessui/react';

<Menu.Item>
  {({ active, disabled }) => (
    <button
      className={clsx(
        'block w-full text-left px-4 py-2 text-sm',
        active && 'bg-blue-500 text-white',
        disabled && 'opacity-50'
      )}
    >
      Option
    </button>
  )}
</Menu.Item>;
```

**shadcn/ui approach:** Wraps Radix primitives with CVA variants and Tailwind classes. Components are copied into your project (not installed as a dependency), giving you full control:

```bash
npx shadcn-ui@latest add dialog
# Creates components/ui/dialog.tsx with pre-styled Radix Dialog
```

## Source

https://www.radix-ui.com/primitives/docs/overview/introduction

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
