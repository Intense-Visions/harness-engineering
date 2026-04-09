# Navigation UX

> Wayfinding — navigation models (hub-spoke, hierarchy, flat, content-driven), persistent vs contextual nav, breadcrumbs, information scent

## When to Use

- Designing the navigation architecture for a new application or website
- Restructuring navigation in an existing product that has grown organically and become disoriented
- Choosing between sidebar, top bar, bottom tab, hamburger menu, or command palette navigation
- Evaluating whether users can answer the three wayfinding questions: Where am I? Where can I go? How do I get back?
- Building deep content hierarchies (documentation sites, e-commerce catalogs, admin dashboards)
- Designing mobile navigation where screen real estate constrains persistent nav options
- Adding search or command palette navigation to complement structural navigation
- Diagnosing analytics that show high bounce rates, circular navigation paths, or users hitting the back button repeatedly

## Instructions

1. **Select a navigation model based on content architecture and user behavior.** There are four fundamental models, each suited to different information structures:

   | Model              | Structure                         | Best For                                   | Example                  |
   | ------------------ | --------------------------------- | ------------------------------------------ | ------------------------ |
   | **Hub-and-Spoke**  | Central hub, independent sections | Mobile apps, task-focused tools            | iOS Settings, Uber       |
   | **Hierarchy**      | Tree structure, parent-child      | Documentation, e-commerce, file systems    | GitHub repo, AWS Console |
   | **Flat/Matrix**    | All sections equally accessible   | Dashboards, command palettes, social feeds | Linear, Notion sidebar   |
   | **Content-Driven** | Navigation embedded in content    | Media, editorial, onboarding flows         | Medium, Netflix, Spotify |

   Hub-and-spoke works when sections are independent — completing a task in one section does not require visiting another. Hierarchy works when content has natural parent-child relationships. Flat works when expert users need rapid access to any section. Content-driven works when the content itself suggests the next destination.

2. **Ensure users can always answer three questions.** Miller and Remington's wayfinding research (2004) established that effective navigation answers: (a) Where am I? — the current location must be visually highlighted (active state in nav, breadcrumb, page title). (b) Where can I go? — available destinations must be visible or one interaction away. (c) How do I get back? — return paths must be obvious (back button, breadcrumb, persistent nav). If your navigation fails any of these three, users become disoriented. GitHub answers all three: the repository breadcrumb shows "where am I" (org/repo/path), the file tree shows "where can I go," and the breadcrumb links show "how do I get back."

3. **Use persistent navigation for primary sections, contextual navigation for secondary.** Persistent navigation (always visible: sidebar, top bar, bottom tabs) should contain only the top 5-7 destinations that users visit frequently. Beyond 7, the navigation becomes a scanning task rather than a recognition task (Miller's Law). Secondary and tertiary destinations belong in contextual navigation: dropdown menus, command palettes, breadcrumb paths, or in-page links that appear only when relevant. Vercel's persistent nav has exactly 5 items: Overview, Deployments, Analytics, Logs, Settings. Everything else is contextual.

4. **Implement breadcrumbs for hierarchies deeper than 2 levels.** Breadcrumbs solve the "where am I?" question for deep hierarchies and provide one-click access to any ancestor. Each breadcrumb segment must be a link. The current page should be the last item, not linked (to avoid the "clicking the current page" confusion). Separator characters (/ or >) between segments must not be clickable. GitHub's file navigation is the benchmark: `org / repo / src / components / Button.tsx` — each segment is clickable, the current file is displayed but not linked, and the hierarchy is instantly legible.

5. **Design information scent that guides users toward their goal.** Information scent (Pirolli and Card, 1999) is the degree to which a navigation label predicts the content behind it. Strong scent: "Billing and Invoices" clearly leads to payment history. Weak scent: "Resources" could contain documentation, blog posts, templates, or downloads. The rules for strong information scent:
   - Use specific nouns, not abstract categories ("Billing" not "Account," "API Keys" not "Settings")
   - Include the most common search terms in navigation labels (what users type in search should appear in nav)
   - Front-load distinguishing words ("Deployment Settings" not "Settings for Deployments")
   - Test labels with a card sort: show users the label alone and ask where they expect it to lead

6. **Choose the right navigation container for the platform and content depth.**
   - **Top bar:** Best for 3-7 primary sections on desktop. Vercel, Stripe Dashboard, GitHub. Scales poorly beyond 7 items. Not suitable for deep hierarchies without a supplementary sidebar.
   - **Sidebar:** Best for 5-20+ sections with hierarchy. AWS Console, VS Code, Notion. Supports nested groups, expandable sections, and scroll. Can be collapsed to icons for space recovery. Linear uses a collapsible sidebar with team/project hierarchy.
   - **Bottom tabs (mobile):** Best for 3-5 primary sections on mobile. iOS tab bar standard. Instagram, Spotify, Airbnb. Must never exceed 5 tabs (Apple HIG). Icons must be paired with labels — icon-only bottom tabs fail user testing consistently.
   - **Hamburger menu:** A concession to space constraints, not a navigation strategy. Hides all navigation behind a single icon. Research by NNGroup (2016) showed that visible navigation increases feature discovery by 25-50% compared to hamburger menus. Use only when persistent navigation genuinely cannot fit, and supplement with visible shortcuts to the most-used sections.
   - **Command palette:** Flat-access overlay invoked by keyboard shortcut (Cmd+K / Ctrl+K). Linear, VS Code, Figma, Vercel, GitHub. Best as a supplement to structural navigation, not a replacement — it serves expert users who know what they want and can type it.

7. **Maintain spatial consistency across navigation transitions.** When a user navigates from Page A to Page B via the sidebar, Page B should appear in the content area while the sidebar remains stable. The sidebar should not scroll, reorder, or collapse during navigation — the persistent frame must persist. Apple's iOS navigation controller maintains spatial consistency through push/pop animations: new content slides in from the right, back navigation slides from the left. This builds spatial memory — users develop a mental model of "forward is right, back is left." Violating spatial consistency (content appears from random directions, navigation items rearrange) destroys the user's spatial model and causes disorientation.

8. **Provide multiple navigation paths to the same destination.** Expert users and novice users navigate differently. Novices browse (following hierarchical paths, reading labels). Experts search (command palette, URL manipulation, keyboard shortcuts). Both need to reach the same content. GitHub supports at least four paths to any file: (1) browse the file tree, (2) use the "Go to file" search (T shortcut), (3) modify the URL directly, (4) search with the site-wide search bar. Each path serves a different user expertise level and context.

## Details

### Navigation Model Deep Dives

**Hub-and-Spoke** is the dominant mobile pattern. The "hub" is a home screen or dashboard. "Spokes" are independent feature areas. Users always return to the hub before navigating to a different spoke. iOS Settings is pure hub-and-spoke: tap a category (spoke), configure it, tap "Back" to return to the settings list (hub), then tap another category. The strength is simplicity — users never get lost because the hub is always one tap away. The weakness is inefficiency — moving between spokes requires a hub round-trip. Solutions: add cross-spoke shortcuts (deep links from one spoke to a related spoke) or promote the most common cross-spoke paths to the hub.

**Hierarchy** reflects content with natural parent-child relationships: file systems, documentation, e-commerce catalogs. AWS Console is a deep hierarchy: Service > Resource Type > Resource > Configuration Tab > Specific Setting. Hierarchies need breadcrumbs (essential), collapsible tree views (helpful), and "jump to" search (essential for hierarchies deeper than 3 levels). The critical design decision is hierarchy width vs depth. Broad, shallow hierarchies (many items per level, few levels) support scanning. Deep, narrow hierarchies (few items per level, many levels) support drill-down. Research by Larson and Czerwinski (1998) found that broad hierarchies outperform deep ones for information retrieval — users complete tasks faster with 8x8 (64 items, 2 levels) than 2x2x2x2x2x2 (64 items, 6 levels).

**Flat/Matrix navigation** gives all sections equal structural weight. There is no parent-child relationship — every section is a peer. Linear's sidebar lists Inbox, My Issues, Views, Teams, and Projects at the same level. The command palette (Cmd+K) provides flat access to everything. This model works when: (a) users have clear goals and know what they want, (b) sections are independent, and (c) the total section count is manageable (under 20). Beyond 20 flat items, users cannot scan the list efficiently and the model degrades.

**Content-driven navigation** embeds navigation choices within the content itself — "related articles" links, "you might also like" recommendations, "next episode" auto-play. Netflix is almost entirely content-driven: rows of suggestions, each item linking to its detail page, which contains more suggestions. The structural navigation (home, search, my list) is minimal. Content-driven navigation works for exploration and discovery scenarios but fails for goal-directed tasks — if the user knows exactly what they want, embedded suggestions are noise.

### Breadcrumb Design Specifications

Breadcrumbs appear trivial but have specific design requirements:

- **Position:** Top of the content area, below the global navigation bar, above the page title. Consistent across all pages.
- **Separator:** "/" (file-path metaphor) or ">" (hierarchy metaphor). Choose one and use it consistently. Not clickable — only the segment text is clickable.
- **Current page:** Displayed as the last segment. Not linked (prevents "click current page" confusion). Visually distinguished (bold weight or reduced opacity compared to ancestor links).
- **Truncation:** For deep hierarchies (>5 levels), show first segment, ellipsis, last 2-3 segments: `Home / ... / Components / Button / Variants`. The ellipsis should be clickable, revealing a dropdown of hidden segments.
- **Mobile:** Breadcrumbs often collapse to a single "Back to [parent]" link on mobile, since the full path does not fit. This is acceptable — the "back" affordance answers "how do I get back?" which is the highest-priority wayfinding question on mobile.

### Command Palette Design

The command palette (Cmd+K) has become a standard navigation supplement in developer and productivity tools. Design requirements:

- **Invocation:** Keyboard shortcut (Cmd+K or Ctrl+K) and a visible search icon/button for discoverability. Linear shows a persistent search bar in the sidebar. VS Code shows a magnifying glass icon in the activity bar.
- **Fuzzy matching:** Users do not type exact nav labels. "depl sett" should match "Deployment Settings." Use fuzzy search algorithms (Fuse.js, fzf-style matching) that tolerate typos and abbreviations.
- **Result categories:** Group results by type: Pages, Actions, Settings, Recent. Vercel's command palette groups by: Navigation, Commands, Teams, Projects. Each group has a heading and results are ranked by relevance within groups.
- **Recent/frequent prioritization:** Show recently visited pages and frequently used commands at the top before the user types anything. This makes the command palette useful as a "quick jump" tool, not just a search tool.
- **Keyboard navigation:** Arrow keys to move between results, Enter to select, Escape to close. Tab to cycle between result categories. The entire interaction must be keyboard-only accessible — mouse is optional.

### Spatial Memory and Animation Direction

Users build spatial models of applications. After using an app for days, they develop a sense of "where things are" — settings feels like it is "to the right," notifications feel "above," profile feels "in the corner." Navigation animations should reinforce these spatial models:

- **Horizontal push/pop:** Used for peer-to-peer or sequential navigation (pages at the same hierarchy level, wizard steps). Content slides left to go "forward," right to go "back." Apple's UINavigationController and Android's Fragment transactions use this.
- **Vertical slide:** Used for hierarchy changes. Content slides up to go "deeper" (into a detail view), down to go "shallower" (back to a list). Bottom sheets slide up from below.
- **Fade/crossfade:** Used for non-spatial transitions where direction is meaningless (tab switches, same-position content swaps). Vercel uses crossfade for switching between dashboard tabs — there is no spatial relationship between "Deployments" and "Analytics."
- **Scale/zoom:** Used for focus changes. Zooming in (scaling up) to enter a detail view, zooming out (scaling down) to return to an overview. Figma uses scale transitions when zooming into a frame.

### Anti-Patterns

1. **The Junk Drawer.** A navigation item labeled "More," "Resources," "Other," or "Misc" that contains unrelated items that did not fit elsewhere. This is a failure of information architecture — the categories are wrong if items do not fit. Fix: restructure categories so every item has a natural home. If truly disparate items remain, consider whether they need to be in the navigation at all (maybe they belong in footer links, a help center, or a settings page).

2. **Navigation Inconsistency Across Pages.** The sidebar has 6 items on the dashboard, 4 items on the settings page, and 8 items on the analytics page — the navigation itself changes depending on where you are. Users lose their spatial model. Fix: persistent navigation must be literally persistent — same items, same order, same position on every page. Contextual nav can change, but the persistent frame must not.

3. **Deep Hamburger Hiding.** Hiding all navigation — including primary sections — behind a hamburger menu on desktop viewports where screen real estate is abundant. NNGroup's research (2016) found 25-50% lower feature discovery when navigation is hidden. The hamburger menu is a mobile compromise, not a desktop design choice. Fix: on desktop (>1024px), show primary navigation persistently. Use the hamburger only on mobile viewports where space genuinely requires it.

4. **Breadcrumb-less Deep Hierarchies.** A documentation site or admin panel with 4+ hierarchy levels and no breadcrumbs. Users navigate in, lose track of their position, and resort to the browser back button (which may not correspond to the hierarchy path if they arrived via search or deep link). Fix: add breadcrumbs to every page deeper than level 2.

5. **Icon-Only Navigation Without Labels.** A sidebar of 8 cryptic icons with no text labels, tooltips only on hover, and no visible way for a new user to learn what each icon means. Requires memorization of an arbitrary icon vocabulary. Fix: always pair icons with visible text labels. If space requires icon-only mode, add persistent tooltips on hover and ensure every icon follows established conventions (gear for settings, bell for notifications, house for home).

### Real-World Examples

**GitHub Repository Navigation.** GitHub's repository page is a masterclass in multi-model navigation. The top tab bar (Code, Issues, Pull Requests, Actions, etc.) is flat navigation — all sections are peers. Within Code, the file tree is hierarchical navigation with breadcrumbs. The "Go to file" shortcut (T key) is command palette navigation. The global search bar is search navigation. The breadcrumb path (org/repo/path) provides wayfinding. All four navigation models coexist, each serving a different user need: browsing (hierarchy), scanning (tabs), jumping (command palette), searching (search bar).

**Linear's Keyboard-First Navigation.** Linear's navigation is designed for speed. The sidebar provides structural navigation (Teams, Projects, Views). The command palette (Cmd+K) provides flat access to everything — issues, projects, settings, actions. Keyboard shortcuts (G then I for "Go to Inbox," G then M for "Go to My Issues") provide direct access without any visual navigation interaction at all. The three layers serve three user expertise levels: sidebar for learning, command palette for intermediate, shortcuts for expert. The transition between layers is seamless — a user can use all three in a single session.

**Apple iOS Navigation Hierarchy.** iOS establishes spatial navigation conventions that billions of users have internalized. Push (slide from right): navigate deeper. Pop (slide from left): navigate shallower. Modal (slide from bottom): temporary context (compose, alert, picker). Dismiss (slide to bottom): close temporary context. These four animations create a complete spatial vocabulary. Every native iOS app that follows these conventions benefits from the user's pre-existing spatial model. Apps that violate them (custom transitions that do not match the push/pop/modal/dismiss model) feel disorienting because they break the learned spatial language.

**Airbnb's Content-Driven Navigation.** Airbnb's home page navigation is almost entirely content-driven. Category pills (Icons, Beach, Cabins, Pools) filter the content grid. The grid items themselves are the primary navigation — each listing card leads to a detail page. The detail page uses content-driven navigation: a "More places to stay" section at the bottom continues the browsing journey. Structural navigation (search bar, profile menu, saved, trips) is minimal and positioned to not compete with content browsing. The design optimizes for exploration — users who do not have a specific destination in mind should find one through content, not through navigation menus.

### Navigation Testing Methodology

Validate navigation design with these three tests:

**First-click test.** Show users a screenshot of the interface and ask them to click where they would go to complete a specific task ("Find your billing history"). If more than 70% of users click the correct navigation item on their first attempt, the information scent is strong. Below 50% indicates a labeling or hierarchy problem. Tools: Optimal Workshop, UsabilityHub.

**Tree test (reverse card sort).** Present the navigation hierarchy as a text-only tree (no visual design) and ask users to navigate to specific content. This isolates information architecture from visual design — if users cannot find content in the tree, no amount of visual polish will save the navigation. Target: 80%+ success rate for critical tasks. Run tree tests before any visual design work — fixing IA problems in code is 10x more expensive than fixing them in a tree test.

**Back button audit.** Navigate through every major flow in the application and press the browser back button at each step. Does it return to the expected previous page? Does the previous page preserve its state (scroll position, filter selections, form data)? SPA frameworks often break back-button expectations by treating route changes as forward-only — verify that history management works correctly for every navigation path.

**Navigation path analysis.** In production, track the actual navigation paths users take to reach key pages. If users consistently take 4 clicks to reach a page that should be 2 clicks away, the navigation structure has a depth problem. If users consistently use search to find pages that are in the navigation, the labels have an information scent problem. Google Analytics User Flow and Hotjar recordings both support this analysis.

## Source

- Pirolli, P. and Card, S. — "Information Foraging" (1999), information scent theory
- Miller, C. and Remington, R. — "Modeling Information Navigation" (2004), wayfinding in digital spaces
- Larson, K. and Czerwinski, M. — "Web Page Design: Implications of Memory, Structure and Scent for Information Retrieval" (1998), hierarchy breadth vs depth
- Nielsen Norman Group — "Hamburger Menus and Hidden Navigation Hurt UX Metrics" (2016)
- Apple Human Interface Guidelines — Navigation patterns, https://developer.apple.com/design/human-interface-guidelines/navigation
- Material Design — Navigation patterns, https://m3.material.io/foundations/adaptive-design/large-screens

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
