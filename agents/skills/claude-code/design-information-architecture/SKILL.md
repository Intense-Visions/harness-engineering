# Information Architecture

> Structuring information — card sorting, tree testing, mental models, labeling systems, organization schemes, findability

## When to Use

- Designing the navigation structure of a new application, website, or documentation site
- Reorganizing an existing product whose navigation has grown organically and become inconsistent or confusing
- Planning a content-heavy experience (knowledge base, documentation, settings page, admin panel) where users must find specific items among hundreds
- Conducting user research to understand how your audience groups, labels, and prioritizes information
- Designing search and filtering systems where findability depends on correct categorization
- Merging or migrating content from multiple sources into a unified structure
- Auditing a product where users report difficulty finding features — "I didn't know that existed" is an IA failure
- Building a design system where component organization, naming, and discoverability affect adoption

## Instructions

1. **Start with user mental models, not organizational charts.** The number one IA mistake is structuring information to match the company's internal departments rather than the user's mental model. Users do not think in terms of "Platform Engineering" vs "Infrastructure Services" — they think "I need to deploy my app." Card sorting reveals how real users group and label information. Run an open card sort (users create their own categories) with 15-20 participants before committing to any navigation structure. Spotify's music organization follows listener mental models (mood, activity, genre) rather than music industry categories (label, distributor, format).

2. **Use the four organization schemes and choose deliberately.** Every information structure uses one or more of these schemes:

   | Scheme        | Principle                | Best For                             | Example                                         |
   | ------------- | ------------------------ | ------------------------------------ | ----------------------------------------------- |
   | Alphabetical  | A-Z ordering             | Reference lookups, known-item search | Contact list, API reference, country selector   |
   | Chronological | Time-based ordering      | Activity feeds, logs, history        | Email inbox, commit history, notification feed  |
   | Topical       | Subject-based grouping   | Learning, exploration, browsing      | Documentation sections, product categories      |
   | Task-based    | Action-oriented grouping | Goal-driven workflows, tool UIs      | "Create," "Manage," "Analyze" navigation groups |

   Most products need a hybrid. GitHub uses topical for repository tabs (Code, Issues, Pull Requests) but chronological within each tab (newest issues first). Material Design's documentation uses topical at the top level (Foundations, Styles, Components) and alphabetical within each section. The mistake is defaulting to topical when task-based would serve users better — users come to tools to accomplish tasks, not to browse topics.

3. **Apply the principle of progressive disclosure to information depth.** Not all information is equally important, and showing everything at once overwhelms. Structure information in layers: Level 1 (always visible) is the 3-7 most important categories. Level 2 (one click away) is the subcategories within each category. Level 3 (two clicks away) is the individual items. Amazon's category navigation demonstrates this: "Electronics" (L1) expands to "Computers & Accessories" (L2), which leads to "Laptops" (L3). Each level shows only what is relevant at that depth. If your top-level navigation has more than 7 items, your IA needs another layer of hierarchy.

4. **Label for recognition, not recall.** Navigation labels must be instantly understood without context or explanation. "Settings" is universally recognized. "Configuration Management" requires the user to parse jargon. "Dashboard" is clear. "Operational Overview" is not. Test labels with a 5-second comprehension test: show the label to a user for 5 seconds, then ask what they would expect to find behind it. If more than 20% of users guess wrong, the label fails. Material Design's settings organization uses plain labels — "Display," "Sound," "Notifications" — not "Visual Configuration," "Audio Management," "Alert Preferences."

5. **Design for three findability strategies simultaneously.** Users find information in three ways, and your IA must support all three:
   - **Known-item search:** The user knows exactly what they want. Support: search bar with autocomplete, direct URL patterns, keyboard shortcuts. GitHub's command palette (Cmd+K) serves this — type "settings" and jump directly to repository settings.
   - **Exploratory browsing:** The user knows roughly what they need but not where it is. Support: clear category labels, breadcrumbs, progressive disclosure, "related items" links.
   - **Re-finding:** The user found something before and needs it again. Support: recent items, bookmarks/favorites, persistent URLs, browser history compatibility.

   If your product only supports one findability strategy, two-thirds of user navigation attempts will fail.

6. **Validate structure with tree testing before building.** Tree testing (also called reverse card sorting) evaluates findability without visual design bias. Present users with the navigation tree as a text hierarchy and ask them to find specific items: "Where would you find the setting to change your notification preferences?" If fewer than 70% of users navigate to the correct location, the structure needs revision. Tree testing is cheaper and faster than usability testing on a built prototype and catches structural problems that no amount of visual polish can fix.

7. **Use consistent depth and parallel structure.** If "Settings" has three subcategories and "Account" has twelve, the IA is unbalanced. Aim for consistent breadth at each level (3-7 items) and consistent depth (2-3 levels). Parallel structure means sibling items should be the same type: if one top-level item is a category ("Products") and another is an action ("Create Report"), the IA is mixing metaphors. Apple's System Settings in macOS Ventura reorganized from a flat grid of 30+ panes into a hierarchical sidebar with consistent grouping — each group contains 3-6 related settings panes.

8. **Design the labeling system as a controlled vocabulary.** Consistent labeling means the same concept always uses the same word across the entire product. If the navigation says "Projects," the empty state should say "No projects yet" not "No workspaces found." If the settings say "Notifications," the onboarding should say "Set up your notifications" not "Configure your alerts." Create a terminology guide that maps each concept to exactly one label and enforce it in code review. Slack is disciplined about this: a "channel" is always a "channel" — never a "room," "group," or "chat."

## Details

### Card Sorting Methods

**Open card sort:** Participants are given 30-60 content items on cards and asked to group them into categories they create and name themselves. This reveals how users naturally organize the information. Run with 15-20 participants. Analyze by looking for agreement: if 80% of participants put "billing" and "invoices" in the same group, they belong together. If "integrations" splits 50/50 between "settings" and "tools," you have an IA ambiguity that needs resolution.

**Closed card sort:** Participants are given the same content items but must sort them into pre-defined categories. This tests whether your proposed category labels make sense to users. Run after an open sort has suggested candidate categories. If users consistently misplace items in a category, the category label is misleading or the item belongs elsewhere.

**Hybrid card sort:** Participants sort into pre-defined categories but can create new ones if nothing fits. This is the most efficient single-round approach — it tests your structure while still surfacing surprises. Use when time allows only one sort round.

**Remote tools:** OptimalSort, Maze, and UserZoom support remote card sorting at scale. Remote sorts typically need 30-50 participants for statistical reliability because engagement varies. In-person sorts with 15 participants often yield cleaner data because participants are more attentive.

### Mental Model Alignment

A mental model is the user's internal representation of how a system works. When the IA matches the mental model, navigation feels intuitive. When it does not, every interaction requires conscious effort.

**Identifying mental models:** Interview users before designing the IA. Ask "How would you describe the main parts of [product type]?" and "If you needed to [task], where would you start?" The language and groupings users use reveal their mental model. If most users describe email as "inbox, sent, drafts, trash" — that is the mental model. Structuring it as "received communications, dispatched items, pending compositions, deleted materials" maps to the same data with none of the intuitive recognition.

**Model mismatch signals:** High search usage for items that exist in the navigation, support tickets asking "Where is X?", analytics showing users visit 3-4 wrong pages before finding the right one, and A/B tests where "reorganized navigation" consistently outperforms "current navigation" all signal mental model mismatch.

**Evolving models:** User mental models change as they gain expertise. A novice's model of a code editor is "write code, run code, see errors." An expert's model includes "debug, profile, refactor, version control, test." Support both with progressive disclosure — show the novice model by default and reveal expert features as the user demonstrates readiness (or provide an explicit "advanced" toggle).

### Labeling Systems

Labels are the most visible artifact of information architecture. A labeling system is a controlled vocabulary — a defined set of terms that are used consistently across the product.

**Label testing.** For each proposed label, ask 10 users: "What would you expect to find under [label]?" If the responses cluster around the correct content, the label works. If responses scatter or cluster around the wrong content, the label is misleading. "Activity" commonly fails this test — users expect anything from "my recent actions" to "what others are doing" to "exercise tracking."

**Label conventions by content type:**

| Content Type | Label Convention               | Example                      |
| ------------ | ------------------------------ | ---------------------------- |
| Sections     | Nouns (plural)                 | Projects, Settings, Reports  |
| Actions      | Verbs (imperative)             | Create, Import, Share        |
| Statuses     | Adjectives or past participles | Active, Archived, Pending    |
| Filters      | Noun + qualifier               | My Projects, Recent, Starred |

Mixing conventions creates cognitive friction. If most navigation items are nouns ("Projects," "Teams," "Settings") but one is a verb ("Analyze"), the verb item feels out of place and users may not recognize it as a navigation destination.

### Organization at Scale

Products with hundreds of items (documentation sites, admin panels, e-commerce catalogs) require faceted organization — multiple independent classification axes that users can combine:

**Faceted classification.** Each item is tagged along multiple dimensions: type, audience, date, status, topic. Users can filter along any axis or combination. A documentation site might offer facets for: product area (API, SDK, Dashboard), content type (tutorial, reference, guide), skill level (beginner, intermediate, advanced), and platform (iOS, Android, Web). Users compose their own view by selecting facets, rather than navigating a single rigid hierarchy.

**Polyhierarchy.** Some items legitimately belong in multiple categories. "Two-factor authentication" belongs in both "Security" and "Account settings." Rather than forcing it into one location, use cross-references: list it in both places, or list it in the primary location with a link from the secondary one. Avoid duplicating the content itself — that creates a maintenance burden where one copy gets updated and the other does not.

**Search as first-class navigation.** At scale, browsing breaks down. When a product has 200+ settings, no hierarchical navigation will serve all users. Search with intelligent autocomplete becomes the primary navigation tool. Algolia's documentation search demonstrates this — the search understands synonyms ("auth" matches "authentication"), handles typos, and weights results by relevance. Every product with more than 50 findable items needs robust search.

### Anti-Patterns

1. **The Org-Chart Navigation.** Structuring navigation to match internal company departments: "Marketing Tools," "Engineering Resources," "Sales Dashboard." Users do not know or care about your org chart. They want to accomplish tasks. A user who wants to "see monthly revenue" should not need to know whether that report lives in "Sales," "Finance," or "Analytics." Structure by user task and mental model, not by team ownership.

2. **The Junk Drawer.** A navigation category that collects unrelated items that did not fit elsewhere: "More," "Other," "Miscellaneous," or the classic "Tools." When a category becomes a junk drawer, it means the IA has gaps — there are concepts in the product that have no natural home. The fix is not a catch-all category; it is restructuring the IA to accommodate the orphaned items or questioning whether they belong in the product at all.

3. **The Deep Hierarchy.** Requiring 4+ clicks to reach commonly used items. Every level of depth reduces findability and increases abandonment. If users must navigate Home > Settings > Account > Security > Two-Factor Authentication to enable 2FA, the IA is too deep. Flatten by promoting frequently accessed items, using shortcuts, and limiting hierarchy to 2-3 levels. Amazon limits primary navigation to 3 levels despite having millions of products — anything deeper is reached through search or filtering.

4. **Synonym Pollution.** Using different words for the same concept across the product. The navigation says "Workspace," the settings say "Organization," the API says "Tenant," and the documentation says "Account." The user encounters four words and does not know if they refer to the same thing or four different things. This is the most common labeling failure and the easiest to prevent: create a terminology map, enforce it in code review, and search the codebase for violations quarterly.

5. **The False Floor.** An IA that appears complete but hides significant functionality behind non-obvious paths. A settings page that shows 10 options but has 40 more behind an "Advanced" link that looks like body text. A navigation sidebar that requires scrolling to reveal critical items below the fold. Users form a mental model of the product's scope based on what they can see — hidden features might as well not exist.

### Real-World Examples

**Material Design's Settings Organization.** Material Design prescribes a specific IA for Android settings: top-level groups (Network & Internet, Connected Devices, Apps, Notifications, Battery, Storage, Sound, Display, Accessibility, Security, Privacy, Location, System). Each group contains 3-7 items. The grouping is user-mental-model-driven: "Network & Internet" covers Wi-Fi, mobile data, and hotspot — things a user associates with "being connected." The labels are plain language, the depth is consistently 2 levels, and the most common settings (Wi-Fi, Bluetooth, Display brightness) are reachable in 2 taps.

**Apple's System Settings Reorganization.** In macOS Ventura, Apple reorganized System Preferences (a flat grid of 30+ icon panes) into System Settings (a hierarchical sidebar). The flat grid failed at scale — with 30+ panes, users could not scan them quickly. The new sidebar groups related settings and allows search. This reorganization demonstrates that flat structures work at small scale (under 10 items) but require hierarchy when they grow. Apple's execution validates the "3-7 items per level" rule — each sidebar group contains 3-6 items.

**GitHub's Repository Navigation.** A GitHub repository uses tab-based navigation with 6-8 tabs: Code, Issues, Pull Requests, Actions, Projects, Wiki, Security, Settings. This IA is task-based — each tab represents a distinct workflow. The tab count stays within the 7-item limit. Sub-navigation within tabs uses secondary patterns (sidebar filters for Issues, breadcrumbs for Code file navigation). The IA scales from a personal project with 10 issues to a massive open-source project with 10,000 issues by keeping the top-level structure constant and scaling the within-tab filtering and search.

**Stripe's Documentation IA.** Stripe's documentation uses a three-axis structure: product area (Payments, Billing, Connect, etc.), content type (guides, API reference, sample code), and progression level (quick start, integration guide, advanced topics). The left sidebar provides topical browsing, the search bar provides known-item finding, and breadcrumbs provide orientation. Each API endpoint page follows an identical structure: description, parameters table, request example, response example, error codes. The consistent structure means that once a developer learns to read one page, they can read any page — the IA itself teaches the navigation pattern.

**Airbnb's Search Facets.** Airbnb's search results page demonstrates faceted IA at scale. Users can filter by: location (map-based), dates (calendar), guests (counter), price range (slider), property type (checkboxes), amenities (checkboxes), accessibility features, and host language. Each facet is independent — selecting "pool" does not change available "price" options, it just reduces the result count. The faceted approach lets each user construct their own navigation path through thousands of listings without requiring a single rigid hierarchy.

### Measuring IA Effectiveness

IA quality is measurable. Track these metrics to validate your structure:

**Tree test success rate.** The percentage of users who navigate to the correct item on the first try in a tree test. Target: 70% or higher for primary tasks, 50% or higher for secondary tasks. Below these thresholds, the structure needs revision.

**Navigation path length.** The average number of clicks to reach target content from the homepage. Compare against the theoretical minimum (the depth of the item in the hierarchy). A ratio above 1.5x suggests users are taking wrong turns. Google Analytics behavior flow and click-path analysis tools like FullStory or Hotjar measure this in production.

**Search-to-navigate ratio.** The percentage of users who use search versus browse navigation to find items. A high search ratio (above 40%) for items that exist in the navigation suggests the navigation labels are not working — users cannot find items by browsing, so they search instead. A low search ratio for deep items suggests the IA is working well for browsing.

**Time to find.** The average time users take to locate a specific item. Measure in usability tests with task-based scenarios. Compare against a baseline (experienced user on the same task). If novice users take more than 3x longer than experienced users, the IA relies too heavily on learned behavior rather than intuitive structure.

## Source

- Rosenfeld, L., Morville, P., Arango, J. — _Information Architecture_ (4th ed., 2015), the foundational IA text
- Wodtke, C. — _Information Architecture: Blueprints for the Web_ (2009), practical IA methods
- Spencer, D. — _Card Sorting: Designing Usable Categories_ (2009), card sorting methodology
- Nielsen Norman Group — "Tree Testing" methodology articles, https://www.nngroup.com/articles/tree-testing/
- Material Design — Navigation patterns, https://m3.material.io/foundations/navigation

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
