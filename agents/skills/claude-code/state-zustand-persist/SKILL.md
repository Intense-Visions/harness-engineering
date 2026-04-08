# Zustand Persist

> Persist Zustand store to localStorage or custom storage with automatic rehydration and migration support

## When to Use

- Preserving user preferences, theme settings, or cart contents across page reloads
- Building offline-capable features that need state survival
- Selectively persisting some state fields while keeping others ephemeral
- Migrating persisted state when the store shape changes between versions

## Instructions

1. Wrap the store creator with the `persist` middleware from `zustand/middleware`.
2. Provide a `name` — this is the localStorage key. Make it unique per store.
3. Use `partialize` to persist only specific fields. By default, the entire store is persisted.
4. Use `storage` to change the storage backend (sessionStorage, IndexedDB, AsyncStorage).
5. Use `version` and `migrate` to handle schema changes between app versions.
6. Handle the rehydration delay — state is synchronously initialized with defaults, then asynchronously rehydrated from storage.

```typescript
// stores/settings-store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SettingsStore {
  theme: 'light' | 'dark';
  locale: string;
  sidebarOpen: boolean;
  setTheme: (theme: 'light' | 'dark') => void;
  setLocale: (locale: string) => void;
  toggleSidebar: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'light',
      locale: 'en',
      sidebarOpen: true,
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    {
      name: 'app-settings',
      // Only persist theme and locale — not sidebarOpen
      partialize: (state) => ({
        theme: state.theme,
        locale: state.locale,
      }),
    }
  )
);
```

## Details

**Rehydration timing:** On first render, the store uses the default values defined in `create`. The persisted values load asynchronously from storage. Use `onRehydrateStorage` to detect when rehydration completes:

```typescript
persist(storeCreator, {
  name: 'app-settings',
  onRehydrateStorage: () => {
    return (state, error) => {
      if (error) console.error('Rehydration failed', error);
      else console.log('Rehydrated', state);
    };
  },
});
```

**Waiting for rehydration in components:**

```typescript
// Option 1: useStore.persist.hasHydrated()
function App() {
  const hasHydrated = useSettingsStore.persist.hasHydrated();
  if (!hasHydrated) return <Spinner />;
  return <Main />;
}

// Option 2: onFinishHydration listener
useEffect(() => {
  const unsub = useSettingsStore.persist.onFinishHydration(() => {
    setReady(true);
  });
  return unsub;
}, []);
```

**Custom storage:** For non-localStorage backends:

```typescript
const indexedDBStorage = createJSONStorage(() => ({
  getItem: async (name) => {
    /* read from IndexedDB */
  },
  setItem: async (name, value) => {
    /* write to IndexedDB */
  },
  removeItem: async (name) => {
    /* delete from IndexedDB */
  },
}));

persist(storeCreator, { name: 'key', storage: indexedDBStorage });
```

**Migrations:**

```typescript
persist(storeCreator, {
  name: 'app-settings',
  version: 2,
  migrate: (persistedState, version) => {
    const state = persistedState as any;
    if (version < 2) {
      // v1 had 'darkMode: boolean', v2 uses 'theme: string'
      state.theme = state.darkMode ? 'dark' : 'light';
      delete state.darkMode;
    }
    return state;
  },
});
```

**What NOT to persist:** Loading states, error messages, transient UI state, data that should be fetched fresh from the server.

## Source

https://zustand.docs.pmnd.rs/middlewares/persist
