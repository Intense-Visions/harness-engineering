# Data Table Copy

> Data table copy — column headers, empty cells, truncation patterns, filter and sort labels, bulk action copy

## When to Use

- Writing column headers for any tabular data view: issue lists, transaction tables, user rosters, audit logs
- Defining empty cell conventions across a table or design system
- Building filter interface labels and filter chip copy
- Writing bulk action patterns for selected rows
- Designing sort controls and accessible sort indicators
- Handling empty table states (zero rows, filtered-to-zero, loading, error)
- NOT for: forms with multiple fields (use ux-form-labels)
- NOT for: single-item detail pages and record views
- NOT for: card-based layouts where each item is a distinct visual unit

## Instructions

1. **Column headers use nouns or short noun phrases -- not verb phrases or full sentences.** A column header is a label for a category of data, not a sentence describing the data. "Status" not "Current status of the item." "Assigned to" not "Who this is assigned to." "Last modified" not "Date this was last modified." Linear's issue list uses "Priority," "Status," "Assignee," "Due date" -- each a precise noun phrase. The test: read the column header and ask whether the column contains instances of that noun. If yes, the header is correct. If the answer is "the column contains information about [noun]," the header is too verbose.

2. **Align the grammatical form of the header with the content of its cells.** A column header and its cell values should form a coherent pair when read together. A boolean column with "Yes/No" values should be headed "Active" not "Is active?" (the question form implies a boolean, but the interrogative is unnecessary). A column with date values should be headed "Created" not "Created on" (the preposition is implied by the date format). Stripe's transaction table uses "Amount" over currency values, "Status" over "Pending/Succeeded/Failed," and "Description" over merchant names -- each header matches the semantic type of its values.

3. **Truncate long text with an ellipsis and reveal the full value on hover -- never silently cut data.** When cell content exceeds the column width, truncation is necessary, but silent truncation (cutting the string with no indicator) is a data integrity problem. The user cannot tell whether the value ends at the visible characters or continues. Use trailing ellipsis (`...`) as the truncation indicator, and show the full value in a tooltip on hover. For critical data fields like names, URLs, or identifiers, consider making the column resizable. GitHub's pull request title column truncates long titles with `...` and shows the full title in a tooltip. Airtable uses truncation with an expand control to view the full cell value.

4. **Empty cells use an em dash (--) not "N/A," "None," "null," or a blank space.** "N/A" means not applicable -- but most empty cells are simply unpopulated, not inapplicable. "None" is ambiguous: does it mean no value was entered, or was "none" explicitly selected? A blank space is the worst option because the user cannot tell if the cell is empty or if the value is whitespace. The em dash (--) is a neutral, universally understood indicator of absent data. It is visually distinct from actual content without suggesting any semantic meaning about why the data is absent. This convention is used by Stripe, Linear, and GitHub consistently across their data tables.

5. **Filter labels use the noun they filter, followed by the current value -- not a verb phrase.** "Status: All" not "Filter by status: All." "Assignee: Anyone" not "Filter assignees." "Date range: This month" not "Filter by date range." The noun identifies what is being filtered; the value shows what is currently active. When no filter is active, use a neutral term: "All," "Anyone," "Any," "All time" -- not "None" (which implies filtering to zero) or leaving the value blank. Linear's filter bar shows "Priority: All," "Status: All," "Assignee: All" -- each filter chip reads as [dimension]: [current value], making the active state unambiguous.

6. **Bulk action buttons name both the action and the count of affected items -- never use "Delete selected."** "Delete selected" is ambiguous when the selection count changes. Does "Delete selected" delete 1 item or 100? Make the count explicit: "Delete 3 issues," "Archive 12 transactions," "Export 47 rows." GitHub's bulk actions in issue lists show "Mark as X" with the count in the selection checkbox header. Airtable shows "Delete 5 records" in its bulk action bar. When the count is zero (no selection), the bulk action bar should not appear or all bulk action buttons should be disabled -- never show "Delete 0 items."

7. **Sort direction indicators need accessible text labels in addition to visual arrows.** An up arrow next to a column header is conventionally understood as "sorted ascending" in some contexts and "sorted descending" in others. The convention is not universal. Use `aria-label` on the sort button to convey both the current sort dimension and direction: "Sorted by Date, newest first" or "Sort by Status, ascending." The visible label can be abbreviated (an arrow icon), but the accessible name must be explicit. Linear's column sort headers announce "Sort by Priority descending" to screen readers even though the visible indicator is an icon. This also applies to the next sort state: "Click to sort by Date, oldest first."

## Details

### Column Header Grammar Reference

Consistency in header grammar prevents the visual noise of mixed grammatical forms across a single table. Choose one pattern and apply it to every column in the table:

| Header Type          | Correct Form                       | Avoid                                            |
| -------------------- | ---------------------------------- | ------------------------------------------------ |
| Category noun        | "Status," "Priority," "Type"       | "Item status," "Priority level," "Type of issue" |
| Possessive attribute | "Owner," "Author," "Assignee"      | "Assigned to," "Owned by"                        |
| Timestamp            | "Created," "Modified," "Due"       | "Created on," "Last modified date," "Due date"   |
| Quantity             | "Comments," "Attachments," "Votes" | "Number of comments," "Attachment count"         |
| Boolean              | "Active," "Public," "Verified"     | "Is active," "Publicly visible," "Is verified?"  |
| Calculated           | "Progress," "Completion," "Score"  | "Progress percentage," "% complete"              |

For tables with mixed data types (a user roster that has both date columns and category columns), use the per-type conventions above rather than forcing a single grammatical pattern onto all columns.

### Empty State Hierarchy

Data tables have four distinct empty states, each with different copy needs:

1. **First-time empty** -- The user has never added data. Show a call to action: "No issues yet. Create your first issue to start tracking work." Include a primary action button.
2. **Filter-to-zero** -- Active filters exclude all data. Show the filter context: "No issues match 'Priority: High + Assignee: Jordan'. Clear filters to see all issues." Include a "Clear filters" link.
3. **Permission empty** -- The user lacks access to view data that exists. Do not show empty state copy; surface the permission state (see ux-permission-access-copy).
4. **Error empty** -- Data failed to load. Show an error message with retry: "Couldn't load issues. Check your connection and try again." Include a "Retry" button.

Each state requires different copy and different actions. Using a single generic empty state message across all four conditions is the most common data table copy failure.

### Anti-Patterns

1. **The Verbose Header.** Column headers that describe rather than name. Before: "Current status of the item," "Date this was last modified," "Who this task is assigned to." After: "Status," "Modified," "Assignee." Verbose headers reduce the column width available for actual data and make the table header row visually dominant over the data rows it should support.

2. **The Blank Cell.** Empty cells left blank or filled with "N/A," "None," "null," or "--" (double hyphen). Before: empty string, or "N/A" for an unset due date. After: em dash (--). The em dash is a design system convention, not a character choice left to individual developers. Establish it as a standard and apply it via a shared cell renderer component so the convention is enforced, not remembered.

3. **The Silent Truncation.** Text that is cut at the column boundary with no indicator that truncation occurred. Before: "Redesign the user onboarding exp" (cut without indicator). After: "Redesign the user onboarding exp..." (with tooltip showing "Redesign the user onboarding experience for new enterprise customers"). The user must always know that more data exists, and must have a way to see it.

4. **The Ambiguous Bulk Action.** Bulk action buttons that do not state what they will affect. Before: "Delete selected," "Archive selected," "Export." After: "Delete 4 rows," "Archive 4 rows," "Export 4 rows." A secondary issue: bulk action buttons that remain active when nothing is selected. The bulk action bar should appear only when at least one row is selected, and the count should update in real time as the selection changes.

### Real-World Examples

**Linear issue list columns.** Linear's issue table uses a consistent noun-phrase column convention: "Priority," "Title," "Status," "Assignee," "Due date," "Estimate," "Labels." The most interesting design decision is the "Title" column -- it is wide enough to show most issue titles without truncation, and on overflow it truncates with `...` and shows a popover with the full title and description on hover. The filter bar above the table uses [Dimension]: [Value] chips: "Assignee: Jordan," "Status: In Progress." Clearing all filters shows "Assignee: All," "Status: All" -- the filter UI never disappears, it just returns to its neutral state.

**GitHub pull request table.** GitHub's PR list table has evolved over a decade into one of the most information-dense data tables in the developer tools space. The key column decisions: "Title" (long, with author, labels, and review status as sub-elements), "Reviewers" (avatars with a count overflow), "Assignees" (same), "Milestone," "Updated" (relative time like "2 hours ago" with absolute time in a tooltip). Empty cells in "Milestone" and "Assignees" are handled with nothing -- not an em dash -- which is a deliberate exception because these fields appear alongside inline "assign" links. The column exception proves the rule: empty cell conventions can be overridden when an inline action replaces the absent value.

**Stripe transaction list.** Stripe's transaction table is the benchmark for financial data tables. Columns: "Amount" (right-aligned, always showing currency symbol and two decimal places), "Description" (merchant name with logo), "Date" (absolute date with relative time on hover), "Status" ("Succeeded," "Failed," "Pending" as colored badges). The filter UI uses dropdown chips: "Status: All," "Date: Last 30 days," "Amount: Any." The bulk export uses "Export [n] transactions" with the count dynamically reflecting the current filter state -- so exporting a filtered view is always explicit. Empty states distinguish between "No transactions" and "No transactions matching your filters" with different CTAs.

**Airtable column naming.** Airtable is unique because users name their own columns -- but the product's default field names teach naming conventions. A new table starts with "Name," "Notes," "Assignee," "Status," "Due date" -- all noun phrases. Airtable's column type system enforces grammatical consistency: a date field cannot be named "What date is this due?" without a warning, because the field type renders dates in a specific format that would conflict with the question-form label. The field name conventions are also enforced by the formula system -- fields named with special characters or ambiguous names cause formula errors, creating a technical incentive for clean naming.

## Source

- NNGroup -- "Data Tables: Four Major User Tasks," https://www.nngroup.com/articles/data-tables/
- Babich, N. -- "Designing Better Data Tables," UX Planet (2017)
- Google Material Design -- Data tables, https://m3.material.io/components/data-tables/overview
- W3C WAI -- Tables tutorial, https://www.w3.org/WAI/tutorials/tables/
- Stripe -- Design system documentation (internal), referenced via public Stripe Docs UI patterns
- Airtable -- Field naming conventions, https://support.airtable.com/docs/field-types-overview

## Process

1. Audit all column headers for grammatical form. Standardize to noun phrases and establish the convention in the design system as a shared component spec.
2. Define the empty cell convention for the product (em dash or equivalent). Implement it as a shared cell renderer so the convention is enforced at the component level, not remembered by individual developers.
3. Inventory all text columns that can overflow. For each, define truncation behavior: max character count, ellipsis style, and hover/expand mechanism.
4. Write filter chip labels using [Dimension]: [Value] format. Define the neutral value for each filter (All, Anyone, Any time) and the zero-results copy for each filtered state.
5. Write bulk action labels with explicit counts. Define the selection state that shows vs. hides the bulk action bar, and ensure count updates in real time.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- All column headers in the table use noun phrases, not verb phrases or full sentences.
- Empty cells use a consistent convention (em dash) established at the component level, not case by case.
- All text truncation shows an ellipsis indicator and surfaces the full value on hover or expand.
- Filter labels use the [Dimension]: [Value] format with explicit neutral values when no filter is active.
- Bulk action buttons display the count of affected items and are hidden or disabled when no rows are selected.
