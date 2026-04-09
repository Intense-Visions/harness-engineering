# Event Loop

> Understand the browser and Node.js event loop processing model — task queues, microtask queue, rendering steps, and task prioritization — to write code that cooperates with the rendering pipeline instead of blocking it.

## When to Use

- You need to understand the execution order of `setTimeout`, `Promise.then`, `queueMicrotask`, and `requestAnimationFrame`
- A recursive microtask chain freezes the page because microtasks drain completely before rendering
- `setTimeout(fn, 0)` does not fire immediately and you need to understand why (4ms clamp)
- You are choosing between `setTimeout`, `requestAnimationFrame`, `requestIdleCallback`, or `scheduler.postTask` for scheduling work
- Animations stutter because non-visual work competes with `requestAnimationFrame` callbacks
- You need to understand why a `Promise.resolve().then()` callback runs before the browser paints
- Node.js code behaves differently from browser code regarding microtask and I/O ordering
- `MutationObserver` callbacks fire at unexpected times relative to rendering
- You are implementing cooperative yielding and need to choose the right scheduling primitive
- `setInterval` drift causes visual inconsistencies in animations

## Instructions

1. **Understand the event loop processing model.** Each iteration of the event loop follows this sequence:
   1. Pick one task from the task queue (oldest task from the highest-priority queue)
   2. Execute the task to completion
   3. Drain the microtask queue — execute all microtasks, including microtasks queued by microtasks
   4. If it is time to render (typically every ~16.67ms at 60Hz):
      a. Run `requestAnimationFrame` callbacks
      b. Recalculate styles
      c. Layout
      d. Paint
   5. If idle, run `requestIdleCallback` callbacks

2. **Know what creates tasks vs microtasks:**

   **Tasks (macrotasks):**
   - `setTimeout` / `setInterval`
   - DOM event handlers (click, input, load)
   - `MessageChannel.port.postMessage()`
   - `fetch` completion callbacks (not the Promise, but the network callback)
   - I/O callbacks (Node.js)

   **Microtasks:**
   - `Promise.then` / `catch` / `finally`
   - `queueMicrotask(fn)`
   - `MutationObserver` callbacks
   - `async`/`await` continuations

3. **Use the right scheduling primitive for each job:**

   ```javascript
   // Visual update — runs before next paint
   requestAnimationFrame(() => {
     element.style.transform = `translateX(${x}px)`;
   });

   // Non-urgent work — runs when browser is idle
   requestIdleCallback((deadline) => {
     while (deadline.timeRemaining() > 5 && tasks.length > 0) {
       processTask(tasks.shift());
     }
   });

   // Yield to browser for input processing — high-priority reschedule
   await scheduler.yield();

   // Background priority work — low priority
   scheduler.postTask(() => analytics.flush(), { priority: 'background' });

   // Immediate microtask — runs before any rendering
   queueMicrotask(() => cleanupState());
   ```

4. **Never create infinite microtask loops.** Microtasks drain completely before the browser can render or process input. A recursive microtask chain blocks rendering indefinitely:

   ```javascript
   // CATASTROPHIC — freezes the browser, no rendering ever occurs
   function processNextItem() {
     if (items.length > 0) {
       processItem(items.shift());
       queueMicrotask(processNextItem); // queues another microtask before render
     }
   }

   // FIXED — yields to the event loop between items
   function processNextItem() {
     if (items.length > 0) {
       processItem(items.shift());
       setTimeout(processNextItem, 0); // schedules a task, allowing render between items
     }
   }
   ```

5. **Understand `setTimeout(fn, 0)` clamping.** Browsers clamp `setTimeout` to a minimum of 4ms after 5 nested calls. This means `setTimeout(fn, 0)` is not truly zero-delay:

   ```javascript
   // First 4 calls: ~0ms delay
   // After 5th nesting: minimum 4ms delay
   // For yielding: use scheduler.yield() or MessageChannel instead
   const channel = new MessageChannel();
   channel.port1.onmessage = () => resumeWork();
   channel.port2.postMessage(null); // fires before setTimeout, no 4ms clamp
   ```

## Details

### The Rendering Pipeline in the Event Loop

The browser does not render after every task. It renders at the display's refresh rate (typically 60Hz = every 16.67ms). Between renders, multiple tasks and microtask drains can occur. The rendering steps are:

1. Run `requestAnimationFrame` callbacks (in order of registration)
2. Recalculate styles (run style invalidation)
3. Layout
4. Paint (create paint records)
5. Composite (send layers to GPU)

If all rAF callbacks and rendering complete in under 16.67ms, the frame is on time. If they exceed 16.67ms, the frame is late and the user sees jank.

### Worked Example: Recursive Microtask Rendering Starvation

A data processing module used `queueMicrotask` to process items "asynchronously" without blocking the current task. With 10,000 items, each microtask processed one item and queued the next:

```javascript
// BROKEN — 10,000 microtasks drain without rendering
function processChunk() {
  if (queue.length > 0) {
    process(queue.shift());
    queueMicrotask(processChunk); // never yields to render
  }
}
```

The browser froze for 2 seconds (10,000 items \* 0.2ms each). No frames were painted because microtasks drain completely before rendering. Fix: replace `queueMicrotask` with `setTimeout(fn, 0)` or `scheduler.yield()` to yield to the event loop between chunks.

### Worked Example: React useEffect Microtask Timing

A React component's `useEffect` cleanup ran as a microtask (in React 18's concurrent mode). The effect modified the DOM, and the cleanup restored it. Because the cleanup ran as a microtask before paint, this sequence occurred:

1. Effect fires: sets `element.textContent = 'Loading...'`
2. Component re-renders, queuing cleanup as microtask
3. Cleanup fires (microtask): sets `element.textContent = 'Done'`
4. Browser paints: user only sees 'Done', never sees 'Loading...'

The developer expected the user to see the loading state. The fix: use `setTimeout` in the effect to ensure the DOM update renders before the next operation.

### Browser vs Node.js Event Loop

The browser event loop has rendering steps integrated. The Node.js event loop has phases:

1. **Timers** — `setTimeout`, `setInterval` callbacks
2. **Pending callbacks** — deferred I/O callbacks
3. **Poll** — retrieve new I/O events, execute I/O callbacks
4. **Check** — `setImmediate` callbacks
5. **Close callbacks** — `socket.on('close')`

Key difference: Node.js has `process.nextTick()` which runs before any other microtask in the microtask queue. In the browser, `queueMicrotask` and `Promise.then` are equivalent in priority.

### Task Prioritization (Scheduler API)

The Scheduler API provides three priority levels:

- `user-blocking` — interaction responses, should run within the current frame
- `user-visible` — updates the user will notice (default)
- `background` — analytics, prefetch, non-urgent work

```javascript
await scheduler.postTask(() => updateUI(), { priority: 'user-blocking' });
await scheduler.postTask(() => prefetchData(), { priority: 'background' });
```

### Anti-Patterns

**Using `Promise.resolve().then()` for deferral when you mean `setTimeout(fn, 0)`.** Microtasks run before rendering. If you want to defer work until after the browser paints, use `setTimeout` or `requestAnimationFrame` + `setTimeout` (double-rAF pattern). A Promise-based deferral runs immediately in the microtask checkpoint, before any rendering.

**Infinite microtask loops.** Any recursive pattern using `Promise.then` or `queueMicrotask` that does not eventually yield creates an infinite microtask loop. The browser cannot render, process input, or run timers until the microtask queue is empty.

**Assuming `setTimeout(fn, 0)` fires immediately.** After 5 nested `setTimeout` calls, the minimum delay is clamped to 4ms in browsers. For time-sensitive yielding, use `MessageChannel` or `scheduler.yield()` which do not have this clamp.

**Using `setInterval` for animations instead of `requestAnimationFrame`.** `setInterval` fires at fixed wall-clock intervals regardless of the display refresh rate. It can fire between frames (wasted work) or multiple times in one frame (duplicate work). `requestAnimationFrame` fires exactly once per frame, synchronized with the display.

**Blocking the event loop with synchronous I/O in Node.js.** `fs.readFileSync`, `crypto.pbkdf2Sync`, and other sync APIs block the entire event loop. All pending I/O, timers, and HTTP requests are stalled. Use async equivalents.

## Source

- HTML Living Standard, Section 8.1.7: Event loop processing model — https://html.spec.whatwg.org/multipage/webappapis.html#event-loops
- Jake Archibald, "In The Loop" (JSConf 2018) — https://www.youtube.com/watch?v=cCOL7MC4Pl0
- Node.js Event Loop documentation — https://nodejs.org/en/guides/event-loop-timers-and-nexttick
- Scheduler API specification — https://wicg.github.io/scheduling-apis/

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
- The correct scheduling primitive is chosen for each type of work (visual, idle, yielding, background).
- No microtask-based rendering starvation occurs in the application.
