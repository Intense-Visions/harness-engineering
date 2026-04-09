# Loading Patterns

> Perceived performance — skeleton screens, progressive loading, optimistic rendering, shimmer effects, content-first loading, perceived vs actual speed

## When to Use

- Designing loading states for any view that fetches data from a server or API
- Choosing between skeleton screens, spinners, progress bars, and shimmer effects
- Optimizing perceived performance when actual performance cannot be improved
- Implementing lazy loading, infinite scroll, or paginated content loading
- Building offline-first or cache-first architectures that show stale data while refreshing
- Designing content-heavy pages (feeds, dashboards, search results) where load time varies
- Auditing an application for loading state gaps — views that show blank white screens during data fetch
- Implementing optimistic rendering for user-initiated mutations (create, update, delete)

## Instructions

1. **Match the loading pattern to the content predictability.** The core decision tree:
   - **Layout is known, content is unknown:** Use skeleton screens. You know the page has a profile header, three stat cards, and a data table — render those shapes as gray placeholders that will be replaced by real content. Facebook, LinkedIn, YouTube, and Slack all use skeleton screens for their primary feeds.
   - **Layout is unknown, content is unknown:** Use a spinner or indeterminate progress bar. Search results where the count and format vary, or dynamic dashboards where widget configuration varies per user. A spinner says "something is coming, but I do not know what shape it will take."
   - **Duration is known:** Use a determinate progress bar. File uploads, build processes, multi-step operations. Show percentage complete and estimated time remaining. Vercel's build progress bar shows both.
   - **Duration is unknown but operation is user-initiated:** Use an indeterminate progress bar with descriptive status text. "Analyzing dependencies..." then "Running tests..." then "Deploying..." — the text updates communicate progress even though percentage is unknown.

2. **Build skeleton screens that match the actual content layout exactly.** A skeleton screen must be a pixel-accurate placeholder of the final rendered content. If the real page has a 48px circular avatar, a 200px-wide heading, and three lines of 14px body text, the skeleton must have a 48px circle, a 200px rectangle at heading height, and three rectangles at body text height with appropriate line spacing. Mismatched skeletons (wrong sizes, wrong positions, wrong count) create a jarring "swap" moment when real content loads — defeating the purpose. Facebook's skeleton screens match their post layout precisely: avatar circle, name bar, timestamp bar, content block, engagement bar.

3. **Animate skeleton screens with a left-to-right shimmer.** Static gray rectangles feel dead. An animated shimmer (a gradient that sweeps left-to-right across the skeleton elements) communicates "loading in progress" and makes the wait feel shorter. Implementation: use a CSS gradient animation on a `::before` pseudo-element:

   ```css
   .skeleton {
     background: #e0e0e0;
     position: relative;
     overflow: hidden;
   }
   .skeleton::before {
     content: '';
     position: absolute;
     inset: 0;
     background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
     animation: shimmer 1.5s infinite;
   }
   @keyframes shimmer {
     0% {
       transform: translateX(-100%);
     }
     100% {
       transform: translateX(100%);
     }
   }
   ```

   The shimmer duration should be 1.5-2.0 seconds per cycle. Faster feels frantic; slower feels stalled. LinkedIn uses 1.8 seconds. YouTube uses approximately 1.5 seconds. The gradient should be subtle — 30-40% white opacity, not a harsh white band.

4. **Apply the 100ms/1s/10s threshold rules for loading indicator appearance.** These are Jakob Nielsen's perceptual thresholds, validated repeatedly:
   - **Under 100ms:** Show nothing — the content will appear to load instantly. Adding a loading indicator for sub-100ms loads creates flicker (the skeleton flashes for one frame then disappears).
   - **100ms-1s:** Show a skeleton screen or subtle loading indicator. No spinner needed — the wait is short enough that a spinner feels heavy-handed.
   - **1-5s:** Show a skeleton screen with shimmer animation, or a spinner with a status message. The user has noticed the delay and needs reassurance that the system is working.
   - **5-10s:** Show a skeleton screen or spinner with progress information: step name, percentage if determinable, estimated time remaining. Consider streaming partial content.
   - **Over 10s:** Show all of the above, plus offer a cancel option and consider sending a notification when complete. The user will likely switch context.

   To prevent flicker for fast loads, delay the skeleton/spinner appearance by 200ms. If the content loads within 200ms, no loading indicator ever appears. If it takes longer than 200ms, the skeleton fades in. This eliminates the flash-of-skeleton for fast connections while still showing a loading state for slow ones.

5. **Implement progressive loading to prioritize above-the-fold content.** Load and render content in priority order: (1) navigation and page structure (cached, renders immediately), (2) above-the-fold content (first API call, critical data), (3) below-the-fold content (deferred, lazy-loaded on scroll), (4) non-essential enhancements (analytics, recommendation widgets, social proof badges). Each priority tier can render independently — the page builds up rather than appearing all at once. Vercel's dashboard loads the navigation shell from cache, then the deployment list (above the fold), then the activity feed (below the fold), then the usage graph (far below the fold).

6. **Use optimistic rendering for user-initiated mutations.** When a user creates, updates, or deletes something, render the expected outcome immediately without waiting for server confirmation. The three-step pattern:
   - **Render optimistically:** Show the new item / updated state / removal immediately in the UI.
   - **Sync in background:** Send the mutation to the server.
   - **Reconcile on response:** On success, replace the optimistic placeholder with the server-confirmed data (updating timestamps, IDs, etc.). On failure, rollback the optimistic change and show an error with retry.

   GitHub's star/unstar is optimistic rendering: the star fills and the count changes on click, before the server responds. Slack's message send is optimistic rendering: the message appears in the channel immediately. Linear's status change is optimistic rendering: the issue moves to the new column immediately.

7. **Design content-first loading that shows real data before chrome.** Invert the traditional loading order: instead of loading the full page shell then filling in data, load the most important data first and build the shell around it. For a blog post, load the article text first (renders in under 500ms as server-rendered HTML), then load the header/footer navigation, sidebar, comments, and related posts progressively. The user gets to the content — the reason they are on the page — as fast as possible. Medium uses this pattern: the article text renders almost immediately, then author info, clap count, and responses load progressively.

8. **Implement stale-while-revalidate for cached data.** Show the cached version immediately (stale data), then fetch fresh data in the background, then swap the stale data with fresh data when it arrives. The swap must be non-disruptive — if the data has not changed (common case), do nothing. If the data has changed, update individual elements rather than replacing the entire view (which would cause a layout shift). The HTTP `Cache-Control: stale-while-revalidate` header supports this pattern at the network level. SWR (by Vercel) and React Query implement it at the application level: `const { data } = useSWR('/api/dashboard', fetcher)` returns cached data immediately and refreshes in the background.

## Details

### Skeleton Screen Design Specifications

Skeleton elements should follow these visual rules:

- **Color:** Use a neutral gray at 10-15% of the text-to-background contrast ratio. On white backgrounds (#FFFFFF), use #E0E0E0 to #EEEEEE. On dark backgrounds (#121212), use #2C2C2C to #333333. The skeleton should be visible but not attention-grabbing.
- **Shape:** Match the shape of the content they represent. Text blocks are rounded rectangles (border-radius: 4px) at the exact line height and approximate width of the expected text. Avatars are circles at the exact avatar dimensions. Images are rectangles at the exact aspect ratio. Do not use generic rectangles for all content — the shapes should communicate what type of content is loading.
- **Width variation:** Text skeleton lines should vary in width to simulate natural text length: first line 100%, second line 95%, third line 60% (simulating a paragraph that does not fill the last line). Uniform-width lines look artificial.
- **Spacing:** Match the exact spacing of the real content. If the real layout has 16px between the avatar and the name, the skeleton has 16px between the circle and the rectangle. Spacing mismatches cause layout shift when real content replaces the skeleton.
- **Count:** Match the expected count of items. If the API typically returns 10 items, show 10 skeleton rows. If the count is unknown, show enough to fill the viewport (usually 5-8 items) — showing 3 skeleton items when 20 load creates a jarring expansion.

### Perceived Performance vs Actual Performance

Research from Stanford University (Seow, 2008) and IBM (Card, Robertson, and Mackinlay, 1991) established that perceived speed and actual speed diverge based on UX patterns:

**Patterns that make waits feel shorter:**

- **Progress indicators** reduce perceived wait time by 15-20% versus no indicator. Any indication of progress — even indeterminate — reassures the user that the system is working.
- **Skeleton screens** reduce perceived wait time by 20-30% versus blank screens or spinners. The user's brain starts processing the layout structure before content arrives, making the transition to full content feel faster.
- **Animation during waits** reduces perceived time by 10-15%. The shimmer effect on skeletons, a loading animation, or even background movement gives the brain something to process during the wait.
- **Early content delivery** (showing any real content before everything is loaded) has the largest impact: 30-50% reduction in perceived wait time. A page that shows the title and first paragraph in 200ms, then loads images over the next 2 seconds, feels dramatically faster than a page that shows everything at 2.2 seconds.
- **Providing status updates** during long waits reduces perceived time by 20-25%. "Installing dependencies... Building assets... Running tests..." gives the user a narrative of progress.

**Patterns that make waits feel longer:**

- **Blank screens** feel 50-100% longer than actual time. A white screen with no indication of activity causes the user to wonder if the page is broken.
- **Spinners for long waits** (>5 seconds) increase anxiety because the spinner provides no progress information — the user cannot tell if the wait is 5% or 95% complete.
- **Repeated loading states** when navigating between already-visited pages. If the user saw this page 30 seconds ago, showing a full loading state again feels like regression. Use stale-while-revalidate to show the cached version instantly.
- **Layout shifts** during loading (content jumping as new elements load) extend perceived load time because the user must re-orient after each shift. The Cumulative Layout Shift (CLS) Core Web Vital directly measures this.

### Lazy Loading Implementation

Lazy loading defers the loading of below-the-fold content until the user scrolls near it. Implementation details:

**Intersection Observer pattern:** Use `IntersectionObserver` to detect when a placeholder element enters the viewport, then trigger the content load. Set `rootMargin: '200px'` to start loading 200px before the element becomes visible — this gives the network request a head start so content appears loaded by the time the user scrolls to it.

**Image lazy loading:** Use the native `loading="lazy"` attribute on `<img>` tags for images below the fold. This is supported in all modern browsers and requires zero JavaScript. For above-the-fold images (hero images, logos), do NOT use lazy loading — they should load immediately. The `<img>` `fetchpriority="high"` attribute signals to the browser that above-the-fold images are critical.

**Infinite scroll vs pagination:** Infinite scroll works for content browsing (social feeds, search results, image galleries) where the user's intent is exploration. Pagination works for task-oriented interfaces (email inbox, transaction history, admin tables) where the user needs to find specific items and track their position. Infinite scroll must preserve scroll position on back navigation — if the user clicks an item (navigating away) and hits back, they must return to their exact scroll position, not the top of the page. This requires storing scroll position and loaded items in memory or session state.

### Loading States for Different Content Types

**Text content:** Skeleton lines that match the expected text layout. Use 3-4 lines for a paragraph placeholder, 1 line for a heading, 1 short line for metadata (date, author). Render real text as soon as the API response arrives — text has near-zero render cost.

**Images:** Show a placeholder at the exact aspect ratio of the expected image (prevents layout shift). Options: solid color matching the dominant color of the image (if known from a low-resolution preview or palette extraction), blurred low-resolution preview (LQIP — Low Quality Image Placeholder, used by Medium and Facebook), or a generic gray placeholder. The placeholder should have the exact dimensions so that layout does not shift when the full image loads.

**Data tables:** Show skeleton rows with column-width-matched rectangles. Show the actual column headers immediately (they are static and known ahead of time). Animate the shimmer across rows. Render data rows as they arrive from the API — partial table rendering is better than waiting for all data.

**Charts and visualizations:** Show the chart axes and labels immediately (static, known). Show the chart area as a skeleton placeholder. On data arrival, animate the chart elements in (bars grow from zero, lines draw from left to right). This progressive reveal makes the chart feel responsive even if the data took 2 seconds to load.

**Maps:** Show a static map tile (low-resolution, from cache) immediately. Overlay interactive elements (pins, routes) as they load. Google Maps uses this: the base map renders from cached tiles almost instantly, then points of interest, traffic layers, and route overlays appear progressively.

### Anti-Patterns

1. **The Fake Progress Bar.** A progress bar that fills linearly from 0-90% in 3 seconds, then stalls at 90% for an unknown duration until the operation completes. Users learn that the bar is lying and stop trusting it. Fix: either use a genuine determinate progress bar (where percentage reflects actual completion) or use an indeterminate indicator (spinner, pulsing bar) that does not claim to know the completion percentage. If you use a determinate bar, it must be tied to real milestones — 10% after dependency resolution, 40% after build, 70% after tests, 100% on deploy.

2. **Spinner Everything.** Using a centered spinner for every loading state — page loads, component loads, data refreshes, image loads. Spinners convey no information about what is loading or what the page will look like. They require the user to wait for the "reveal" of the page layout, increasing perceived load time. Fix: use skeleton screens for any view where the layout is predictable. Reserve spinners for truly unpredictable content (search results, dynamic dashboards) or for inline indicators within already-rendered pages (a spinner inside a button during form submission).

3. **Layout Shift Avalanche.** Content loads progressively but each new element causes existing content to shift position: the header pushes down when the banner loads, the article jumps when an image loads, the sidebar pushes the content when ads load. Each shift disrupts reading and forces the user to re-find their place. Fix: reserve exact space for every element before it loads. Use `aspect-ratio` on image containers, fixed heights on ad slots, and `min-height` on dynamic sections. Target CLS (Cumulative Layout Shift) under 0.1 as defined by Core Web Vitals.

4. **Full-Page Reload for Partial Data.** Re-rendering the entire page (navigation, header, sidebar, footer, and content) when only the content area needs to update. The user sees a full loading state for a route change when 80% of the page is identical between routes. Fix: use client-side routing that preserves the persistent shell and only reloads the content area. Show a loading indicator only in the content area. Next.js, Remix, and SvelteKit all support this with their layout/route architecture.

5. **Stale-Without-Revalidate.** Showing cached data but never refreshing it. The user sees data from their last visit — potentially hours or days old — with no indication that it might be stale, and no background refresh. Fix: always revalidate cached data. Show the cached version immediately (good) but fetch fresh data in the background and update when it arrives. Display a "Last updated: X minutes ago" indicator when the data age exceeds a threshold (e.g., 5 minutes for dashboards, 1 hour for settings).

### Real-World Examples

**Facebook/Meta News Feed Skeleton.** Facebook pioneered the skeleton screen pattern in 2014 and it remains the most studied implementation. Their skeleton matches the post layout exactly: a 40px circle (avatar), two stacked rectangles at 40% and 30% width (name and timestamp), a large rectangle at full width (content block), and a row of small rectangles (reaction/comment/share buttons). The shimmer animates left-to-right at 1.5s per cycle. On content arrival, the skeleton morphs into the real post — the circle becomes the avatar, the rectangles become text — with no layout shift because the dimensions are identical. Facebook reported a 10% decrease in perceived load time after deploying skeleton screens.

**Vercel Build and Deploy Progress.** Vercel's deployment provides multi-stage progressive feedback: (1) "Queued" — gray indicator, immediate acknowledgment of the deployment trigger. (2) "Building" — animated yellow dot, streaming build log visible in real-time (the user can watch `npm install` and `next build` output line by line). (3) "Deploying" — animated blue dot, "Deploying to edge network." (4) "Ready" — green checkmark, preview URL, deployment time. Each stage transition updates a timeline visualization showing elapsed time per stage. If a build fails, the error is shown inline in the build log with the exact failing command highlighted in red.

**Slack Channel Loading.** When opening a Slack channel, the loading sequence is: (1) Channel header (name, topic, member count) renders from cache immediately. (2) Message history appears from local cache (potentially stale). (3) A "loading new messages" indicator appears between cached messages and the message input. (4) New messages stream in from the server and append below the cached messages. (5) The "loading" indicator disappears. The user can read cached messages and even start typing a reply while new messages load — no blocking loading state. If the user is offline, the entire channel renders from cache with a yellow "You're not connected" banner.

**YouTube Video Page Loading.** YouTube uses a sophisticated multi-tier loading strategy: (1) Video player loads first (highest priority) — a black rectangle with a spinner at the exact video aspect ratio. (2) Video title and channel info load from a fast endpoint (skeleton → real content in under 200ms). (3) Video description and metadata expand on click (deferred). (4) Related videos sidebar loads asynchronously (skeleton column of 20 video cards). (5) Comments section loads only when scrolled into view (full lazy loading). The result: the user can start watching the video within 1-2 seconds while the rest of the page builds itself progressively over the next 3-5 seconds.

**Linear Dashboard Loading.** Linear loads its issue list with a content-first strategy: (1) The sidebar navigation renders from cache (persistent shell). (2) Issue list renders from local state (offline-first architecture — issues are synced to IndexedDB). (3) A background sync checks for updates from the server. (4) If new issues exist, they fade into the list without disrupting scroll position. (5) If an issue was modified elsewhere, the update appears inline with a subtle highlight that fades after 2 seconds. The user never sees a loading spinner for the primary issue list — it is always available from local state.

## Source

- Nielsen, J. — "Response Times: The 3 Important Limits" (1993), perceptual timing thresholds
- Seow, S. — _Designing and Engineering Time_ (2008), perceived vs actual performance
- Facebook Engineering — "Building Skeleton Screens" (2014), original implementation research
- Google — Core Web Vitals, https://web.dev/vitals/ (LCP, FID, CLS metrics)
- Vercel — SWR (stale-while-revalidate) library, https://swr.vercel.app/
- Card, S., Robertson, G., and Mackinlay, J. — "The Information Visualizer" (1991), animation and perceived time

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
