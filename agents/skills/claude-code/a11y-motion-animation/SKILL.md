# Motion and Animation Accessibility

> Implement animations that respect user motion preferences, avoid seizure triggers, and provide pause controls

## When to Use

- Adding animations, transitions, or motion effects to a UI
- Building auto-playing carousels, videos, or background animations
- Implementing page transitions in a SPA
- Using parallax scrolling or scroll-triggered animations
- Reviewing existing animations for accessibility compliance

## Instructions

1. **Respect `prefers-reduced-motion`.** Users who enable "Reduce motion" in their OS settings have vestibular disorders or motion sensitivity. Query this preference and eliminate or simplify animations.

```css
/* Default: full animations */
.card {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.card:hover {
  transform: scale(1.05);
}

/* Reduced motion: remove or simplify */
@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
  .card:hover {
    transform: none;
  }
}
```

2. **Use a motion-first or reduce-first strategy.** Choose one approach and apply it consistently:

```css
/* Approach A: motion-first (add animations, remove for reduced-motion) */
.element {
  animation: slide-in 0.5s ease;
}
@media (prefers-reduced-motion: reduce) {
  .element {
    animation: none;
  }
}

/* Approach B: reduce-first (no animations by default, add for no-preference) */
.element {
  animation: none;
}
@media (prefers-reduced-motion: no-preference) {
  .element {
    animation: slide-in 0.5s ease;
  }
}
```

Approach B is safer — users get no animation by default.

3. **In JavaScript, check the preference before triggering animations.**

```typescript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animateElement(element: HTMLElement) {
  if (prefersReducedMotion) {
    // Instant state change, no animation
    element.style.opacity = '1';
    return;
  }
  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-in' });
}
```

4. **In React, create a hook for motion preferences.**

```typescript
function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}

// Usage
function AnimatedCard() {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
    />
  );
}
```

5. **Provide pause, stop, or hide controls for auto-playing content.** Any content that moves, blinks, or auto-updates for more than 5 seconds must have user controls (WCAG 2.2.2).

```tsx
function AutoCarousel({ slides }: { slides: Slide[] }) {
  const [isPaused, setIsPaused] = useState(false);

  return (
    <div>
      <button
        onClick={() => setIsPaused(!isPaused)}
        aria-label={isPaused ? 'Play slideshow' : 'Pause slideshow'}
      >
        {isPaused ? <PlayIcon /> : <PauseIcon />}
      </button>
      <Carousel autoPlay={!isPaused} slides={slides} />
    </div>
  );
}
```

6. **Avoid flashing content.** Content that flashes more than 3 times per second can trigger seizures (WCAG 2.3.1 — Three Flashes). This is a hard constraint with no workaround.

7. **Avoid large-scale motion.** Parallax effects, zooming transitions, and full-page scroll animations are common vestibular triggers. When using these, always check `prefers-reduced-motion` and provide a static alternative.

8. **Keep essential animations short.** Transitions that communicate state changes (loading, success, error) should be under 500ms. Long, elaborate animations add cognitive load and frustrate users who interact frequently.

9. **Use `will-change` and GPU-composited properties for performance.** Janky animations that drop frames are worse than no animation. Stick to `transform` and `opacity` for smooth 60fps animations.

```css
.animated {
  will-change: transform, opacity;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}
```

## Details

**WCAG requirements:**

- **2.2.2 Pause, Stop, Hide:** Auto-playing content that lasts more than 5 seconds must have controls
- **2.3.1 Three Flashes:** No content flashes more than 3 times per second
- **2.3.3 Animation from Interactions (AAA):** Motion triggered by user interaction can be disabled

**What counts as "reduced motion":**

- Remove: parallax scrolling, auto-playing animations, bouncing/shaking effects, zoom transitions
- Keep: opacity fades (instant or very fast), color changes, layout reflows
- Simplify: Replace slide transitions with fade, replace bounce with ease

**Framer Motion integration:**

```tsx
<motion.div
  layout
  transition={{
    layout: { duration: prefersReduced ? 0 : 0.3 },
  }}
/>
```

**Common mistakes:**

- Checking `prefers-reduced-motion` once at load (user can change it at runtime — use `addEventListener`)
- Removing only CSS animations while JavaScript-driven animations still run
- Interpreting "reduced motion" as "no animation" (subtle fades and opacity changes are usually fine)
- Auto-playing video backgrounds without a pause button

## Source

https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions
