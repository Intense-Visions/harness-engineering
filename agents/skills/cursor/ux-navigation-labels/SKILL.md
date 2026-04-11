# Navigation Labels

> Navigation label writing — menu item naming, breadcrumb clarity, tab labels, and sidebar organization that users scan without reading

## When to Use

- Writing sidebar navigation items and categories
- Naming tabs in tabbed interfaces
- Writing breadcrumb labels for hierarchical navigation
- Naming top-level menu items and dropdown menu entries
- Auditing existing navigation for clarity, consistency, and scannability
- NOT for: action buttons within pages (see ux-button-cta-copy)
- NOT for: link text that triggers an action rather than navigation (see ux-button-cta-copy)
- NOT for: onboarding step names in setup wizards (see ux-onboarding-copy)

## Instructions

1. **Navigation labels are nouns, not verbs.** "Settings" not "Configure settings." "Projects" not "Browse projects." "Billing" not "Manage billing." Navigation items name destinations — places the user goes, not actions they take. The distinction matters because verbs imply an immediate action will occur on click; nouns imply navigation to a place. "Delete" as a nav item suggests immediate deletion. "Archive" as a nav item is ambiguous. The exception: top-level navigations in settings panels sometimes use verb phrases like "Sign out" (an action, not a destination) — these are acceptable because the action IS the destination.

2. **Front-load the distinguishing word.** "Project settings" not "Settings for your project." "Team members" not "Members of your team." "API keys" not "Keys for the API." Users scan the first word of every navigation item — the distinguishing word must come first. In a sidebar with ten items, each item's first word must be different enough to be distinguishable by the first word alone. Compare: "Account preferences / Billing preferences / Notification preferences" — "Account," "Billing," "Notification" are the distinguishing words, front-loaded. Compare the failure mode: "Preferences for your account / Preferences for billing / Preferences for notifications" — all start with "Preferences," which is useless for scanning.

3. **Keep labels to 1-2 words maximum for sidebar and tab navigation.** Sidebar items: "Projects," "Issues," "Members," "Settings." Tab labels: "Overview," "Activity," "Files," "Settings." Three-word labels are acceptable when specificity genuinely requires it: "API keys," "Audit log," "Team members." Four-word labels are almost never justified in navigation — if four words are needed, the item is likely trying to do two things at once and should be split. GitHub's sidebar labels are all 1-2 words. Linear's navigation labels are all 1-2 words. Stripe's dashboard navigation labels are all 1-2 words. The pattern is consistent across best-in-class products.

4. **Breadcrumbs reflect the page hierarchy exactly — no summarization.** The breadcrumb "Acme Corp / Projects / Acme Dashboard / Settings" maps to the exact navigation path. Do not summarize: "Acme Corp / ... / Settings" hides the hierarchy. Do not reorder: "Settings / Acme Dashboard / Projects / Acme Corp" reverses the direction. Do not rename: if the page is titled "Notification preferences," the breadcrumb reads "Notification preferences," not "Notifications" (a shortening) or "Manage your notification preferences" (an expansion). Breadcrumbs are a navigational record — they show where the user is, derived from where they were, in the exact order they navigated there.

5. **Avoid "Misc," "Other," and "General" as category labels.** These are the navigation equivalent of dumping everything that does not fit neatly into a drawer labeled "stuff." Users cannot predict what is inside. "General settings" is slightly better than "Misc" because at least the category is named, but "Display settings" or "Workspace settings" or "Account settings" are all more useful because users can predict their contents. When forced to create a "miscellaneous" category, name it by its most significant members: "Integrations & API" or "Advanced" or "Developer settings" — each signals a user profile and a topic, not a catch-all.

6. **Group related items under category labels and limit groups to 5-7 items.** A sidebar with 20 ungrouped items is a wall of text. Grouped by category — "Workspace: Projects, Members, Settings" and "Account: Profile, Billing, Security" — the sidebar becomes scannable. Category labels function as section headers that allow users to skip irrelevant categories entirely. GitHub's repository sidebar groups: "Code," "Issues," "Pull requests," "Actions," "Projects," "Wiki," "Security," "Insights," "Settings" — nine top-level items, each representing a distinct workflow area. The grouping is implicit (no category headers) but the items are organized by workflow proximity.

7. **Use the word users would search for — not internal product naming.** If users type "dark mode" into a search bar, the setting should be labeled "Dark mode" or at minimum live in a section labeled "Appearance," not "Theme rendering options." If users search for "payment method," the page should be labeled "Payment methods," not "Billing instruments." Internal product naming (technical or marketing terms that are not in common use) creates a scannability failure — users cannot find the item because they are scanning for a word that does not appear in the navigation. The test: what would a new user type into the product's search bar to find this section?

8. **Tab labels describe the content of the tab, not actions performed there.** "Overview" not "See overview." "Members" not "Manage members." "Files" not "View files." Tab labels are destinations within a page — they follow the same noun-not-verb rule as navigation items. The one exception: tabs that represent distinct workflows where the action distinguishes two tabs with similar content. "Edit" and "Preview" are acceptable action-based tab labels because the action (edit vs. preview) is precisely what distinguishes them. "Compare" and "Diff" are acceptable because both are actions with distinct outputs.

## Details

### Navigation Label Length by Context

Navigation labels have strict length constraints by context:

| Navigation Type | Maximum Words | Maximum Characters | Example              |
| --------------- | ------------- | ------------------ | -------------------- |
| Sidebar item    | 2 words       | 20 characters      | "Team members"       |
| Tab label       | 2 words       | 15 characters      | "Activity"           |
| Top-level menu  | 1-2 words     | 15 characters      | "Settings"           |
| Dropdown item   | 3 words       | 30 characters      | "Export as CSV"      |
| Breadcrumb node | 3-4 words     | 40 characters      | "Notification prefs" |
| Category header | 1-2 words     | 20 characters      | "Workspace"          |

### Navigation Naming Conventions by Product Type

Navigation terminology varies by product type — use the terms users of that product type already know:

| Product Type    | Dashboard Label | Users Label | Settings Label | Activity Label |
| --------------- | --------------- | ----------- | -------------- | -------------- |
| Developer tool  | "Overview"      | "Members"   | "Settings"     | "Activity"     |
| E-commerce      | "Dashboard"     | "Customers" | "Preferences"  | "Orders"       |
| Design tool     | "Home"          | "Team"      | "Settings"     | "History"      |
| Project manager | "Dashboard"     | "People"    | "Settings"     | "Activity"     |
| Communication   | "Inbox"         | "Contacts"  | "Preferences"  | "All messages" |

Match the convention of adjacent products in the same category — users carry navigation expectations from product to product. Surprising a user who expects "Preferences" with "Configuration" creates unnecessary friction.

### Sidebar Organization Principles

**Maximum depth:** 2 levels (top-level items and one level of subitems). Three-level navigation requires the user to remember three layers of hierarchy while navigating — excessive cognitive load. If a third level is necessary, use breadcrumbs to show the user's position.

**Maximum items per level:** 7 items at the top level, 5-7 subitems per category. Beyond these limits, grouping is needed. The "7 plus or minus 2" rule (Miller's Law) applies directly to navigation — users can hold 5-9 items in working memory.

**Order:** Most frequently accessed items first (not alphabetical, not chronological). GitHub puts "Code" first because that is the most-accessed section for most repositories. Linear puts "Issues" first. Stripe puts "Dashboard" first. Alphabetical ordering is a failure mode — it prioritizes the organization system over user behavior.

### Breadcrumb Patterns

Well-formed breadcrumbs:

- Show the full path: "Acme Corp / Projects / Acme Dashboard / Settings"
- Use the exact page titles as labels (no renaming, no abbreviation)
- Are clickable at every level except the current page (which is not a link)
- Use "/" or ">" as a separator — "/" for URL-style products, ">" for app-style products
- Do NOT include "Home" unless the product's first level is literally called "Home"

Malformed breadcrumbs that fail users:

- Truncated paths: "Acme Corp / ... / Settings" hides the middle navigation
- Renamed labels: "Settings" when the page title is "Workspace settings"
- Missing levels: "Acme Corp / Settings" when the actual path is "Acme Corp / Projects / Settings"

### Navigation Labels for Localization

Navigation labels must survive translation without breaking scannability or layout:

- **Prefer short nouns that translate compactly:** "Settings" is 8 characters; "Einstellungen" (German) is 14 characters. Navigation containers must be wide enough for common translations.
- **Avoid culturally specific terms:** "Inbox" is widely understood; "Cubbies" or branded terms are not.
- **Test with German and Arabic:** German tests character expansion (labels grow 20-35% in translation); Arabic tests RTL layout (navigation order reverses).
- **Front-loaded distinguishing words survive translation better:** "Project settings" becomes "Projekteinstellungen" in German — the noun stays at the start, preserving scannability.

Navigation labels that are 1-2 words in English are typically still 1-3 words in most European languages. Labels that are 3-4 words in English frequently become 6-8 words in German, breaking sidebar layout. The character budget for navigation labels should be designed for the widest common translation, not the English original.

### Anti-Patterns

1. **The Verb Nav Label.** Navigation items that use verbs: "Configure settings," "Manage team," "View projects," "Browse issues." Navigation items name destinations (nouns), not the actions taken there (verbs). "Manage team" tells the user what they will do, but navigation labels should tell the user where they are going. The verb-as-label pattern also creates visual inconsistency when mixed with noun labels — a sidebar with "Projects / Members / Configure settings / Activity" reads as inconsistent. Fix: convert all navigation labels to nouns.

2. **The Misc Catch-All.** A navigation section labeled "Misc," "Other," "More," or "General" that contains items that do not fit into any other category. Users cannot predict what is inside and avoid it. Product teams that create catch-all categories are usually working around an information architecture problem — the primary categories are wrong, or there are too many primary categories. The fix is to either create a specific category for the displaced items, or combine them with the closest related category and rename.

3. **The Ambiguous Icon-Only.** Icon-only navigation in a collapsed sidebar with no label and no tooltip. The "house" icon might mean "Home" or "Dashboard" or "Overview." The "star" icon might mean "Favorites" or "Starred items" or "Featured." Without labels, users must learn the icon vocabulary through exploration, which creates a barrier for new users and a recurring tax for infrequent users. The fix: always show labels on navigation items, or at minimum show labels on hover. Tooltips are not sufficient for primary navigation — they require hovering over each item to identify it.

4. **The Deep Nest.** Navigation with three or more levels of hierarchy: "Settings / Workspace / Members / Roles / Permissions / Edit." At three levels, users lose track of where they are. At four levels, navigation becomes a maze. The fix is to flatten the hierarchy: move the most important subpages to the top level, merge less-important subpages into their parent, and use in-page tabs or sections for remaining sub-navigation. If the hierarchy genuinely requires depth, use breadcrumbs to show position and ensure every level has a clear parent link.

### Real-World Examples

**GitHub's Repository Sidebar.** GitHub's repository sidebar uses 9 top-level items: Code, Issues, Pull requests, Actions, Projects, Wiki, Security, Insights, Settings. Each is 1-2 words, each is a noun, each names a distinct workflow area. The sidebar is ungrouped but naturally clusters into workflow areas: content (Code), collaboration (Issues, Pull requests), automation (Actions), organization (Projects, Wiki), and administration (Security, Insights, Settings). Users familiar with GitHub can navigate to any section without reading — they scan for the first word of the target item. The sidebar has been stable for years, which means user muscle memory is deeply established.

**Stripe's Dashboard Navigation.** Stripe's sidebar groups navigation items into workflow areas: "Payments" (contains Payments, Customers, Subscriptions, Products), "Connect" (for marketplace products), "Reporting" (contains Reports, Revenue recognition), and "Developers" (contains API keys, Webhooks, Logs). The grouping by workflow rather than alphabetically or by feature type means merchants can find related items without understanding Stripe's internal product taxonomy. Each top-level item and sub-item uses 1-2 words. The navigation is learnable within one or two sessions.

**Linear's Left Rail.** Linear's navigation rail is organized by workspace and project: workspace-level items (Inbox, My issues, Favorites) at the top, followed by project items (Issues, Cycles, Projects, Views, Members, Settings) under each project. The personal vs. project distinction creates a mental model that matches how users think about their work. Label naming is minimal: "Inbox" (one word), "Issues" (one word), "Cycles" (one word). The navigation terminology is Linear-specific ("Cycles" instead of "Sprints") but is introduced during onboarding and consistent throughout.

**Figma's Toolbar Organization.** Figma's toolbar is organized by tool category: move/select tools at the left, shape tools grouped together, text and component tools, and view tools at the right. The organization follows the order in which tools are used in a typical design workflow — from layout (move, frame) to content (shapes, text) to review (zoom, inspect). Navigation labels are not used — the toolbar is icon-only — but the organization follows a left-to-right workflow logic that users can internalize. The tooltip pattern ("Frame (F)", "Rectangle (R)") provides labels on demand without cluttering the toolbar with text.

## Source

- NNGroup — "Navigation Labels: Signposts That Direct People" (2016), https://www.nngroup.com/articles/navigation-labels/
- NNGroup — "Breadcrumb Navigation Increasingly Useful" (2007), https://www.nngroup.com/articles/breadcrumb-navigation-useful/
- Google Material Design — Navigation drawer, https://m3.material.io/components/navigation-drawer/guidelines
- Apple Human Interface Guidelines — Tab bars and navigation, https://developer.apple.com/design/human-interface-guidelines/tab-bars
- Morville, P. & Rosenfeld, L. — _Information Architecture for the Web and Beyond_ (2015), labeling and navigation taxonomy

## Process

1. Audit all existing navigation items and convert any verb labels to noun labels.
2. Verify each label is 1-2 words with the distinguishing word first.
3. Group items into categories of 5-7 items with specific category names (no "Misc" or "Other").
4. Verify breadcrumbs match the exact page title hierarchy — no renaming, no summarization.
5. Test navigation labels against the "search word" test: would a new user type this word into a search bar to find this section?

### Navigation Label Copy Review Checklist

Before shipping navigation labels, verify each item:

| Check                                    | Pass Criteria                                            |
| ---------------------------------------- | -------------------------------------------------------- |
| All labels use nouns, not verbs          | No "Manage," "Configure," "Browse" as primary nav labels |
| Distinguishing word leads each label     | First word is unique and meaningful, not generic         |
| Sidebar/tab labels are 1-2 words         | No label over three words in primary navigation          |
| No catch-all categories                  | No "Misc," "Other," "General" without specific content   |
| Groups contain 5-7 items maximum         | Larger sections are split or reorganized                 |
| Breadcrumbs match exact page titles      | No renaming, no summarization, no skipped levels         |
| Labels pass the search-word test         | A new user would type the label's key word to find it    |
| Icon-only navigation has labels on hover | Tooltips with the label name on all icon-only nav items  |

Navigation label audits should include a card-sorting test with representative users: give users cards labeled with the current navigation items and ask them to sort them into groups they find logical. Discrepancies between user groupings and current navigation reveal mental model mismatches that cannot be found through copy review alone.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- All navigation labels use nouns, not verbs — no "Manage," "Configure," or "Browse" as navigation items.
- Labels are 1-2 words maximum for sidebar and tab navigation.
- The distinguishing word leads each label — no labels starting with a generic qualifier ("Settings for...").
- No catch-all categories ("Misc," "Other," "General") appear in the navigation.
- Breadcrumb labels match the exact page titles at each level of the hierarchy.
- Navigation items are testable by the search-word test: a new user would type the label's key word to find the section.
