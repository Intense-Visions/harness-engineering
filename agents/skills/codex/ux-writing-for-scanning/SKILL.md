# Writing for Scanning

> Writing for scanning — F-pattern, front-loading keywords, chunking, bullet vs prose decisions for UI text

## When to Use

- Writing any UI text longer than one sentence -- descriptions, help text, feature explanations
- Designing help pages, knowledge base articles, and in-app documentation
- Creating feature descriptions for settings pages, marketing pages within the app, and changelogs
- Writing changelog entries, release notes, and update summaries
- Composing email notifications, digest emails, and alert messages that users process in seconds
- Organizing lists of features, permissions, or options in preference panels
- Reviewing existing UI text that users report as "too long" or "hard to find things"
- Structuring API documentation, developer guides, and technical reference material for quick lookup
- Designing pricing pages and feature comparison tables for rapid evaluation
- NOT for: legal text where completeness and precision override scannability
- NOT for: creative writing, brand storytelling, or marketing copy where engagement requires linear reading

## Instructions

1. **Front-load the keyword in every line.** Users scan the first two words of any text element -- eye-tracking research from NNGroup confirms this consistently. The distinguishing word must come first. "Export data" is scannable because "Export" is the keyword. "Click here to export your data" buries the keyword at word four. In a list of actions, front-loaded keywords let the user find the right option by scanning only the left edge:

   | Front-loaded (scannable) | Back-loaded (not scannable)       |
   | ------------------------ | --------------------------------- |
   | Export data              | Click here to export your data    |
   | Delete project           | Would you like to delete this?    |
   | Notification settings    | Settings for your notifications   |
   | Billing history          | View your past billing statements |
   | Team members             | Manage people in your team        |

2. **Use the F-pattern.** Eye-tracking studies show that users read web content in an F-shaped pattern: they read the first line fully, then scan the left edges of subsequent lines. This means the first line of any text block gets the most attention, and subsequent lines are only scanned at their left margins. Design for this: put the most important information in the first line, and ensure that each subsequent line starts with a meaningful keyword. GitHub's repository file listing exploits the F-pattern: file names (the keywords) are on the left edge, and metadata (size, last modified) is on the right where scanning eyes may not reach.

3. **Bullets over prose when listing three or more items.** A five-item paragraph is unreadable. A five-item bulleted list is instantly scannable. The threshold is three: if you are listing three or more items, use bullets. Below three, inline text is acceptable. This is not about aesthetics -- it is about cognitive processing. Bullets create visual separation between items, allowing the user to process each item independently. Stripe's pricing page uses bullets for feature lists: "Unlimited API calls," "Real-time webhooks," "3D Secure authentication." Each feature is instantly identifiable.

4. **Chunk text into groups of three to five related items.** George Miller's research on working memory suggests that humans process information most effectively in chunks of three to seven items. For UI text, the practical limit is three to five. A settings page with 20 ungrouped options overwhelms. The same 20 options in four groups of five are manageable. Each group should have a label that names the category. Slack's notification preferences chunk options into groups: "Activity in channels," "Direct messages," "Mentions," "Threads" -- each group contains three to five specific settings.

5. **Use bold for scannable anchors.** One bolded term per paragraph gives the scanning eye a landing point. The bolded word should be the keyword that tells the user what the paragraph is about. If a user scans a page and reads only the bolded words, they should get a summary of the page's content. This document uses this technique: each instruction starts with a bolded principle that can be read independently of the explanation that follows. Apple's support articles use bold for key terms within paragraphs, creating a scannable path through dense content.

6. **Keep paragraphs to three sentences maximum in UI context.** A paragraph in a novel can be a page long. A paragraph in UI text should be three sentences at most. If the paragraph is longer, it should be split into smaller paragraphs, converted to a bulleted list, or moved behind a progressive disclosure control. Mobile screens make this constraint even tighter: on a phone, a three-sentence paragraph can fill the viewport. Notion's feature descriptions follow this rule: each explanation is two to three sentences, with whitespace between paragraphs that communicates "new thought."

7. **Use parallel structure in lists.** Every bullet in a list should start with the same part of speech. If the first bullet starts with a verb, every bullet starts with a verb. If the first starts with a noun, every bullet starts with a noun. Parallel structure allows the scanning eye to skip the repeated pattern and focus on the unique content. The three most common parallel patterns in UI text are: verb-first for action lists ("Create projects," "Assign members"), noun-first for feature lists ("Unlimited storage," "Priority support"), and adjective-first for attribute lists ("Fast deployment," "Secure hosting").

   | Parallel (scannable)  | Non-parallel (jarring)             |
   | --------------------- | ---------------------------------- |
   | - Create projects     | - Create projects                  |
   | - Assign team members | - Team members can be assigned     |
   | - Track progress      | - For tracking progress            |
   | - Export reports      | - Reports are available for export |

8. **Whitespace is content.** A blank line between groups communicates "new topic" faster than any heading. Whitespace is not wasted space -- it is a scanning aid that allows the eye to distinguish between groups, sections, and individual items. Remove whitespace and the page becomes a wall of text regardless of how well the individual sentences are written. GitHub's issue list uses whitespace between issues to make each item individually identifiable. Stripe's transaction list uses alternating backgrounds and consistent spacing to achieve the same effect.

## Details

### The F-Pattern in Practice

The F-pattern has three components, each of which has implications for UI writing:

**Horizontal bar 1 (top).** Users read the first line or heading of a text block almost completely. Implication: the first line must contain the most important information. If a settings description starts with "This feature allows you to..." the user has already read eight words before encountering the actual feature name.

**Horizontal bar 2 (middle).** Users read a second horizontal line partway through the content, typically shorter than the first. Implication: if you have two key points, put the second one at the visual midpoint of the text block, not at the end.

**Vertical bar (left edge).** Users scan the left edge of subsequent lines. Implication: every line must start with a meaningful keyword. Indent and whitespace on the left edge break the scanning pattern.

The F-pattern degrades when content is well-formatted with clear headings, bolded anchors, and bulleted lists -- users switch to a more thorough scanning pattern because the formatting signals that the content is worth reading. This is the goal: writing for scanning does not mean writing less, it means formatting so that scanning is productive.

### Bullet vs Prose Decision Matrix

| Condition                                  | Use bullets    | Use prose |
| ------------------------------------------ | -------------- | --------- |
| Listing 3+ discrete items                  | Yes            | No        |
| Comparing features or options              | Yes            | No        |
| Steps in a process (ordered)               | Yes (numbered) | No        |
| Explaining a concept that requires context | No             | Yes       |
| Providing a narrative explanation          | No             | Yes       |
| Listing 1-2 items inline                   | No             | Yes       |
| Describing cause and effect                | No             | Yes       |
| Listing prerequisites or requirements      | Yes            | No        |

The most common mistake is using prose for lists. The second most common mistake is using bullets for explanations that require connective tissue between ideas. Bullets remove the relationship between items -- each bullet is processed independently. When the relationship matters (cause and effect, sequence, contrast), prose preserves it.

### Character-Count Guidelines by Component

Scanning speed is directly related to text length. These guidelines ensure that each component type is sized for scanning:

| Component          | Characters | Words | Scanning time |
| ------------------ | ---------- | ----- | ------------- |
| Sidebar label      | 15-25      | 1-3   | < 1 second    |
| Button             | 10-25      | 1-4   | < 1 second    |
| Tab label          | 10-20      | 1-2   | < 1 second    |
| Tooltip            | 40-80      | 5-12  | 2-3 seconds   |
| Toast notification | 40-120     | 5-15  | 3-5 seconds   |
| Card description   | 80-150     | 10-20 | 5-8 seconds   |
| Help text block    | 150-300    | 20-40 | 8-15 seconds  |
| Changelog entry    | 200-400    | 25-50 | 10-20 seconds |

### Anti-Patterns

1. **The Prose Block.** A feature description, help article, or settings explanation written as a single dense paragraph with no headings, no bullets, no bold text, and no whitespace breaks. The user sees a wall of text and skips it entirely. This is the most common scanning anti-pattern and the most damaging: users who need the information will not read it, and users who do not need it are annoyed by the visual weight. The fix: break every paragraph longer than three sentences into smaller chunks. Convert lists embedded in prose into actual bullet points. Add one bolded anchor per paragraph.

2. **The Endless List.** A bulleted list with 15 or more items and no subcategories. The list was created to aid scanning, but at this length, it defeats the purpose -- the user cannot hold 15 items in working memory and must scroll repeatedly to find the one they need. The fix: group the items into subcategories of three to five items each. Add a subheading for each group. If the items cannot be grouped, consider whether a different presentation (table, grid, search) would serve better.

3. **The Buried Keyword.** Text where the distinguishing word is in the middle or end of the line instead of at the beginning. "Click on the settings icon to configure your notification preferences" buries "notification preferences" at the end. "Notification preferences" should be the first two words. The fix: restructure every line so the keyword comes first. "Notification preferences -- click the settings icon to configure." Or better: remove the instruction entirely and just label the link "Notification preferences."

4. **The False Parallel.** A list that appears to use parallel structure but breaks it partway through. The first three bullets start with verbs: "Create projects," "Assign members," "Track progress." Then the fourth bullet says "Reports can be exported." The break in parallel structure is jarring and slows scanning because the user's pattern-matching fails. The fix: commit to one grammatical structure for the entire list and do not deviate.

### Real-World Examples

**GitHub's Changelog Format.** GitHub's changelog entries demonstrate structured scanning at scale. Each entry has a date heading, a category label (Features, Bug fixes, Changes), and bullet points that front-load the affected feature: "Pull requests -- added ability to convert to draft." The category label allows users to skip entire sections (a user looking for bug fixes can skip the Features section). The front-loaded feature name allows scanning within a category. The result: a user can scan a month of changes in under 30 seconds and find the one entry relevant to them.

**Notion's Slash-Command Menu.** Notion's "/" command menu is a masterclass in scannable labeling. Each command is a front-loaded keyword: "To-do list," "Heading 1," "Toggle list," "Quote," "Divider," "Code." No command starts with a verb phrase or explanation. The commands are grouped into categories: "Basic blocks," "Media," "Database," "Embeds." The grouping plus front-loaded labels means a user can find any command with one visual scan of the category labels and one scan of the items within the correct category.

**Stripe's API Documentation.** Stripe's API documentation applies scanning principles to technical content. Each endpoint starts with a one-sentence description that front-loads the action: "Create a customer," "Retrieve a payment intent," "List all charges." Code examples are chunked into labeled blocks (curl, Ruby, Python, Node). Parameters are listed in a table with the parameter name (keyword) on the left edge. Required parameters are visually distinguished from optional ones. The result: a developer can find the right endpoint, understand its purpose, and locate the specific parameter they need in under 60 seconds.

**Linear's Issue List Scanning.** Linear's issue list is designed for rapid scanning by engineering teams who process dozens of issues daily. Each issue row front-loads the issue identifier (LIN-1234) followed by the title. Status, priority, and assignee are encoded as compact icons on the left edge -- the scanning eye can process them without reading text. Labels appear as colored chips after the title. The list groups issues by status (Backlog, Todo, In Progress, Done) with clear section dividers. A user can scan 50 issues and find the ones relevant to them in under 10 seconds because every scanning aid is present: front-loaded identifiers, visual status encoding, chunked grouping, and parallel structure across rows.

## Source

- NNGroup -- "F-Shaped Pattern for Reading Web Content" (2006), the foundational eye-tracking study
- NNGroup -- "How Users Read on the Web" (1997, updated 2020), evidence that users scan rather than read
- Miller, G.A. -- "The Magical Number Seven, Plus or Minus Two" (1956), working memory capacity research
- Krug, S. -- _Don't Make Me Think_ (2014), practical scanning optimization for web content
- Google Material Design -- Writing guidelines, content structure for scanning
- Redish, J. -- _Letting Go of the Words_ (2012), writing for the web with scanning-first principles
- NNGroup -- "How People Read Online: New and Old Findings" (2020), updated scanning behavior research
- Apple Human Interface Guidelines -- Writing section, text brevity and structure guidelines

## Process

1. Read the instructions and examples in this document.
2. Audit existing text for front-loaded keywords, parallel structure, and appropriate chunking.
3. Convert prose blocks to bulleted lists where listing three or more items.
4. Apply the F-pattern: most important information first, keywords on left edges.
5. Verify your implementation against the anti-patterns listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Every text element front-loads its keyword in the first two words.
- Lists of three or more items use bullets, not embedded prose.
- All bulleted lists use parallel grammatical structure.
- No paragraph in UI context exceeds three sentences.
- Text blocks are chunked into groups of three to five related items with category labels.
- Bold anchors appear in every paragraph longer than one sentence.
- Changelog and release note entries use category labels and front-loaded feature names.
- Tables are used for structured comparisons; bulleted lists for unordered items; numbered lists for sequential steps.
- Whitespace separates groups visually -- no section runs into the next without a clear break.
