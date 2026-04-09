# Mobile Animation Patterns

> Create fluid 60fps animations with React Native Reanimated using shared values, worklets, and layout animations

## When to Use

- Building micro-interactions (button press feedback, toggle animations)
- Animating screen transitions, modals, or bottom sheets
- Creating gesture-driven animations (swipe cards, draggable elements)
- Implementing layout animations (list item enters/exits, accordion expand)
- Replacing `Animated` API for better performance

## Instructions

1. **Use Reanimated's shared values instead of React state for animation values.** Shared values live on the UI thread and update without crossing the JS bridge.

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

function AnimatedBox() {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPressIn={() => {
        scale.value = withSpring(0.95);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
    >
      <Animated.View style={[styles.box, animatedStyle]} />
    </Pressable>
  );
}
```

2. **Choose the right animation function:**
   - `withTiming(target, config)` — linear or eased animation with fixed duration
   - `withSpring(target, config)` — physics-based spring animation (natural feel)
   - `withDecay(config)` — momentum-based deceleration (fling gestures)
   - `withSequence(...)` — run animations in order
   - `withDelay(ms, animation)` — delay before starting
   - `withRepeat(animation, count, reverse)` — loop an animation

```tsx
// Bounce in
opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });

// Springy scale
scale.value = withSpring(1, { damping: 15, stiffness: 150 });

// Shake effect
translateX.value = withSequence(
  withTiming(-10, { duration: 50 }),
  withRepeat(withTiming(10, { duration: 100 }), 3, true),
  withTiming(0, { duration: 50 })
);

// Pulse animation
opacity.value = withRepeat(
  withSequence(withTiming(0.5, { duration: 500 }), withTiming(1, { duration: 500 })),
  -1, // infinite
  true
);
```

3. **Use `useAnimatedStyle` to map shared values to styles.** This hook creates a style object that updates on the UI thread.

```tsx
const animatedStyle = useAnimatedStyle(() => ({
  opacity: opacity.value,
  transform: [
    { translateY: interpolate(progress.value, [0, 1], [50, 0]) },
    { scale: interpolate(progress.value, [0, 1], [0.8, 1]) },
  ],
}));
```

4. **Use `interpolate` to map values between ranges.**

```tsx
import { interpolate, Extrapolation } from 'react-native-reanimated';

const animatedStyle = useAnimatedStyle(() => ({
  opacity: interpolate(scrollY.value, [0, 100], [1, 0], Extrapolation.CLAMP),
  height: interpolate(scrollY.value, [0, 100], [200, 60], Extrapolation.CLAMP),
}));
```

5. **Use layout animations for enter/exit transitions.** Reanimated provides built-in entering and exiting animations that work with conditional rendering.

```tsx
import Animated, { FadeIn, FadeOut, SlideInRight, Layout } from 'react-native-reanimated';

function NotificationList({ items }: { items: Notification[] }) {
  return (
    <View>
      {items.map((item) => (
        <Animated.View
          key={item.id}
          entering={SlideInRight.duration(300)}
          exiting={FadeOut.duration(200)}
          layout={Layout.springify()}
        >
          <NotificationCard notification={item} />
        </Animated.View>
      ))}
    </View>
  );
}
```

6. **Use `useAnimatedScrollHandler` for scroll-driven animations.**

```tsx
const scrollY = useSharedValue(0);

const scrollHandler = useAnimatedScrollHandler({
  onScroll: (event) => {
    scrollY.value = event.contentOffset.y;
  },
});

const headerStyle = useAnimatedStyle(() => ({
  height: interpolate(scrollY.value, [0, 150], [200, 60], Extrapolation.CLAMP),
  opacity: interpolate(scrollY.value, [0, 100], [1, 0], Extrapolation.CLAMP),
}));

return (
  <>
    <Animated.View style={[styles.header, headerStyle]} />
    <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16}>
      {/* content */}
    </Animated.ScrollView>
  </>
);
```

7. **Use `useDerivedValue` to compute values from other shared values.**

```tsx
const progress = useSharedValue(0);
const opacity = useDerivedValue(() => interpolate(progress.value, [0, 1], [0.3, 1]));
```

8. **Run callbacks when animations complete with `withTiming` callback or `runOnJS`.**

```tsx
scale.value = withSpring(0, {}, (finished) => {
  if (finished) {
    runOnJS(onAnimationComplete)();
  }
});
```

## Details

**Why Reanimated over the built-in `Animated` API:** The built-in `Animated` runs on the JS thread by default (`useNativeDriver: true` offloads only `transform` and `opacity`). Reanimated runs all animation logic on the UI thread via worklets, supporting any style property at 60fps.

**Worklets:** Functions marked with `'worklet';` directive run on the UI thread. `useAnimatedStyle`, `useAnimatedScrollHandler`, and gesture callbacks are implicitly worklets. Use `runOnJS()` to call back to JavaScript from a worklet.

**Spring configuration:**

- `damping` (default 10): Higher = less bouncy, lower = more oscillation
- `stiffness` (default 100): Higher = faster, snappier animation
- `mass` (default 1): Higher = heavier, slower to start/stop
- Good defaults for UI: `{ damping: 15, stiffness: 150 }` (snappy with slight overshoot)

**Performance rules:**

- Never read `.value` of a shared value in the render function (only in worklets and animated styles)
- Avoid creating new shared values in loops or conditional blocks
- Use `cancelAnimation(sharedValue)` before starting a new animation on the same value
- Prefer `transform` and `opacity` — they are GPU-composited and avoid layout recalculation

## Source

https://docs.swmansion.com/react-native-reanimated/

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
