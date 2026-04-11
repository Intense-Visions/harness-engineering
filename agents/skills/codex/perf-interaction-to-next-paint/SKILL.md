# Interaction to Next Paint (INP)

> Measure and optimize INP — the worst-case interaction latency across the entire page session — by decomposing each interaction into input delay, processing time, and presentation delay, then targeting each phase with yielding, scheduling, and rendering strategies.

## When to Use

- CrUX or RUM data reports INP exceeding 200ms at the 75th percentile
- Users report the UI feels "sluggish" or "unresponsive" when clicking, tapping, or typing
- DevTools Performance panel shows long tasks overlapping with user interactions
- Click or keypress event handlers execute heavy synchronous work on the main thread
- You are migrating from FID (First Input Delay) to INP and need to understand the differences
- `scheduler.yield()` or `scheduler.postTask()` could break up long processing in event handlers
- Third-party scripts cause main thread contention during user interactions
- Input events are queued behind long-running tasks and experience delayed responses
- Form interactions or search-as-you-type features exhibit perceptible lag
- You need to attribute which phase of an interaction (input delay, processing, presentation) is the bottleneck

## Instructions

1. **Understand how INP differs from FID.** FID measured only the input delay of the first interaction. INP measures the full latency (input delay + processing time + presentation delay) of all interactions throughout the page session, and reports the worst interaction (approximately — it uses a high-percentile heuristic to avoid outliers).

2. **Decompose interaction into 3 phases:**
   - **Input delay** — Time from user action (click/tap/keypress) to the start of event handler execution. Caused by long tasks already running on the main thread when the user interacts.
   - **Processing time** — Time to execute all event handlers (pointerdown, mousedown, click, etc.) for the interaction.
   - **Presentation delay** — Time from event handler completion to the next frame being painted to screen. Caused by style recalculation, layout, paint, and compositing work.

3. **Reduce input delay by avoiding long tasks.** If a 200ms task is running when the user clicks, the click handler cannot start until that task finishes:

   ```javascript
   // BAD — monolithic initialization blocks all interactions for 500ms
   function initialize() {
     processData(); // 200ms
     buildIndex(); // 150ms
     renderWidgets(); // 150ms
   }

   // GOOD — yield between chunks so user input can be processed
   async function initialize() {
     processData();
     await scheduler.yield(); // let pending input events execute
     buildIndex();
     await scheduler.yield();
     renderWidgets();
   }
   ```

4. **Reduce processing time by keeping event handlers lean.** Move non-essential work out of the synchronous event handler:

   ```javascript
   // BAD — analytics + validation + DOM update all synchronous in click handler
   button.addEventListener('click', () => {
     trackAnalytics(event); // 50ms
     validateForm(); // 100ms
     updateDOM(); // 30ms
   }); // Total: 180ms processing time

   // GOOD — only essential work synchronous, defer the rest
   button.addEventListener('click', () => {
     updateDOM(); // 30ms — user sees immediate feedback
     requestIdleCallback(() => {
       trackAnalytics(event); // runs when idle
       validateForm(); // runs when idle
     });
   }); // Processing time: 30ms
   ```

5. **Reduce presentation delay.** Minimize the work between event handler completion and the next paint:
   - Avoid forcing layout in event handlers (triggers synchronous layout in the presentation phase)
   - Use `content-visibility: auto` to reduce rendering cost for off-screen content
   - Keep DOM mutation scope small — update only what changed

6. **Use event delegation to reduce event handler overhead.** Instead of attaching listeners to each list item, delegate to the parent:

   ```javascript
   // BAD — 500 event listeners for 500 items
   items.forEach((item) => item.addEventListener('click', handleClick));

   // GOOD — 1 event listener, delegate based on target
   list.addEventListener('click', (e) => {
     const item = e.target.closest('.item');
     if (item) handleClick(item);
   });
   ```

7. **Measure INP with the Performance API:**

   ```javascript
   const observer = new PerformanceObserver((list) => {
     for (const entry of list.getEntries()) {
       // entry.duration = total interaction latency (input delay + processing + presentation)
       // entry.processingStart - entry.startTime = input delay
       // entry.processingEnd - entry.processingStart = processing time
       // entry.startTime + entry.duration - entry.processingEnd = presentation delay
       console.log('INP candidate:', entry.duration, 'Target:', entry.target);
     }
   });
   observer.observe({ type: 'event', buffered: true, durationThreshold: 16 });
   ```

## Details

### INP Thresholds

| Rating            | INP (p75) | Perception                 |
| ----------------- | --------- | -------------------------- |
| Good              | <= 200ms  | Interface feels responsive |
| Needs improvement | <= 500ms  | Noticeable lag             |
| Poor              | > 500ms   | Interface feels broken     |

INP is measured at the 75th percentile of all interactions during a page session. On pages with fewer than 50 interactions, the worst interaction is used. On pages with 50+ interactions, the 98th percentile is used (approximately the worst 1-2 interactions).

### Worked Example: Redbus INP Optimization

Redbus improved INP from 657ms to 164ms by breaking a monolithic click handler into yielding chunks. The original handler executed a 400ms data processing function synchronously on bus route selection click. The fix:

1. Split the data processing into 3 phases: filter (100ms), sort (150ms), render (150ms)
2. Inserted `await scheduler.yield()` between each phase
3. The first chunk (filter) completed in 100ms, yielding to the browser to paint the loading state
4. Processing time dropped from 400ms to 100ms per yield point
5. Total INP went from 657ms (input delay: 107ms + processing: 400ms + presentation: 150ms) to 164ms (input delay: 14ms + processing: 100ms + presentation: 50ms)

### Worked Example: Tesco Analytics Deferral

Tesco reduced INP by 50% by moving analytics event processing from synchronous click handlers to `requestIdleCallback`. Every product click triggered synchronous analytics calls that serialized product data, computed session metrics, and prepared beacon payloads — totaling 80ms of processing. Moving to `requestIdleCallback` reduced click handler processing to 5ms (just the DOM update), with analytics work deferred to idle periods.

### How INP Selects the Worst Interaction

INP does not simply report the single worst interaction (which could be an outlier). Instead:

- If fewer than 50 interactions occur, the worst one is reported
- If 50+ interactions occur, the 98th percentile is used (1 in 50 interactions excluded)

This makes INP resilient to one-off anomalies while still capturing consistently slow interactions.

### Anti-Patterns

**Synchronous DOM manipulation in event handlers.** Large DOM updates in a click handler force the browser to perform style, layout, and paint synchronously before the next frame. Use `requestAnimationFrame` to batch visual updates.

**Heavy computation in input handlers without yielding.** A click handler that processes 10,000 data records without yielding blocks the main thread for the entire duration. No other interactions can be processed during this time.

**Individual event listeners on hundreds of list items.** Besides the memory cost of hundreds of closures, the browser must evaluate each listener binding during event dispatch. Event delegation on the parent element reduces both memory and dispatch overhead.

**Running `requestAnimationFrame` work inside click handlers.** `requestAnimationFrame` callbacks execute before the next paint but after the current task. Scheduling heavy work in rAF from a click handler delays the visual update to the frame after next, increasing presentation delay.

**Ignoring input delay in favor of processing time.** Many developers focus on optimizing their event handler code but ignore that a 300ms long task running before the user clicks creates 300ms of input delay before the handler even starts. Reducing background long tasks is equally important.

## Source

- web.dev INP documentation — https://web.dev/articles/inp
- Chrome INP Attribution API — https://web.dev/articles/debug-performance-in-the-field
- Web Vitals JavaScript library — https://github.com/GoogleChrome/web-vitals
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
- INP is measured using the Performance Observer API and meets the 200ms threshold at p75.
- Each interaction phase (input delay, processing, presentation) is identified and optimized.
