# Mobile Performance Patterns

> Optimize React Native app performance with profiling, memoization, lazy loading, and native thread management

## When to Use

- App feels sluggish during scrolling, navigation, or data loading
- Startup time is too slow (> 2 seconds to interactive)
- Animations drop below 60fps
- Bundle size is too large (> 10MB)
- Identifying and fixing unnecessary re-renders

## Instructions

1. **Enable Hermes engine.** Hermes is the optimized JavaScript engine for React Native. It improves startup time, reduces memory usage, and compiles bytecode at build time. Expo enables Hermes by default since SDK 48.

```json
// app.json
{
  "expo": {
    "jsEngine": "hermes"
  }
}
```

2. **Minimize re-renders with `React.memo`, `useMemo`, and `useCallback`.**

```tsx
// Memoize components that receive the same props frequently
const ProductCard = memo(function ProductCard({ product }: { product: Product }) {
  return (
    <View>
      <Image source={{ uri: product.imageUrl }} style={styles.image} />
      <Text>{product.name}</Text>
      <Text>${product.price}</Text>
    </View>
  );
});

// Memoize expensive computations
function OrderList({ orders, filter }: Props) {
  const filteredOrders = useMemo(
    () => orders.filter((o) => o.status === filter).sort((a, b) => b.date - a.date),
    [orders, filter]
  );

  // Stable callback reference for child components
  const handlePress = useCallback(
    (orderId: string) => {
      navigation.navigate('OrderDetail', { orderId });
    },
    [navigation]
  );

  return <FlatList data={filteredOrders} renderItem={/* ... */} />;
}
```

3. **Use `useCallback` for FlatList `renderItem` and `keyExtractor`.**

```tsx
const renderItem = useCallback(
  ({ item }: { item: Order }) => <OrderCard order={item} onPress={handlePress} />,
  [handlePress]
);

const keyExtractor = useCallback((item: Order) => item.id, []);

<FlatList data={orders} renderItem={renderItem} keyExtractor={keyExtractor} />;
```

4. **Lazy-load screens and heavy components.**

```tsx
import { lazy, Suspense } from 'react';

const HeavyChart = lazy(() => import('./components/HeavyChart'));

function Dashboard() {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <HeavyChart data={chartData} />
    </Suspense>
  );
}
```

5. **Optimize images.** Images are often the largest performance bottleneck.

```tsx
import { Image } from 'expo-image';

// expo-image provides caching, blurhash placeholders, and memory management
<Image
  source={{ uri: product.imageUrl }}
  placeholder={{ blurhash: product.blurhash }}
  contentFit="cover"
  transition={200}
  style={styles.image}
  recyclingKey={product.id}
/>;
```

- Use appropriate image sizes (do not load 4K images for thumbnails)
- Use WebP format for smaller file sizes
- Use `expo-image` instead of React Native's `Image` for better caching

6. **Profile with React DevTools and Flipper.**

```bash
# Enable the React DevTools profiler
npx react-devtools
```

- Open the Profiler tab to see which components re-render and why
- Look for components that re-render when their props have not changed
- Check for slow renders (> 16ms per frame for 60fps)

7. **Reduce bundle size with tree shaking and lazy imports.**

```typescript
// Bad — imports the entire library
import { format, parse, addDays, subDays, isAfter } from 'date-fns';

// Good — import only what you need (tree-shakeable)
import format from 'date-fns/format';
import addDays from 'date-fns/addDays';

// Check bundle size
npx expo-doctor --check-dependencies
```

8. **Optimize startup time.**
   - Defer non-critical initialization (analytics, crash reporting) until after first render
   - Use `expo-splash-screen` to keep the splash visible until critical data loads
   - Minimize synchronous storage reads during startup
   - Pre-load fonts and critical assets with `expo-font` and `expo-asset`

```typescript
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      await loadFonts();
      await loadCriticalData();
      setReady(true);
    }
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (ready) await SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return <View onLayout={onLayoutRootView}>{/* app content */}</View>;
}
```

9. **Avoid bridge traffic for animations.** Use Reanimated (UI thread) instead of `Animated` (JS thread). Use `useAnimatedStyle` instead of `style` objects that depend on animated values.

10. **Monitor performance in production** with tools like Sentry Performance or custom metrics.

## Details

**React Native threading model:** React Native has three threads — the JS thread (runs your React code), the UI/Main thread (renders native views), and the Shadow thread (calculates layout with Yoga). Performance problems usually fall into: JS thread overload (expensive re-renders), bridge congestion (too much data crossing), or main thread blocking (synchronous native calls).

**Common re-render causes:**

- Parent component re-renders (wrap children in `memo`)
- New object/array references in props (use `useMemo`)
- New function references in props (use `useCallback`)
- Context value changes (split contexts by update frequency)

**Memory management:**

- Large image caches can cause OOM — set cache limits
- Unmounted components that still hold subscriptions — clean up in `useEffect` return
- Large lists without virtualization — always use FlatList or FlashList

**New Architecture (Fabric + TurboModules):** The new architecture removes the bridge, enabling synchronous communication between JS and native. It improves performance for interop-heavy operations. Available in Expo SDK 51+.

## Source

https://reactnative.dev/docs/performance

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
