# Mobile Navigation Patterns

> Implement stack, tab, and drawer navigation in React Native with type-safe routing and deep linking

## When to Use

- Setting up navigation structure for a React Native app
- Adding tab bars, stack navigators, or drawer menus
- Implementing deep linking and universal links
- Adding type safety to navigation parameters
- Choosing between React Navigation and Expo Router

## Instructions

1. **Choose your navigation library.** Expo Router (file-based) for new Expo projects, React Navigation (imperative) for more control or bare RN projects.

**Expo Router approach (recommended for Expo):**

```
app/
  _layout.tsx          # Root layout with navigation container
  (tabs)/
    _layout.tsx        # Tab navigator
    index.tsx          # Home tab
    search.tsx         # Search tab
    profile.tsx        # Profile tab
  [userId].tsx         # Dynamic screen /userId
  settings/
    _layout.tsx        # Stack navigator for settings
    index.tsx          # Settings main
    notifications.tsx  # Notification settings
```

2. **Set up the root layout with Expo Router.**

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="[userId]" options={{ title: 'Profile' }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
    </Stack>
  );
}
```

3. **Set up tab navigation.**

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { HomeIcon, SearchIcon, ProfileIcon } from '@/components/icons';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#007AFF' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => <SearchIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <ProfileIcon color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
```

4. **Navigate between screens with typed links.**

```tsx
import { Link, useRouter } from 'expo-router';

// Declarative — renders an anchor/pressable
<Link href="/settings/notifications">Notification Settings</Link>
<Link href={{ pathname: '/[userId]', params: { userId: '123' } }}>View Profile</Link>

// Imperative — from event handlers
const router = useRouter();
router.push('/settings');
router.replace('/login');  // No back button
router.back();
```

5. **With React Navigation (non-Expo Router), define typed param lists.**

```typescript
// types/navigation.ts
export type RootStackParamList = {
  Home: undefined;
  Profile: { userId: string };
  Settings: undefined;
};

export type TabParamList = {
  Feed: undefined;
  Search: { query?: string };
  Account: undefined;
};
```

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

6. **Implement deep linking for external URLs and push notifications.**

```typescript
// app.config.ts
export default {
  scheme: 'myapp',
  // Universal links
  ios: { associatedDomains: ['applinks:example.com'] },
  android: {
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'example.com', pathPrefix: '/app' }],
      },
    ],
  },
};
```

7. **Handle authentication flows with navigation guards.**

```tsx
// app/_layout.tsx
import { useAuth } from '@/hooks/useAuth';
import { Redirect, Stack } from 'expo-router';

export default function RootLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <SplashScreen />;
  if (!isAuthenticated) return <Redirect href="/login" />;

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
```

8. **Use modal presentation for overlay screens.**

```tsx
<Stack.Screen name="create-post" options={{ presentation: 'modal', headerTitle: 'New Post' }} />
```

## Details

**Expo Router vs. React Navigation:** Expo Router is built on React Navigation and adds file-based routing, automatic deep linking, and typed routes. Use Expo Router for new Expo projects. Use React Navigation directly when you need programmatic navigator composition or are not using Expo.

**Navigation patterns by app type:**

- **Content app** (news, social): Tab bar + stack per tab
- **Utility app** (calculator, scanner): Single stack
- **E-commerce:** Tab bar (home, search, cart, account) + modal for product details
- **Settings-heavy:** Drawer for top-level sections + stack for drill-down

**Performance tips:**

- Use `lazy: true` on tabs to defer rendering until first visit
- Use `freezeOnBlur: true` to prevent re-renders on inactive screens
- Avoid passing large objects in navigation params — use IDs and fetch data on the screen

**Common mistakes:**

- Nesting too many navigators (tabs inside drawer inside stack creates confusion)
- Passing callback functions as navigation params (they are not serializable)
- Not handling the Android back button in custom navigators
- Forgetting to configure deep linking for all navigable screens

## Source

https://reactnavigation.org/

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
