# Svelte Transitions and Animations

> Add enter/exit animations, list reordering motion, and spring physics to Svelte elements using built-in and custom transitions

## When to Use

- You need elements to animate in/out when they enter or leave the DOM based on conditional rendering
- You want to animate list reordering when items move within an `{#each}` block
- You need smooth value transitions (progress bars, counters) using tweened or spring stores
- You are building custom animation functions for reusable transition effects

## Instructions

**Built-in transitions:**

1. Import and apply transitions from `svelte/transition`. They run when the element is conditionally rendered:

```svelte
<script>
  import { fade, fly, slide, scale, blur } from 'svelte/transition'
  let show = $state(true)
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div transition:fade>Fades in and out</div>
  <div transition:fly={{ y: 20, duration: 300 }}>Flies from below</div>
  <div transition:slide>Slides open/closed</div>
{/if}
```

2. Use `in:` and `out:` directives to apply different transitions for enter and exit:

```svelte
{#if show}
  <div in:fly={{ x: -100 }} out:fade>
    Flies in from left, fades out
  </div>
{/if}
```

3. Pass parameters to customize built-in transitions:

```svelte
<div transition:fly={{ x: 0, y: 50, duration: 400, easing: quintOut }}>
  Parameterized fly
</div>
```

Import easing functions from `svelte/easing`: `linear`, `cubicIn`, `cubicOut`, `cubicInOut`, `quintOut`, `elasticOut`, `backOut`, etc.

**Custom transitions:**

4. Write a custom transition function that returns CSS keyframes or a tick function:

```typescript
// CSS-based custom transition (most performant)
function swoosh(node: Element, { duration = 300 } = {}) {
  return {
    duration,
    css: (t: number) => `
      transform: translateX(${(1 - t) * 100}%) rotate(${(1 - t) * 45}deg);
      opacity: ${t};
    `,
  };
}
```

```typescript
// JS-based tick function (for canvas or non-CSS animations)
function typewriter(node: Element, { speed = 40 } = {}) {
  const text = node.textContent ?? '';
  return {
    duration: text.length * speed,
    tick: (t: number) => {
      node.textContent = text.slice(0, Math.floor(t * text.length));
    },
  };
}
```

**Animating list items with animate:flip:**

5. Use `animate:flip` to smoothly reorder elements in `{#each}` blocks when items move:

```svelte
<script>
  import { flip } from 'svelte/animate'
  import { fade } from 'svelte/transition'

  let items = $state(['A', 'B', 'C', 'D'])

  function shuffle() {
    items = [...items].sort(() => Math.random() - 0.5)
  }
</script>

<button onclick={shuffle}>Shuffle</button>

{#each items as item (item)}
  <div animate:flip={{ duration: 300 }} transition:fade>
    {item}
  </div>
{/each}
```

Note: `(item)` — the key expression — is required for `animate:flip` to track element identity.

**Tweened and spring stores for smooth value transitions:**

6. Use `tweened` for smooth numeric value interpolation (progress bars, counters):

```svelte
<script>
  import { tweened } from 'svelte/motion'
  import { cubicOut } from 'svelte/easing'

  const progress = tweened(0, { duration: 500, easing: cubicOut })

  function complete() { progress.set(1) }
</script>

<progress value={$progress} />
<button onclick={complete}>Complete</button>
```

7. Use `spring` for physics-based motion that overshoots and settles:

```svelte
<script>
  import { spring } from 'svelte/motion'

  const pos = spring({ x: 0, y: 0 }, { stiffness: 0.1, damping: 0.25 })
</script>

<div
  style="transform: translate({$pos.x}px, {$pos.y}px)"
  onmousemove={(e) => pos.set({ x: e.clientX, y: e.clientY })}
/>
```

**Deferred transitions (crossfade):**

8. Use `crossfade` to animate an element from one position to another across the DOM (shared element transition):

```svelte
<script>
  import { crossfade } from 'svelte/transition'
  const [send, receive] = crossfade({ duration: 400 })
</script>

{#if inList}
  <div in:receive={{ key: item.id }} out:send={{ key: item.id }}>
    {item.name}
  </div>
{:else}
  <div in:receive={{ key: item.id }} out:send={{ key: item.id }}>
    {item.name}
  </div>
{/if}
```

## Details

**How transitions work:**

Svelte compiles `transition:`, `in:`, and `out:` directives into JavaScript that runs when the element is added to or removed from the DOM. CSS-based transitions run entirely on the compositor thread and do not block the main thread.

**`global` modifier:**

By default, transitions only run when the direct parent `{#if}` changes. Add `:global` to run the transition when any ancestor condition changes:

```svelte
{#if outerCondition}
  {#if innerCondition}
    <div transition:fade|global>
      Fades when either condition changes
    </div>
  {/if}
{/if}
```

**Transition events:**

Listen to transition lifecycle events:

```svelte
<div
  transition:fly
  onintrostart={() => console.log('entering')}
  onintroend={() => console.log('entered')}
  onoutrostart={() => console.log('leaving')}
  onoutroend={() => console.log('left')}
/>
```

**Performance considerations:**

- Prefer CSS-based custom transitions (return `css`) over JS tick functions — CSS runs off the main thread
- Avoid animating `width`/`height` — use `transform: scaleX()` and `transform: scaleY()` instead
- `slide` animates height and may cause layout thrash on complex elements; prefer `scale` or custom transitions for performance-sensitive cases

## Source

https://svelte.dev/docs/svelte/transition
