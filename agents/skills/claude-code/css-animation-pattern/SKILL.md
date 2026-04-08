# CSS Animation Pattern

> Create performant CSS animations with Tailwind transitions, keyframe utilities, and motion-safe considerations

## When to Use

- Adding hover/focus transitions to interactive elements
- Animating element entrance (fade in, slide up)
- Building loading spinners and skeleton screens
- Creating micro-interactions that improve UX

## Instructions

1. Use `transition-*` utilities for property transitions (hover, focus, state changes).
2. Use `animate-*` utilities for keyframe animations (continuous motion, entrance effects).
3. Only animate `transform` and `opacity` for 60fps performance — avoid animating `width`, `height`, `margin`, or `top`.
4. Respect user preferences: use `motion-safe:` prefix so animations only play when the user has not enabled "reduce motion".
5. Keep animations short (150-300ms for transitions, 500-1000ms for entrances).
6. Define custom keyframes in `tailwind.config.ts` for project-specific animations.

```tsx
// Transitions — state-based property changes
function Button({ children }: { children: React.ReactNode }) {
  return (
    <button className="
      bg-blue-600 text-white px-4 py-2 rounded-md
      transition-all duration-200 ease-in-out
      hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5
      active:translate-y-0 active:shadow-md
      focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
    ">
      {children}
    </button>
  );
}

// Entrance animation with motion-safe
function FadeIn({ children }: { children: React.ReactNode }) {
  return (
    <div className="motion-safe:animate-fade-in motion-reduce:opacity-100">
      {children}
    </div>
  );
}

// Built-in Tailwind animations
<div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
<div className="animate-pulse bg-gray-200 h-4 rounded" />
<div className="animate-bounce text-2xl">👇</div>
```

```typescript
// tailwind.config.ts — custom animations
const config: Config = {
  theme: {
    extend: {
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
      },
    },
  },
};
```

## Details

**Performance-safe properties:** The browser can animate `transform` and `opacity` on the GPU (compositor layer) without triggering layout recalculation. Animating other properties causes reflow:

| Safe (GPU)                             | Unsafe (reflow)                  |
| -------------------------------------- | -------------------------------- |
| `transform` (translate, scale, rotate) | `width`, `height`                |
| `opacity`                              | `margin`, `padding`              |
| `filter`                               | `top`, `left`, `right`, `bottom` |
|                                        | `border-width`, `font-size`      |

**Transition utilities:**

- `transition` — all properties (color, background, border, shadow, transform, opacity)
- `transition-colors` — only color-related properties
- `transition-transform` — only transform
- `transition-opacity` — only opacity
- `duration-*` — 75, 100, 150, 200, 300, 500, 700, 1000
- `ease-*` — linear, in, out, in-out

**Motion accessibility:** Always use `motion-safe:` for decorative animations. Users with vestibular disorders can enable "reduce motion" in their OS settings:

```tsx
<div className="motion-safe:animate-fade-in motion-reduce:opacity-100">
  Content appears instantly for motion-sensitive users
</div>
```

**Staggered animations** (with custom properties):

```tsx
{
  items.map((item, i) => (
    <div
      key={item.id}
      className="motion-safe:animate-fade-in"
      style={{ animationDelay: `${i * 100}ms` }}
    >
      {item.name}
    </div>
  ));
}
```

## Source

https://tailwindcss.com/docs/animation
