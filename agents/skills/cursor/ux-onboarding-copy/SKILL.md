# Onboarding Copy

> Onboarding copy — progressive disclosure, value-first framing, reducing anxiety, and welcome flows that convert sign-ups into active users

## When to Use

- Writing welcome screens and first-run experiences for new users
- Creating setup wizard step descriptions and progress indicators
- Writing feature discovery tooltips and coach marks during initial use
- Composing trial or freemium upgrade prompts that appear during onboarding
- NOT for: empty states after onboarding is complete (see ux-empty-states)
- NOT for: tooltip and contextual help patterns outside onboarding (see ux-tooltip-contextual-help)

## Instructions

1. **Lead with value, not features.** The user's first question is "What's in it for me?" not "What can this product do?" "Start tracking your team's progress" answers the user's question. "Welcome to ProjectTool v3.2, featuring over 40 productivity-enhancing features" does not. Slack's onboarding: "You're all set. Now invite your team." -- the instruction points immediately to value (team collaboration) rather than feature enumeration. Every onboarding headline should complete the sentence: "After this step, you'll be able to..."

2. **One action per screen.** Multi-step wizards must focus each step on a single decision or input. The moment a screen asks the user to do two things simultaneously, one of them will not get done. Notion's onboarding asks one question per screen: "What will you use Notion for? / Learning / Work / Personal" -- one question, multiple-choice, no text input. Stripe's business setup wizard sequences role, business type, and business details across separate screens rather than a single long form.

3. **Show progress transparently.** "Step 2 of 4" removes the anxiety of not knowing how much time remains. Never hide the total number of steps. Showing "Step 2 of 4" communicates both current position and scope -- the user can commit because they understand the investment. If you cannot show a linear step count because the flow is branching, use a progress bar or phase indicators ("Profile," "Team," "Preferences") with the current phase highlighted. Figma's onboarding uses a visual step map that shows all phases upfront.

4. **Use progressive disclosure -- do not explain everything on the first screen.** Introduce concepts and features when the user first encounters them, not in a pre-use overview. Figma does not explain layers, components, and frames before the user opens a file -- it introduces each concept through contextual coach marks the first time the user encounters the relevant UI. A product tour that runs before the user has any context for what they are seeing is the onboarding equivalent of reading a manual before touching the product.

5. **Reduce anxiety about reversibility.** "You can change this later in Settings" removes commitment paralysis at every decision point. Users will rush through setup or abandon if they believe they are making permanent choices. Stripe's onboarding reassures at each step: "You can update your business details anytime." Airbnb's listing setup says "Don't worry -- you can edit this later" on every section. The reversibility note should appear immediately after the input or question, not in a small disclaimer at the bottom of the screen.

6. **Make skipping available on non-critical steps.** "Skip for now" should be a clearly visible, secondary option on every optional step. Forced completion of optional steps drives abandonment, especially on mobile. Linkedin, Spotify, and GitHub all offer prominent skip options on profile completion, recommendation setup, and optional integrations during onboarding. The skip option should not be hidden in small text -- it should be a proper secondary button or link that is easy to find without feeling like a failure to complete.

7. **Celebrate completion -- do not just end.** The final onboarding screen should confirm that setup is complete, express genuine enthusiasm appropriate to the product's voice, and point to the first real action. "You're ready. Create your first project." Slack: "Your workspace is set up. Time to explore." The completion screen is the onboarding team's last opportunity to establish positive sentiment before the user enters the product for the first time. A silent redirect to the dashboard wastes that opportunity.

## Details

### Onboarding Flow Types

Three distinct onboarding patterns, each with different copy requirements:

**Setup wizard:** Sequential screens that collect required information before first use. Stripe, Shopify, and Airbnb use this for merchant/host setup where the product cannot function without certain data. Copy for setup wizards must be maximally efficient -- each field must justify its presence, and unnecessary questions must be removed. Every screen should have a single, specific title ("Tell us about your business"), one primary input group, and a progress indicator.

**Progressive coach marks:** Contextual callouts that appear as the user encounters interface elements for the first time. Figma, Notion, and Linear use this approach. Coach mark copy must be brief (under 60 characters), tied to a specific element the user can see, and offer a single action ("Try it" or "Got it"). The coach mark appears at the moment of relevance, not upfront.

**Contextual discovery:** Inline prompts and suggestions that appear as the user performs actions, surfacing advanced features only when the user is ready for them. GitHub's contextual CLI hints appear after several terminal commands, suggesting GitHub CLI as a faster workflow. This approach requires no separate onboarding flow -- learning happens within the product's natural use.

### Step Copy Structure

Each wizard step needs four text elements:

| Element            | Purpose                               | Length        | Example                              |
| ------------------ | ------------------------------------- | ------------- | ------------------------------------ |
| Step title         | Name the decision or action           | 3-8 words     | "Tell us about your team"            |
| Step description   | Explain why this step matters         | 1-2 sentences | "We'll use this to suggest features" |
| Progress indicator | Show position and scope               | Step N of M   | "Step 2 of 4"                        |
| Primary CTA        | Name the next action specifically     | 2-4 words     | "Set up your team"                   |
| Skip option        | Offer graceful deferral (if optional) | 2-4 words     | "Skip for now"                       |

The step description is optional for self-explanatory steps. If the title is clear ("Add your profile photo"), the description may add only noise. Only include the description when the step's purpose or consequence is non-obvious.

### Anxiety Reducers

Three patterns that eliminate onboarding abandonment from commitment fear:

**Reversibility statements:** "You can change this later." Appears immediately after an input or decision, not in a footer disclaimer. Reduces commitment paralysis on decisions that feel permanent.

**Social proof:** "Join 40,000 teams already using [product]." Reduces the fear of making the wrong choice by normalizing the decision. Works best on product selection or plan selection screens.

**Time estimates:** "Takes about 2 minutes." Reduces abandonment from unknown time investment. Accurate estimates build trust; inaccurate ones destroy it. If the estimate is uncertain, use "usually takes 2-3 minutes" to set a range.

### Anti-Patterns

1. **The Feature Tour.** Walking users through every feature before they can use the product -- a 12-screen slideshow of features, screenshots, and capabilities that runs before the user touches anything real. Feature tours have low completion rates because users cannot make sense of features they have never seen in context. The fix: get the user to first value as fast as possible, then introduce advanced features contextually through coach marks and progressive disclosure.

2. **The Commitment Trap.** Forcing users to make irreversible decisions during onboarding without a "change later" option. "Choose your username (cannot be changed)" or "Select your plan (changes take effect at next billing cycle)" without any alternative. Users encountering permanent decisions during onboarding will hesitate, second-guess, and frequently abandon. Every onboarding decision should either be reversible, or be framed with the exact process for changing it later ("Contact support to change your username").

3. **The Information Dump.** Presenting all settings, options, and configuration choices on a single screen rather than sequencing them progressively. A single-screen setup form with 15 fields is not an onboarding wizard -- it is a registration form disguised as onboarding. The cognitive load of 15 simultaneous decisions drives abandonment. The fix: identify which 3-5 pieces of information are truly necessary for first use, sequence them as separate screens, and defer everything else to in-product settings with clear pointers.

### Real-World Examples

**Slack's Workspace Setup Flow.** Slack's onboarding asks three questions across three screens: name, workspace name, and first teammate to invite. Each screen has a single input, a progress indicator, and a specific next button ("Next: Set your username"). The final screen is an invitation screen, not a feature tour -- Slack understands that the first step to product value is inviting a team member. The onboarding ends not with a walkthrough but with an action that creates immediate value.

**Notion's Personalization Onboarding.** Notion asks "How are you planning to use Notion?" with four choices (Personal use, School, Work, Teams). This single question branches the subsequent experience -- Work users see team templates, Personal users see personal planning templates. One question, branching value. The personalization is used immediately (template recommendations), proving its relevance and building trust in the onboarding process.

**Stripe's Business Verification Wizard.** Stripe's onboarding for new merchants is thorough because it has to be -- regulatory requirements mandate identity verification. Stripe makes this explicit: "We're required by law to verify your identity." The transparency turns a friction-heavy requirement into a trust signal. Each verification step includes a progress indicator, an explanation of why the information is needed, and a privacy statement. High-friction onboarding can succeed when the friction is explained and justified.

**Figma's Interactive Tutorial.** Figma's first-time experience is a design file containing the tutorial -- the user learns by doing within the actual product, not in a separate tour layer. The tutorial uses coach marks that point to real UI elements: "Click the Move tool in the toolbar." The immediate feedback loop (click the thing, see it work) is more effective than any amount of explanation. Features are introduced in order of frequency: move, select, resize, then more advanced operations. The user finishes the tutorial having used the product, not just having watched it.

## Source

- NNGroup — "User Onboarding UX Patterns" (2019), https://www.nngroup.com/articles/onboarding-ux/
- Samuel Hulick — _The Elements of User Onboarding_ (2013), value-first onboarding philosophy
- Appcues — State of User Onboarding (annual report), https://www.appcues.com/state-of-user-onboarding
- Podmajersky, T. — _Strategic Writing for UX_ (2019), onboarding copy frameworks

## Process

1. Map each step of the onboarding flow to one of the three flow types (setup wizard, coach marks, contextual discovery).
2. Write a value-first headline for each wizard step that names the outcome, not the action.
3. Add reversibility statements after any decision point that might create commitment paralysis.
4. Ensure progress is always visible: step count, phase indicator, or progress bar.
5. Write a completion screen that confirms success and directs to the first high-value action.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Each wizard screen contains exactly one decision or input, with a single primary CTA.
- Every step shows transparent progress (step count, phase indicator, or progress bar).
- Reversibility statements appear after every non-trivial decision point.
- The completion screen confirms success and points to the first real product action.
- Optional steps offer a visible, non-stigmatizing skip option.
