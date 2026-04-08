# Zustand Immer

> Write mutable-style state updates in Zustand stores with the Immer middleware for cleaner nested mutations

## When to Use

- Store has deeply nested state that requires verbose spread operators to update
- Updating items in arrays by index or by ID lookup
- Teams familiar with Redux Toolkit's Immer integration wanting the same ergonomics
- Any update where the immutable spread version is hard to read or error-prone

## Instructions

1. Wrap the store creator with the `immer` middleware from `zustand/middleware/immer`.
2. Inside `set`, mutate the `state` object directly — Immer produces a new immutable state behind the scenes.
3. Do NOT return a value from the `set` callback when using Immer — just mutate.
4. The `immer` middleware should be the innermost middleware when combined with others.
5. Install `immer` as a peer dependency: `npm install immer`.

```typescript
// stores/kanban-store.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface Card {
  id: string;
  title: string;
  description: string;
}

interface Column {
  id: string;
  title: string;
  cards: Card[];
}

interface KanbanStore {
  columns: Column[];
  addCard: (columnId: string, card: Card) => void;
  moveCard: (fromCol: string, toCol: string, cardId: string) => void;
  updateCard: (columnId: string, cardId: string, updates: Partial<Card>) => void;
  removeCard: (columnId: string, cardId: string) => void;
}

export const useKanbanStore = create<KanbanStore>()(
  immer((set) => ({
    columns: [],

    addCard: (columnId, card) =>
      set((state) => {
        const column = state.columns.find((c) => c.id === columnId);
        if (column) column.cards.push(card);
      }),

    moveCard: (fromCol, toCol, cardId) =>
      set((state) => {
        const source = state.columns.find((c) => c.id === fromCol);
        const target = state.columns.find((c) => c.id === toCol);
        if (!source || !target) return;

        const cardIndex = source.cards.findIndex((c) => c.id === cardId);
        if (cardIndex === -1) return;

        const [card] = source.cards.splice(cardIndex, 1);
        target.cards.push(card);
      }),

    updateCard: (columnId, cardId, updates) =>
      set((state) => {
        const column = state.columns.find((c) => c.id === columnId);
        const card = column?.cards.find((c) => c.id === cardId);
        if (card) Object.assign(card, updates);
      }),

    removeCard: (columnId, cardId) =>
      set((state) => {
        const column = state.columns.find((c) => c.id === columnId);
        if (column) {
          column.cards = column.cards.filter((c) => c.id !== cardId);
        }
      }),
  }))
);
```

## Details

**Without Immer (comparison):** The `moveCard` action without Immer:

```typescript
moveCard: (fromCol, toCol, cardId) =>
  set((state) => ({
    columns: state.columns.map((col) => {
      if (col.id === fromCol) {
        return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
      }
      if (col.id === toCol) {
        const card = state.columns.find((c) => c.id === fromCol)!.cards.find((c) => c.id === cardId)!;
        return { ...col, cards: [...col.cards, card] };
      }
      return col;
    }),
  })),
```

**Middleware stacking with Immer:**

```typescript
create<Store>()(
  devtools(
    persist(
      immer((set) => ({
        /* ... */
      })),
      { name: 'key' }
    ),
    { name: 'Store' }
  )
);
// Order: devtools(persist(immer(...)))
```

**Immer rules:**

- Either mutate state OR return a new value — never both
- Do not destructure state at the top level (`const { items } = state; items.push(x)` — this works but is confusing; prefer `state.items.push(x)`)
- Immer cannot track mutations to `Map`, `Set`, or `Date` objects unless you enable MapSet plugin
- Immer adds ~5KB to the bundle — only use it when the readability benefit justifies it

**When NOT to use Immer:** For flat state or simple updates (`set({ count: state.count + 1 })`), Immer adds overhead without readability benefit. Use it specifically for nested mutations.

## Source

https://zustand.docs.pmnd.rs/middlewares/immer
