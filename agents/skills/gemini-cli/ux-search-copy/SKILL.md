# Search Copy

> Search copy — placeholder text, zero-results messaging, autocomplete hints, search scope indicators, saved search patterns

## When to Use

- Writing placeholder text for search inputs across headers, sidebars, and command palettes
- Designing zero-results states that distinguish no-data from no-match
- Building autocomplete suggestion lists with labels and category headers
- Creating advanced search interfaces with boolean operators and field qualifiers
- Handling search scope -- searching within a project, a team, a document, or the whole product
- Writing saved search patterns, default search names, and search history UI
- NOT for: form field placeholders for data entry (use ux-form-labels)
- NOT for: navigation menus and breadcrumbs (use ux-navigation-labels)
- NOT for: filter interfaces attached to tables (use ux-data-table-copy)

## Instructions

1. **Placeholder text names the scope and shows what can be searched -- not just "Search..."** A bare "Search..." placeholder tells the user nothing about what the search covers or what types of queries it supports. "Search issues, projects, docs..." tells the user three things they can find. "Search by name, email, or team..." shows the query vocabulary. "Search files and folders..." scopes the search to a specific domain. GitHub's global search placeholder reads "Search or jump to..." -- acknowledging that the search bar serves dual function (search and navigation). Notion's quick find says "Search or jump to a page..." -- specific about the object type. The placeholder should answer "what will I find if I type here?" without requiring the user to experiment to discover the search's coverage.

2. **Zero-results copy names what was searched and suggests what to try next.** "No results" is the minimum viable zero-results state. The ideal state names the query, provides context about where was searched, and offers an actionable next step. Pattern: "No results for '[query]' in [scope]. Try [suggestion]." Stripe's search shows: "No results for 'invoic' -- check the spelling or search for a different term." GitHub shows: "We couldn't find any repositories matching 'harnes-engineering' -- did you mean 'harness-engineering'?" The spell-correction suggestion is the highest-value addition to a zero-results state because it resolves the most common cause of zero results -- typos. When the product cannot offer a spell-correction suggestion, offer a scope-expansion suggestion: "No results in this project. Search all projects."

3. **Autocomplete suggestions front-load the matching portion and distinguish result types with labels.** When a user types "pay" into a command palette, the suggestions should show the matching characters bold or highlighted at the start: "**Pay**ment methods," "**Pay**roll settings," "**Pay**outs." Front-loading makes the match scannable -- the user's eye can move down the list comparing only the suffix that differentiates results rather than reading each full suggestion. When autocomplete returns mixed result types (pages, files, people, commands), use category separators: "Pages," "Files," "People" as non-interactive group headers. Notion's quick find separates "Recently visited" from "Best matches." Linear's command palette separates "Actions" from "Pages" from "Issues." Category headers let the user scan to the type of result they want rather than reading every suggestion in order.

4. **Scope indicators appear before the input and persist while the user types.** A scope chip or badge before the search input tells the user the search is constrained before they type -- not after they get unexpected results. The pattern: [Scope badge] [Input] -- "In Acme Corp: Search..." or "This repository: [input]." When the scope can be changed, the scope badge is clickable and shows a dropdown. GitHub's scoped search shows "This repository," "This organization," or "All of GitHub" as a dropdown before the input field. Linear's command palette shows "In Backlog" when opened from the backlog view. The scope must be visible at input focus -- discovering that a search was scoped after getting zero results is a frustrating experience that trains users to distrust the search system, even after the scope issue is understood.

5. **Never use placeholder text as the primary label for a persistent search bar.** Placeholder text disappears the moment the user starts typing, making it useless as a label for users who are mid-query. A persistent search bar (always visible in the header, sidebar, or page) needs either a visible label above it or an accessible `aria-label` attribute. The placeholder in a persistent search bar is supplementary -- it shows scope or example queries, but the element's accessible name comes from the `aria-label`. A search input labeled only via placeholder fails WCAG 2.1 Success Criterion 1.3.5 (Identify Input Purpose). The correct pattern: `<input aria-label="Search issues and projects" placeholder="Search issues, projects, docs... (⌘K)">` where the `aria-label` provides the persistent accessible name and the placeholder provides supplementary scope and shortcut context.

6. **Search shortcut hints belong in the placeholder, not a separate tooltip.** If the search bar is activatable via keyboard shortcut, show the shortcut in the placeholder text: "Search (⌘K)" or "Quick find (Ctrl+P)." This is the highest-visibility location for keyboard shortcut education -- the user sees it every time they look at the search bar, whether or not they are actively using it. Stripe's dashboard search shows "Search (⌘K)" in the placeholder. Linear's command palette shows the shortcut in the sidebar next to the search icon. The shortcut hint should disappear when the user starts typing (it is placeholder text, not a label), so it does not compete with the query the user is constructing. Do not put the shortcut hint in a tooltip or help text -- the barrier to discovering it there is too high for keyboard-first users who benefit most from it.

7. **Saved searches use user-controlled names with system-suggested defaults.** When a search can be saved, the save action should prompt for a name. The system should suggest a name derived from the query: "Issues assigned to Jordan" (from `assignee:jordan is:open`) rather than "Saved search 1." The user should be able to rename it. Saved searches in the sidebar or list should show the query as secondary text below the name, so users can distinguish "High priority this week" from "High priority last month" without opening each saved search to inspect it. GitHub's saved searches (watched repositories, custom views) use user-provided names with the filter query visible on hover. Products that auto-generate names from query syntax give users a head start and reduce the cognitive overhead of naming every saved search manually.

## Details

### Search Input Anatomy

A complete search input has five copyable elements, each with distinct purpose:

| Element               | Purpose                 | Example                           |
| --------------------- | ----------------------- | --------------------------------- |
| Placeholder           | Scope and example query | "Search issues, members, docs..." |
| Scope indicator       | Current search domain   | "In Acme Corp"                    |
| Shortcut hint         | Keyboard activation     | "(⌘K)"                            |
| Zero-results headline | Named query, no match   | "No results for 'invoic'"         |
| Zero-results body     | Cause and next step     | "Check spelling or try 'invoice'" |

Write all five for every search implementation. Missing elements are the most common source of search UX complaints in user research sessions. The zero-results states in particular are often left as an afterthought and shipped with generic copy that fails users at their highest moment of need.

### Advanced Search Query Copy

Products with advanced search syntax (field qualifiers, boolean operators, date ranges) require copy that teaches the syntax without overwhelming casual users. The pattern:

- **Inline example in placeholder:** "author:Jordan is:open created:2024-01-01..today"
- **Syntax help tooltip on focus:** Show a popover with 3-5 common qualifiers and examples
- **Qualifier autocomplete:** When the user types `author:`, autocomplete with team members
- **Query parsing feedback:** As the user types a qualifier, show a chip: `Author: Jordan` indicating the qualifier was recognized

GitHub's issue search, Stripe's API log search, and Linear's advanced filter all use variations of this pattern. The key principle: teach the syntax at the point of use, not in a separate help article. Users who find help articles when encountering search friction are already context-switching out of their workflow -- in-context education at the moment of use keeps them in flow.

### Review Checklist

Use this checklist before shipping or reviewing any search implementation:

| Check                     | Criteria                                        | Pass Condition                                                                |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Placeholder specificity   | Names scope or searchable entity types          | Not just "Search..." -- includes 2-3 entity types or qualifier examples       |
| Scope indicator           | Scope visible before user types                 | Scope badge or label appears at input focus, not only after zero results      |
| Shortcut hint             | Keyboard shortcut shown in placeholder          | "(⌘K)" or equivalent appears in placeholder text when shortcut exists         |
| Accessible label          | `aria-label` or visible `<label>` present       | Placeholder alone is not the accessible name; input has persistent aria-label |
| Zero-results: query named | Zero-results state names the query              | "No results for '[query]'" not just "No results"                              |
| Zero-results: next step   | Zero-results state offers actionable suggestion | Spell-correction, scope-expansion, or filter-clear suggestion provided        |
| Autocomplete categories   | Mixed result types use section headers          | "Pages," "People," "Actions" headers separate result types                    |
| Saved search names        | System suggests names from query syntax         | Auto-generated names from qualifiers, not "Saved search 1"                    |

### Anti-Patterns

1. **The Generic Placeholder.** A search input that says only "Search..." with no scope or example. Before: placeholder text "Search..." in a product with 12 searchable entity types. After: "Search issues, projects, and docs..." or "Search by name, tag, or status..." The generic placeholder is the most common search copy failure because it is the default state that ships without a content review. It communicates nothing about what is searchable, creates uncertainty about what will be returned, and misses the opportunity to teach users about the breadth of the search system at the exact moment they are deciding whether to use it.

2. **The Empty Zero-State.** Zero-results states that show a blank space, just "No results," or an illustration with no text. Before: "No results" with an empty state illustration. After: "No results for 'harnes-engineering' -- check the spelling or try searching in all repositories." The difference between a helpful zero-results state and an unhelpful one is whether the user knows what to do next. An illustration without copy adds visual decoration but no information. A user who hits zero results is at peak frustration -- this is the moment when clear, specific copy has the highest impact on whether they persist or abandon.

3. **The Scope Surprise.** A search that is scoped without telling the user, where they discover the scope only after getting zero results. Before: search input with no scope indicator, scoped to the current project. After: "In Project Apollo: Search issues..." with a clickable scope badge that expands to "Search all projects." Scope surprises are particularly damaging in products with hierarchical data (projects > teams > workspaces) where the user's mental model of "global" vs "local" search is ambiguous. After a scope surprise, users often assume the search system is broken or the data does not exist, when in fact both the data and the search work correctly -- the scope was simply not what the user expected.

4. **The Placeholder Label.** A search input whose placeholder text is its only label -- the element has no `aria-label` and no visible `<label>` element. Before: `<input placeholder="Email address">` with no associated label. After: `<input aria-label="Search team members" placeholder="Search by name, email, or role...">`. The placeholder disappears on input, making the field unlabeled for users who have already started typing. Screen readers announce the accessible name, not the placeholder -- a search input with only placeholder text is announced as "edit text" with no context. WCAG 2.1 requires that all form inputs have persistent accessible labels; placeholder text does not satisfy this requirement and the violation is caught in standard accessibility audits.

### Real-World Examples

**GitHub search with scope indicators.** GitHub's search is the most complex search UX in the developer tools space because it spans repositories, users, organizations, code, commits, and issues -- all searchable with different syntax. The scope dropdown ("This repository / This organization / All of GitHub") is the key UX decision that makes the complexity manageable. When a user is inside a repository and opens search, the default scope is that repository, shown explicitly before the input. The user can expand scope with one click. Zero-results states in repository search show: "We searched through the entire repository history and couldn't find any matching code." The "entire repository history" phrasing reassures the user that the absence of results means the code genuinely does not exist, not that search failed or was scoped too narrowly.

**Linear command palette.** Linear's command palette (opened via ⌘K) is the product's primary navigation, search, and action surface. The placeholder text is "Search or run a command..." -- acknowledging dual function. Autocomplete separates result types with labeled sections: "Actions," "Navigate to," "Issues," "Projects." The matching is fuzzy -- "crt iss" matches "Create issue" -- and the matched characters are highlighted in the suggestion. The shortcut hint for each action appears right-aligned in the suggestion row: "⌘⏎" for "Create and open." Linear's command palette is a benchmark for products where power users prefer keyboard-driven interaction, demonstrating that a search input can serve as the primary control surface for an entire product when the placeholder, scope, and autocomplete are all designed with intent.

**Stripe Dashboard search.** Stripe's search bar (⌘K) is scoped to the user's current account by default and shows scope context: "Search in [Account name]." The zero-results state for a customer search shows: "No customers found for '[query]'. Check the name or email, or try searching by customer ID." The suggestion to try customer ID is learned behavior from Stripe's support data -- the most common reason for zero results in customer search is that the user is searching by a name they stored differently from how Stripe indexed it. Stripe also shows "Recent searches" and "Recent customers" in the search dropdown before the user types -- reducing the need for typing in the most common use cases and making the search bar a navigation shortcut as much as a search tool.

**Notion quick find.** Notion's quick find (⌘P or ⌘K) searches across pages, databases, and linked databases in the current workspace. The placeholder is "Search or jump to a page..." -- "jump to" captures the navigation use case distinct from content search. Results are separated into "Recently visited" (no typing required) and "Best matches" (as the user types). Each result shows the page title, its parent in the hierarchy (e.g., "Team Space > Engineering"), and a relative timestamp. The hierarchy path is the critical detail -- Notion pages are nested, and a page named "Notes" could exist in 12 different parent pages. Without the hierarchy path, the user cannot distinguish search results with identical names and must open each to determine which is the correct one.

### Copy Formulas Quick Reference

These are fill-in-the-blank templates for the most common search copy patterns:

- **Placeholder (entity types):** `Search [entity type 1], [entity type 2], [entity type 3]...`
- **Placeholder (qualifiers):** `Search by [qualifier 1], [qualifier 2], or [qualifier 3]...`
- **Placeholder with shortcut:** `Search [scope]... ([shortcut])`
- **Scope indicator:** `In [Workspace / Project / Repository]: Search...`
- **Scope dropdown label:** `This [repository / project / organization]` or `All of [product name]`
- **Zero-results headline:** `No results for '[query]'`
- **Zero-results body (typo):** `Check the spelling or try a different term.`
- **Zero-results body (scope):** `Try expanding to all [entity types] across [product].`
- **Zero-results with suggestion:** `Did you mean '[corrected query]'?`
- **Autocomplete category header:** `[Entity type]` -- e.g., "Pages," "People," "Actions," "Issues"
- **Saved search suggested name:** `[Entity type]s [qualifier description]` -- e.g., "Issues assigned to Jordan, open"
- **Saved search list display:** `[Name] · [query summary]` -- e.g., "High priority · assignee:me priority:high"

## Source

- NNGroup -- "Search: Visible and Simple," https://www.nngroup.com/articles/search-visible-and-simple/
- NNGroup -- "Solr Search: Dealing with No Search Results," https://www.nngroup.com/articles/no-results/
- Morville, P. and Callender, J. -- _Search Patterns_ (2010), O'Reilly Media
- WCAG 2.1 Success Criterion 1.3.5 -- Identify Input Purpose, https://www.w3.org/WAI/WCAG21/Understanding/identify-input-purpose.html
- Stripe -- Dashboard search UX (observable via product)
- GitHub -- Search syntax documentation, https://docs.github.com/en/search-github/searching-on-github

## Process

1. **Define the search scope for this implementation.** Determine what entity types are searchable (issues, users, files, commands), what the default scope is (current project, all projects, global), and whether the user can change scope. Write the scope indicator copy and scope dropdown labels before writing the placeholder -- the scope shapes all other copy decisions. Confirm the scope behavior with the engineering team, because scoping behavior is often determined by backend indexing decisions that product and design may not be aware of.

2. **Write the placeholder text using the correct pattern.** Use "Search [entity types]..." when the scope is broad and entity types are the key information. Use "Search by [qualifiers]..." when the search is structured and qualifier vocabulary is the key information. Include the keyboard shortcut if the input is shortcut-activatable. Keep the placeholder under 50 characters so it does not overflow on smaller viewports.

3. **Write the zero-results state with four elements.** Every zero-results state needs: the named query ("No results for '[query]'"), the scope that was searched ("in this project" or "across all repositories"), the most likely cause (spell check, scope mismatch, filter conflict), and a suggested next step (try a different term, expand scope, clear filters). Review the most common zero-results queries in analytics before writing the suggestions -- product-specific data produces better suggestions than generic advice.

4. **If the search supports advanced syntax, write the qualifier autocomplete prompts.** For each field qualifier (author:, assignee:, status:, date:), write the autocomplete prompt that appears when the user types the qualifier prefix. Confirm with engineering which qualifiers are supported and what values are valid. Write inline syntax examples for the top 3-5 most-used qualifiers and place them in the syntax help popover that appears on focus. Test the popover on mobile -- popovers that are too large obscure the input on small screens.

5. **Define the saved search naming pattern.** Determine how the system generates suggested names from query syntax. Write the naming template: "Issues [qualifier description]" -- for example, "Issues assigned to Jordan, open" from `assignee:jordan is:open`. Confirm the rename interaction (inline edit or modal), the saved search list display format (name + query summary), and the maximum number of saved searches per user. Write the empty state for the saved search list ("No saved searches yet. Run a search and save it for quick access.") and the tooltip for the save action ("Save this search to your sidebar").

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Every search input has a placeholder that names the scope or searchable entity types -- not just "Search..." -- so users know what they can find before they type.
- Zero-results states name the query that was searched, the scope that was covered, and offer a specific next step -- not just "No results."
- Search scope is visible before the user types (via a scope badge or label at focus), not discovered only after receiving zero results.
- All search inputs have accessible labels (`aria-label` or visible `<label>`) independent of placeholder text, satisfying WCAG 2.1 SC 1.3.5.
- Autocomplete suggestions separate result types with labeled category headers when mixed entity types are returned, so users can scan to the type of result they want.
- Keyboard shortcut hints are included in placeholder text when the search bar is shortcut-activatable, making shortcut discovery zero-friction for all users.
- Saved searches display system-suggested names derived from query syntax and show the query as secondary text in the saved search list for disambiguation.

## Voice Search and Mobile Search Considerations

Voice-activated search inputs require placeholder text that acknowledges the voice input mode when active. On activation, the placeholder transitions from "Search issues..." to "Listening..." and then to a visual waveform or "Speak now" indicator. When voice recognition completes, the recognized query populates the input and the search executes, but a "Did you mean [query]?" prompt should appear if confidence is below a threshold -- the same spell-correction pattern applied to typed queries, but applied to recognition confidence.

Mobile search inputs with a soft keyboard require careful copy density. The search results dropdown on mobile has roughly half the horizontal space of desktop, which means autocomplete suggestion text must be shorter. Apply the same entity-type and category conventions as desktop, but truncate suggestion text to 30-40 characters and use abbreviations where standard (e.g., "Proj." for "Project" in category headers). Test autocomplete suggestions on a physical device at the smallest supported screen size before shipping.

Search within embedded contexts (search inside a modal, search inside a drawer panel, search within a command palette) requires scoping copy that reflects the constrained context. A search inside a "Add team members" modal should read "Search people..." not "Search..." -- the scope is already implied by the modal's purpose, but the placeholder still benefits from naming the entity type. In constrained contexts where the scope indicator would compete visually with the input, embed the scope in the placeholder: "Search team members by name or email."
