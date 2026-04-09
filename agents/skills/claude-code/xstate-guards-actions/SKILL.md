# XState Guards and Actions

> Control transition eligibility with guards and execute side effects with entry, exit, and transition actions

## When to Use

- Conditionally allowing or blocking state transitions based on context or event data
- Running side effects (logging, analytics, API calls) when entering or leaving states
- Updating context data via `assign` actions during transitions
- Implementing business rules like "can only submit if form is valid"

## Instructions

1. **Guards** are pure boolean functions that determine whether a transition is allowed. Define them in the machine config under `guards` (v5) or as `cond` strings (v4).
2. **Actions** are fire-and-forget side effects. They run but their return values are ignored. Define them under `actions` in the machine config.
3. Use `assign` for context updates — it is the only way to change context. Never mutate context directly.
4. Place actions on transitions (`actions`), state entry (`entry`), or state exit (`exit`).
5. Execution order: exit actions of source state, transition actions, entry actions of target state.
6. Use arrays for multiple actions: `actions: ['logTransition', 'updateContext', 'notifyParent']`.
7. For conditional transitions (multiple targets from one event), use an array of guarded transitions evaluated in order.

```typescript
// checkout.machine.ts
import { createMachine, assign } from 'xstate';

interface CheckoutContext {
  items: Array<{ id: string; price: number }>;
  couponApplied: boolean;
  total: number;
}

type CheckoutEvent =
  | { type: 'ADD_ITEM'; item: { id: string; price: number } }
  | { type: 'APPLY_COUPON'; code: string }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' };

const checkoutMachine = createMachine<CheckoutContext, CheckoutEvent>(
  {
    id: 'checkout',
    initial: 'cart',
    context: { items: [], couponApplied: false, total: 0 },
    states: {
      cart: {
        on: {
          ADD_ITEM: {
            actions: ['addItem', 'recalculateTotal'],
          },
          APPLY_COUPON: {
            actions: 'applyCoupon',
            guard: 'isValidCoupon',
          },
          SUBMIT: [
            // Guarded transitions — evaluated top to bottom
            { target: 'review', guard: 'hasItems' },
            // Fallback — no guard
            { actions: 'showEmptyCartError' },
          ],
        },
      },
      review: {
        entry: 'logReviewStep',
        on: {
          CONFIRM: { target: 'confirmed', guard: 'hasItems' },
        },
      },
      confirmed: {
        type: 'final',
        entry: 'sendConfirmationEmail',
      },
    },
  },
  {
    guards: {
      hasItems: (ctx) => ctx.items.length > 0,
      isValidCoupon: (ctx, event) => event.type === 'APPLY_COUPON' && event.code.startsWith('SAVE'),
    },
    actions: {
      addItem: assign({
        items: (ctx, event) => (event.type === 'ADD_ITEM' ? [...ctx.items, event.item] : ctx.items),
      }),
      recalculateTotal: assign({
        total: (ctx) => {
          const subtotal = ctx.items.reduce((sum, item) => sum + item.price, 0);
          return ctx.couponApplied ? subtotal * 0.9 : subtotal;
        },
      }),
      applyCoupon: assign({ couponApplied: true }),
      logReviewStep: () => console.log('Entered review step'),
      showEmptyCartError: () => console.warn('Cart is empty'),
      sendConfirmationEmail: (ctx) => {
        // Side effect — fire and forget
        fetch('/api/confirm', { method: 'POST', body: JSON.stringify(ctx) });
      },
    },
  }
);
```

## Details

**Guard evaluation order:** When multiple transitions share the same event, guards are evaluated top to bottom. The first transition whose guard returns `true` (or has no guard) is taken. This is an if/else-if chain.

**assign is special:** `assign` returns an action object that XState processes internally. It is not a regular side effect — it is the mechanism for updating context. Never call `assign` conditionally inside a regular action function; use guarded transitions instead.

**Action types:**

- `assign` — updates context (pure, processed by XState)
- `send` / `sendTo` — sends an event to an actor (including self)
- `sendParent` — sends an event to the parent machine
- `raise` — sends an event to the machine itself (processed in the same step)
- `log` — logs to console (useful for debugging)
- `stop` — stops a child actor
- Custom functions — fire-and-forget side effects

**XState v5 differences:** Guards use `guard` instead of `cond`. Actions and guards are defined in `setup()`:

```typescript
const machine = setup({
  guards: {
    hasItems: ({ context }) => context.items.length > 0,
  },
  actions: {
    addItem: assign({
      /* ... */
    }),
  },
}).createMachine({
  /* ... */
});
```

**Testing guards:** Extract guard logic into standalone functions and unit test them. Test the machine integration separately.

## Source

https://stately.ai/docs/guards

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
