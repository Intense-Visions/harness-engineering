# Gesture Handling

> Implement touch gestures with React Native Gesture Handler for swipe, pan, pinch, and long press interactions

## When to Use

- Adding swipe-to-delete or swipe-to-reveal actions
- Building draggable cards, bottom sheets, or reorderable lists
- Implementing pinch-to-zoom on images or maps
- Creating custom navigation gestures (swipe back, pull to refresh)
- Handling simultaneous and competing gesture recognition

## Instructions

1. **Use React Native Gesture Handler v2 (RNGH) with the declarative API.** The v2 API uses `Gesture` objects composed with `GestureDetector`, replacing the old component-based API.

```bash
npx expo install react-native-gesture-handler react-native-reanimated
```

Wrap your app root with `GestureHandlerRootView`:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Navigation />
    </GestureHandlerRootView>
  );
}
```

2. **Create a pan gesture for draggable elements.**

```tsx
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

function DraggableCard() {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateX.value = savedX.value + event.translationX;
      translateY.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <Text>Drag me</Text>
      </Animated.View>
    </GestureDetector>
  );
}
```

3. **Implement swipe-to-delete with a horizontal pan gesture.**

```tsx
function SwipeableRow({ onDelete, children }: Props) {
  const translateX = useSharedValue(0);
  const DELETE_THRESHOLD = -100;

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10]) // Activate only for horizontal movement
    .onUpdate((e) => {
      translateX.value = Math.min(0, e.translationX); // Only swipe left
    })
    .onEnd(() => {
      if (translateX.value < DELETE_THRESHOLD) {
        translateX.value = withTiming(-300, {}, () => {
          runOnJS(onDelete)();
        });
      } else {
        translateX.value = withSpring(0);
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
}
```

4. **Implement pinch-to-zoom.**

```tsx
function ZoomableImage({ source }: { source: ImageSourcePropType }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={pinch}>
      <Animated.Image source={source} style={[styles.image, style]} />
    </GestureDetector>
  );
}
```

5. **Compose multiple gestures.** Use `Gesture.Simultaneous()` for gestures that should work together (pan + pinch) and `Gesture.Exclusive()` for competing gestures (tap vs. long press).

```tsx
const pan = Gesture.Pan().onUpdate(/* ... */);
const pinch = Gesture.Pinch().onUpdate(/* ... */);

// Both gestures active at the same time
const combined = Gesture.Simultaneous(pan, pinch);

// Only one gesture wins
const tap = Gesture.Tap().onEnd(handleTap);
const longPress = Gesture.LongPress().minDuration(500).onEnd(handleLongPress);
const exclusive = Gesture.Exclusive(longPress, tap); // Long press takes priority

return <GestureDetector gesture={combined}>{/* ... */}</GestureDetector>;
```

6. **Use `runOnJS` to call JavaScript functions from gesture worklets.** Gesture callbacks run on the UI thread. To call React state setters or navigation, wrap them with `runOnJS`.

```tsx
const tap = Gesture.Tap().onEnd(() => {
  runOnJS(navigation.navigate)('Details');
});
```

7. **Set activation constraints to prevent accidental activation.**

```tsx
const pan = Gesture.Pan()
  .minDistance(10) // Minimum pixels before activation
  .activeOffsetX([-20, 20]) // Only activate for horizontal movement
  .failOffsetY([-5, 5]); // Fail if vertical movement exceeds threshold
```

## Details

**RNGH v2 vs. v1:** The v2 declarative API (`Gesture.Pan()`) replaces v1's component API (`<PanGestureHandler>`). v2 is composable, works directly with Reanimated worklets, and supports gesture composition natively.

**UI thread execution:** RNGH gesture callbacks and Reanimated worklets run on the native UI thread, not the JavaScript thread. This means gestures remain responsive even if JavaScript is busy. Always use shared values (`useSharedValue`) instead of React state for gesture-driven animations.

**Gesture states:** Each gesture transitions through states: UNDETERMINED -> BEGAN -> ACTIVE -> END (or FAILED/CANCELLED). Use `onStart` (BEGAN), `onUpdate` (ACTIVE), and `onEnd` (END) to respond at each phase.

**Common mistakes:**

- Forgetting `GestureHandlerRootView` at the app root (gestures silently fail)
- Using React state instead of shared values in gesture callbacks (drops frames)
- Not setting activation offsets (pan interferes with scroll)
- Calling JavaScript functions directly in worklets without `runOnJS`

## Source

https://docs.swmansion.com/react-native-gesture-handler/

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
