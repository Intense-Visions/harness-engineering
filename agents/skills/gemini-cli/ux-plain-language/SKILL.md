# Plain Language for UI

> Plain language for UI — reading level targeting, jargon elimination, sentence structure for scanning

## When to Use

- Writing any user-facing text in a consumer or prosumer product
- Simplifying technical concepts for non-technical users in settings, onboarding, or help text
- Reducing the reading level of existing UI text that tests above grade 10 on Flesch-Kincaid
- Writing help text, tooltips, and inline descriptions that must be understood on first read
- Creating onboarding copy that introduces complex features to new users
- Reviewing UI text that generates support tickets because users misunderstand the language
- Writing error messages that non-technical users must act on without assistance
- NOT for: developer-facing API documentation where technical precision requires domain terminology
- NOT for: internal tooling built exclusively for domain experts who share a specialized vocabulary

## Instructions

1. **Target a sixth-to-eighth grade reading level for consumer products.** The Flesch-Kincaid readability formula measures sentence length and syllable count. A sixth-grade reading level means average sentences of 12-15 words using common two-syllable words. This is not dumbing down -- it is optimizing for speed and comprehension. The Nielsen Norman Group found that even users with graduate degrees prefer content written at a lower reading level because it is faster to process. Use the Hemingway App or readability plugins to measure. Stripe's user-facing text consistently scores at grade 6-8 even when explaining complex payment concepts.

2. **Replace jargon with common words.** Every domain has its jargon, and that jargon feels natural to the team that builds the product. It does not feel natural to the user. Maintain a substitution list and enforce it in code reviews:

   | Jargon       | Plain alternative   |
   | ------------ | ------------------- |
   | utilize      | use                 |
   | initialize   | start               |
   | terminate    | end                 |
   | authenticate | sign in             |
   | configure    | set up              |
   | deploy       | publish             |
   | propagate    | spread / update     |
   | deprecated   | no longer supported |
   | payload      | data                |
   | parameter    | setting / option    |
   | execute      | run                 |
   | instantiate  | create              |
   | invoke       | call / use          |
   | persist      | save                |
   | iterate      | repeat / go through |
   | synchronize  | sync / update       |
   | enumerate    | list                |
   | concatenate  | combine / join      |
   | obfuscate    | hide                |
   | remediate    | fix                 |

   Google's Material Design guidelines explicitly state: "Avoid technical jargon unless it is widely understood by your target audience." Notion calls pages "pages" because that is what users call them. GitHub uses "fork" but defines it on first encounter: "Fork -- create your own copy of this repository."

3. **One idea per sentence.** If a sentence contains a comma followed by a conjunction ("and," "but," "or"), it probably contains two ideas and should be split. "Your trial has expired and you need to upgrade to continue using premium features" becomes "Your trial has expired. Upgrade to keep premium features." The split improves scanning, comprehension, and translation. Translators work sentence by sentence -- compound sentences create ambiguity about which clause modifies which. Stripe's error messages follow single-idea sentences: "Your card was declined." "Try a different payment method."

4. **Prefer concrete nouns over abstract ones.** Abstract nouns force the reader to map the abstraction to something real. "Your uploaded resource" is abstract. "Your file" is concrete. "The authentication credential" is abstract. "Your password" is concrete. "The configuration parameters" is abstract. "Your settings" is concrete. Users think in concrete objects, not in system abstractions. Apple's Human Interface Guidelines consistently use concrete language: "your photo," "your message," "your password" -- never "the media asset," "the communication payload," "the credential."

5. **Use the word the user would search for.** If users search for "dark mode," label the setting "Dark mode" -- not "Appearance theme" or "Display preferences." If users search for "delete my account," the menu item should say "Delete account" -- not "Account deactivation" or "Terminate membership." Google runs search query analysis on their support pages to identify the terms users actually type, then maps those terms directly to feature labels and help articles. This principle extends to error messages: "No internet connection" is what users would type into a search engine, not "Network connectivity unavailable."

6. **Define technical terms on first use when they cannot be avoided.** Some terms have no plain alternative -- "two-factor authentication," "API key," "webhook" are genuinely specialized and the plain alternatives are longer and less precise. When these terms must appear in UI text, define them inline on first use. GitHub does this: "Fork -- create your own copy of this repository." Stripe does this: "API key -- a unique identifier that authenticates requests to Stripe's API." The definition should be one clause or one sentence. If the definition requires a paragraph, link to documentation instead.

7. **Cut nominalizations -- use verb forms over noun forms.** Nominalizations are verbs turned into nouns: "make a decision" instead of "decide," "perform an analysis" instead of "analyze," "send a notification" instead of "notify." Nominalizations add words without adding meaning. They make sentences longer, more abstract, and harder to scan. The fix is mechanical: find the nominalization, extract the verb, rebuild the sentence around the verb.

   | Nominalization (wordy)    | Verb form (concise) |
   | ------------------------- | ------------------- |
   | make a selection          | select              |
   | perform a search          | search              |
   | carry out an installation | install             |
   | give authorization        | authorize           |
   | reach a conclusion        | conclude            |
   | take into consideration   | consider            |
   | provide an explanation    | explain             |
   | make an adjustment        | adjust              |

## Details

### Reading Level Targets by Audience

Different audiences tolerate different reading levels, but the principle is the same: write at the lowest level the content allows.

| Audience                  | Target Grade Level | Sentence Length | Example Product          |
| ------------------------- | ------------------ | --------------- | ------------------------ |
| General consumer          | Grade 6-8          | 12-15 words     | Airbnb, Instagram, Venmo |
| Prosumer / small business | Grade 8-10         | 15-20 words     | Notion, Figma, Shopify   |
| Developer tooling         | Grade 10-12        | 20-25 words     | Stripe API, GitHub API   |
| Enterprise administration | Grade 10-12        | 15-20 words     | AWS Console, Salesforce  |

Even at the developer level, plain language principles apply. Stripe's API documentation is technical but avoids unnecessary complexity: "Create a PaymentIntent" not "Instantiate a PaymentIntent object by invoking the creation endpoint." The technical audience does not need simpler concepts -- they need simpler phrasing of complex concepts.

### Sentence Length Guidelines

Research consistently shows that comprehension drops as sentence length increases:

- **Under 14 words:** 90%+ comprehension on first read
- **14-22 words:** 70-80% comprehension on first read
- **23-30 words:** 50-60% comprehension on first read
- **Over 30 words:** Below 50% comprehension on first read

For UI text, the maximum sentence length should be 20 words. For mobile UI (where screen width constrains line length), target 12-15 words. For tooltips and toasts, target 8-12 words. Count the words in every sentence you write and split anything over the limit.

### The Plain Language Audit

To audit existing UI text for plain language compliance:

1. Extract all user-facing strings from the codebase into a spreadsheet.
2. Run each string through a readability scorer (Flesch-Kincaid or Hemingway).
3. Flag any string above your target grade level.
4. Check flagged strings against the jargon substitution table.
5. Rewrite flagged strings using shorter sentences, simpler words, and concrete nouns.
6. Re-score the rewritten strings to verify improvement.

Gov.uk performed this audit across their entire government website and reduced the average reading level from grade 14 to grade 8. Support ticket volume dropped 30% in the first year after the plain language rewrite.

### Anti-Patterns

1. **The Thesaurus Trap.** Using unusual synonyms to avoid repeating common words. "Utilize" instead of "use" the second time, then "leverage" the third time, then "employ" the fourth. This variety confuses rather than clarifies -- the reader wonders if each synonym means something different. In UI text, consistency trumps variety. If the action is "save," use "save" every time. If the object is "project," call it "project" everywhere. Stripe uses "customer" consistently throughout their entire dashboard -- never "client," "user," or "account holder."

2. **The Legalese Leak.** Legal or compliance language that bleeds into user-facing text. "By proceeding, you acknowledge and agree that the aforementioned data will be processed in accordance with our privacy policy as amended from time to time." No user reads this, and those who try cannot parse it. The fix: write the legal concept in plain language first, then have legal review for accuracy. "We'll use your data as described in our privacy policy" says the same thing in 12 words instead of 30. Apple's privacy labels accomplish this -- "Data Used to Track You" is legally accurate and readable at a fourth-grade level.

3. **The Acronym Soup.** UI text filled with undefined acronyms: "Configure your SSO via SAML or OIDC in the IAM console." Each acronym is a speed bump that forces the reader to decode or search. The rule: spell out every acronym on first use in any given screen. If the screen uses more than two acronyms, the text is too technical for the audience. AWS documentation improves when it says "Single Sign-On (SSO)" on first mention, then uses "SSO" thereafter. For UI text (not documentation), consider whether the acronym is necessary at all -- "Sign in with your company account" may be better than "Configure SSO."

4. **The Passive Abstraction.** Combining passive voice with abstract nouns to create maximally opaque sentences. "The configuration has been updated with the newly specified parameters" instead of "Your settings are saved." "An error was encountered during the processing of your request" instead of "Something went wrong. Try again." These sentences require the reader to mentally restructure the grammar to extract meaning. The fix: find the actor, find the action, put them in subject-verb order with concrete nouns.

### Real-World Examples

**Gov.uk's Plain Language Transformation.** The UK Government Digital Service rewrote the entire gov.uk website using plain language principles. Before: "If you are a foreign national seeking indefinite leave to remain in the United Kingdom, you must demonstrate that you have met the residency requirement." After: "To stay in the UK permanently, you need to have lived here for a certain amount of time." The before version reads at grade 16. The after version reads at grade 8. Both are legally accurate. The plain language version reduced phone calls to the immigration helpline by 35% because users could understand the requirements without assistance.

**Stripe's Error Messages.** Stripe's payment error messages demonstrate plain language under pressure. When a card is declined, users are stressed and need immediate clarity. Stripe's messages: "Your card was declined. Try a different payment method or contact your bank." "Your card's expiration year is invalid." "Your card number is incomplete." Each message names the specific problem and (when possible) provides a specific next action. Compare with a legacy payment processor: "Error code 4001: Transaction declined by issuing bank. Please consult your financial institution regarding the status of your account." Same information, but the plain language version is actionable without decoding.

**Notion's Feature Naming.** Notion's naming conventions demonstrate user-centered vocabulary. The product uses "page" (not "document"), "block" (not "content element"), "template" (not "scaffolding"), "share" (not "publish" or "distribute"), and "comment" (not "annotation" or "feedback item"). Each term was chosen because it maps to a concept users already understand. When Notion introduced databases, they called them "databases" -- a word every user knows -- rather than "structured data collections" or "relational tables." The simplicity of the naming makes a complex product feel approachable.

**Apple's Privacy Labels.** Apple's App Store privacy labels translate complex data collection practices into plain language that any user can understand. Instead of "This application processes personally identifiable information for advertising attribution purposes," Apple's labels say "Data Used to Track You" and "Data Linked to You." Each label category uses a concrete icon and a two-to-four word description. The labels read at a fourth-grade level while remaining legally accurate -- proof that legal concepts can be expressed in plain language without sacrificing precision.

## Source

- plainlanguage.gov -- Federal Plain Language Guidelines, the definitive government standard for clear writing
- NNGroup -- "How Users Read on the Web" (1997, updated 2020), eye-tracking evidence for scanning behavior
- Flesch-Kincaid readability metrics -- standard measurement for reading level assessment
- Gov.uk Content Design Manual -- https://www.gov.uk/guidance/content-design, evidence-based plain language practices
- Krug, S. -- _Don't Make Me Think_ (2014), the case for simple language in interfaces
- Google Material Design -- Writing guidelines, jargon elimination principles
- Hemingway App -- http://hemingwayapp.com, practical readability scoring tool

## Process

1. Read the instructions and examples in this document.
2. Run existing UI text through a readability scorer to establish a baseline.
3. Apply jargon substitution, sentence splitting, and nominalization removal.
4. Re-score rewritten text to verify it meets the target reading level.
5. Verify your implementation against the anti-patterns listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- All user-facing text scores at or below the target reading level for the product's audience.
- No jargon appears in user-facing text without an inline definition on first use.
- Every sentence in UI text contains one idea and is under 20 words.
- Concrete nouns replace abstract ones throughout -- "your file" not "the uploaded resource."
- Support ticket volume related to user confusion decreases after applying these principles.
