# Mobile Storage Patterns

> Persist data on mobile with AsyncStorage, SecureStore, MMKV, and SQLite for different use cases

## When to Use

- Storing user preferences, settings, or onboarding state
- Caching API responses for offline access
- Persisting authentication tokens securely
- Storing structured relational data locally
- Choosing the right storage solution for your data type

## Instructions

1. **Choose the right storage for your data type:**

| Solution          | Best For                                       | Capacity      | Speed     | Security            |
| ----------------- | ---------------------------------------------- | ------------- | --------- | ------------------- |
| AsyncStorage      | Simple key-value (settings, flags)             | ~6MB          | Moderate  | None                |
| expo-secure-store | Tokens, passwords, API keys                    | ~2KB per item | Moderate  | Keychain/Keystore   |
| MMKV              | High-frequency reads/writes, state persistence | ~unlimited    | Very fast | Optional encryption |
| SQLite            | Structured relational data, complex queries    | ~unlimited    | Fast      | None (file-level)   |

2. **Use AsyncStorage for simple preferences and flags.**

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

// Store
await AsyncStorage.setItem('onboarding_complete', 'true');
await AsyncStorage.setItem('user_preferences', JSON.stringify({ theme: 'dark', locale: 'en' }));

// Retrieve
const isComplete = await AsyncStorage.getItem('onboarding_complete');
const prefs = JSON.parse((await AsyncStorage.getItem('user_preferences')) ?? '{}');

// Remove
await AsyncStorage.removeItem('onboarding_complete');

// Multi operations
await AsyncStorage.multiSet([
  ['key1', 'value1'],
  ['key2', 'value2'],
]);
```

3. **Use SecureStore for sensitive credentials.** Values are encrypted using iOS Keychain or Android Keystore.

```typescript
import * as SecureStore from 'expo-secure-store';

// Store securely
await SecureStore.setItemAsync('auth_token', token);
await SecureStore.setItemAsync('refresh_token', refreshToken);

// Retrieve
const token = await SecureStore.getItemAsync('auth_token');

// Delete
await SecureStore.deleteItemAsync('auth_token');

// With options
await SecureStore.setItemAsync('biometric_key', value, {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true, // Requires biometric to read
});
```

4. **Use MMKV for high-performance key-value storage.** MMKV is ~30x faster than AsyncStorage and supports synchronous access.

```bash
npx expo install react-native-mmkv
```

```typescript
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

// Synchronous — no await needed
storage.set('user.id', '12345');
storage.set('user.premium', true);
storage.set('last_sync', Date.now());

const userId = storage.getString('user.id');
const isPremium = storage.getBoolean('user.premium');

storage.delete('user.id');

// With encryption
const secureStorage = new MMKV({
  id: 'secure-storage',
  encryptionKey: 'your-encryption-key',
});
```

5. **Integrate MMKV with Zustand for persisted state management.**

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

const mmkvStorage = {
  getItem: (name: string) => storage.getString(name) ?? null,
  setItem: (name: string, value: string) => storage.set(name, value),
  removeItem: (name: string) => storage.delete(name),
};

const useSettingsStore = create(
  persist(
    (set) => ({
      theme: 'light' as 'light' | 'dark',
      setTheme: (theme: 'light' | 'dark') => set({ theme }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
```

6. **Use SQLite for structured relational data.**

```bash
npx expo install expo-sqlite
```

```typescript
import * as SQLite from 'expo-sqlite';

const db = await SQLite.openDatabaseAsync('app.db');

// Create tables
await db.execAsync(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Insert
await db.runAsync('INSERT INTO orders (id, customer_name, total) VALUES (?, ?, ?)', [
  orderId,
  customerName,
  total,
]);

// Query
const orders = await db.getAllAsync<Order>(
  'SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?',
  ['pending', 20]
);

// Single row
const order = await db.getFirstAsync<Order>('SELECT * FROM orders WHERE id = ?', [orderId]);
```

7. **Implement a cache layer for API responses.**

```typescript
class ApiCache {
  private storage = new MMKV({ id: 'api-cache' });

  async get<T>(key: string, maxAge: number): Promise<T | null> {
    const cached = this.storage.getString(key);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > maxAge) {
      this.storage.delete(key);
      return null;
    }
    return data as T;
  }

  set<T>(key: string, data: T): void {
    this.storage.set(key, JSON.stringify({ data, timestamp: Date.now() }));
  }
}
```

8. **Clean up storage on logout.** Clear user-specific data but retain app-level preferences.

```typescript
async function clearUserData() {
  await SecureStore.deleteItemAsync('auth_token');
  await SecureStore.deleteItemAsync('refresh_token');
  storage.delete('user.id');
  storage.delete('user.premium');
  // Keep: theme, locale, onboarding_complete
}
```

## Details

**AsyncStorage limitations:** AsyncStorage is asynchronous, unencrypted, and has platform-specific size limits (~6MB on Android by default). It serializes to JSON, so large datasets are slow. Use it only for small, non-sensitive data.

**SecureStore limitations:** Individual values are limited to ~2KB. It is async and not suitable for high-frequency reads. Use only for authentication tokens, API keys, and sensitive credentials.

**MMKV advantages:** Memory-mapped I/O, synchronous API, ~30x faster than AsyncStorage, supports encryption, and has no practical size limit. It is the recommended replacement for AsyncStorage in performance-sensitive apps.

**SQLite considerations:** Use for data with relationships (users, orders, products), offline-first apps that need complex queries, or datasets too large for key-value storage. Consider using a migration library for schema changes.

**Common mistakes:**

- Storing auth tokens in AsyncStorage (unencrypted, accessible to other apps on rooted devices)
- Storing large JSON blobs in key-value storage (use SQLite for structured data)
- Not handling storage errors (device may be full)
- Synchronous MMKV reads blocking the UI thread with very large values

## Source

https://docs.expo.dev/versions/latest/sdk/async-storage/

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
