# Component Anatomy

> Anatomy of reusable components covering slots, variants, states, sizes, composition vs configuration, compound components, and when to split vs merge.

## When to Use

- Designing a new component's API surface (props, slots, children, events)
- Deciding between a single configurable component and a compound component pattern
- Reviewing a component that has accumulated too many props (the "prop sprawl" problem)
- Determining whether a component should be split into smaller pieces or merged into a larger one
- Establishing component patterns that will scale across a design system with 50+ components

## Instructions

Every reusable component has an anatomy: the structural parts that make it a coherent, predictable unit. Understanding component anatomy means being able to decompose any component into its slots, variants, states, and sizes -- and knowing which of those should be exposed as API surface vs kept as internal implementation.

**The anatomy decomposition procedure:**

1. **Identify the slots.** What distinct content regions does this component have? A card might have: header, media, body, footer. Each slot is a named area that accepts content.
2. **Identify the variants.** What mutually exclusive visual forms does this component take? A button might have: primary, secondary, ghost, danger. Only one variant is active at a time.
3. **Identify the states.** What interactive or data-driven conditions change the component's appearance? A button has: default, hover, active, focus, disabled, loading. States can combine (focused + hover).
4. **Identify the sizes.** What size scale does this component support? A button might support: sm (32px height), md (40px), lg (48px). Sizes should align with the system's spacing scale.
5. **Decide the API model.** Does this component use configuration (props) or composition (children/slots) for each dimension?

## Details

### Slots: Content Regions

A slot is a named content area within a component. Slots determine the component's layout structure and define what content consumers can inject.

**Named slot example -- Shopify Polaris Card:**

```tsx
<Card>
  <Card.Header title="Orders" actions={[{ content: 'Export' }]} />
  <Card.Section>
    <DataTable rows={orders} columns={columns} />
  </Card.Section>
  <Card.Section title="Notes" subdued>
    <TextContainer>Customer notes appear here.</TextContainer>
  </Card.Section>
  <Card.Footer>
    <Pagination hasNext onNext={handleNext} />
  </Card.Footer>
</Card>
```

Polaris's `Card` has four slot positions: Header, Section (repeatable), and Footer. Each is a sub-component that enforces its own internal anatomy while participating in the parent's layout.

**Slot optionality rules:**

- **Required slots:** The component is meaningless without them. A `Dialog` requires a content body.
- **Optional slots:** The component functions without them but gains capability when they are present. A `Card` works without a footer.
- **Repeatable slots:** The slot can appear multiple times. `Card.Section` in Polaris is repeatable; `Card.Header` is not.

GitHub Primer's `ActionList` uses a repeatable item slot with optional sub-slots: `ActionList.LeadingVisual`, `ActionList.Description`, `ActionList.TrailingVisual`. Each item's anatomy is: leading visual (optional) + label (required) + description (optional) + trailing visual (optional).

### Variants: Mutually Exclusive Forms

Variants represent distinct visual or behavioral modes. A component can only be in one variant at a time. Variants are typically expressed as a single prop with enumerated values.

**Material Design 3 Button variants:**

| Variant  | Use Case                          | Visual Treatment                             |
| -------- | --------------------------------- | -------------------------------------------- |
| Filled   | Primary action, high emphasis     | Solid background, `md.sys.color.primary`     |
| Outlined | Secondary action, medium emphasis | 1px border, transparent background           |
| Text     | Tertiary action, low emphasis     | No background, no border                     |
| Elevated | Primary action needing lift       | Solid background + `md.sys.elevation.level1` |
| Tonal    | Secondary action with subtle fill | `md.sys.color.secondaryContainer` background |

Each variant defines its own token mapping for background, text color, border, and elevation. The `variant` prop selects which mapping applies.

**Variant decision criteria:**

- If two appearances share the same slots, states, and sizes but differ in visual treatment, they are variants of one component.
- If two appearances have different slots or fundamentally different behavior, they are different components.
- A `Button` and an `IconButton` share variants (primary, secondary) but differ in slots (text+icon vs icon-only). Material Design 3 treats them as separate components. This is correct: the slot difference changes the component's anatomy.

### States: Interactive and Data Conditions

States represent conditions that change a component's appearance or behavior without changing its identity. Unlike variants, states can combine.

**Complete state matrix for an interactive component:**

| State    | Trigger         | Visual Change                               | Combines With  |
| -------- | --------------- | ------------------------------------------- | -------------- |
| Default  | None            | Base appearance                             | --             |
| Hover    | Mouse enter     | Background lightens/darkens                 | Focus          |
| Active   | Mouse down      | Background darkens further                  | Focus          |
| Focus    | Keyboard tab    | Focus ring (2px, offset 2px, brand color)   | Hover          |
| Disabled | `disabled` prop | 38% opacity, no pointer events              | -- (exclusive) |
| Loading  | `loading` prop  | Spinner replaces content, no pointer events | -- (exclusive) |
| Selected | `selected` prop | Check mark, filled background               | Hover, Focus   |
| Error    | `error` prop    | Red border, error icon                      | Hover, Focus   |

**State combination rules:**

- **Exclusive states** cannot combine with others: disabled, loading.
- **Layered states** combine freely: hover + focus, selected + hover + focus.
- **Data states** (error, selected) persist across interaction states.

Salesforce Lightning defines state tokens per component: `--slds-c-button-color-background-hover`, `--slds-c-button-color-background-active`. Each state has its own token rather than relying on computed modifications (darken by 10%), making states deterministic and themeable.

### Sizes: The Scale Dimension

Components typically support 3-5 sizes that align with the system's vertical rhythm and density. Each size affects height, padding, font size, and icon size proportionally.

**Atlassian Design System button sizes:**

| Size    | Height | Horizontal Padding | Font Size    | Icon Size |
| ------- | ------ | ------------------ | ------------ | --------- |
| compact | 24px   | 4px                | 12px/16px lh | 16px      |
| default | 32px   | 8px                | 14px/20px lh | 20px      |
| large   | 40px   | 12px               | 14px/20px lh | 24px      |

Size should scale all related dimensions proportionally. A common mistake is scaling only height while leaving padding and font size fixed, producing visually unbalanced components.

**When to support custom sizes:** Almost never. If your system needs a 36px button for one specific context, the answer is usually a new size tier (`md-large`) or re-evaluating the layout, not a `height` prop. Escape hatches like `style={{height: 36}}` break system consistency.

### Composition vs Configuration

The fundamental API design decision: does a component accept its content as props (configuration) or as children/sub-components (composition)?

**Configuration model:**

```tsx
<Select
  label="Country"
  options={[
    { value: 'us', label: 'United States' },
    { value: 'ca', label: 'Canada' },
  ]}
  value={selected}
  onChange={setSelected}
/>
```

**Composition model:**

```tsx
<Select label="Country" value={selected} onChange={setSelected}>
  <Select.Option value="us">United States</Select.Option>
  <Select.Option value="ca">Canada</Select.Option>
  <Select.Separator />
  <Select.Option value="other" disabled>
    Other
  </Select.Option>
</Select>
```

**Decision procedure:**

| Criterion                            | Prefer Configuration | Prefer Composition |
| ------------------------------------ | -------------------- | ------------------ |
| Content is uniform data              | Yes                  | --                 |
| Content includes mixed types         | --                   | Yes                |
| Ordering matters semantically        | --                   | Yes                |
| Consumer needs conditional rendering | --                   | Yes                |
| Simple cases dominate (>80%)         | Yes                  | --                 |
| Slots have custom rendering needs    | --                   | Yes                |

Shopify Polaris migrated `ResourceList` from configuration (`items` prop with render callback) to composition (`ResourceList.Item` children) in v12 because consumers needed conditional items, dividers, and custom sub-groups that the configuration model could not express cleanly.

### Compound Components

Compound components are a set of components that work together to form a complete UI pattern, sharing implicit state through context.

**GitHub Primer ActionMenu as compound component:**

```tsx
<ActionMenu>
  <ActionMenu.Button>Menu</ActionMenu.Button>
  <ActionMenu.Overlay>
    <ActionList>
      <ActionList.Item onSelect={handleEdit}>Edit</ActionList.Item>
      <ActionList.Item onSelect={handleDelete} variant="danger">
        Delete
      </ActionList.Item>
    </ActionList>
  </ActionMenu.Overlay>
</ActionMenu>
```

`ActionMenu`, `ActionMenu.Button`, and `ActionMenu.Overlay` share open/close state through React context. The consumer never manages `isOpen` manually.

**When to use compound components:**

- The parts are meaningless alone (`Tab` without `TabList` is nothing)
- Shared state should be implicit (open/close, selected index)
- The assembly order is flexible (header before or after body)

### When to Split vs Merge

**Split a component when:**

- It has more than 8-10 props (Atlassian's heuristic: "if your component's TypeScript interface exceeds the viewport, split")
- Two prop groups never interact (`icon` and `avatar` are never used together -- make `IconButton` and `AvatarButton`)
- A boolean prop changes the fundamental structure (`isInline` that completely reorganizes layout indicates two components)

**Merge components when:**

- Two components share 80%+ of their code and differ only by a variant prop
- Consumers routinely use them together in the same parent (extract the parent as the real component)
- The "split" created artificial prop drilling between the halves

### Anti-Patterns

**Prop sprawl.** A component with 25+ props that tries to handle every possible configuration. Material UI's `TextField` at one point had 30+ props because it merged input, label, helper text, adornments, and validation into one component. The fix: decompose into compound components (`Input`, `InputLabel`, `FormHelperText`) that compose together.

**Boolean prop explosion.** Using boolean props for what should be a variant enum: `isPrimary`, `isSecondary`, `isGhost`, `isDanger`. This allows invalid states (`isPrimary && isSecondary`). Use `variant: 'primary' | 'secondary' | 'ghost' | 'danger'` instead. Shopify Polaris enforces this with TypeScript discriminated unions.

**God component.** A single component that renders differently based on a `type` prop, where each type has a completely different slot structure. If `<Card type="product">` and `<Card type="user">` have different slots, different states, and different sizes, they are not the same component. They share a name but not an anatomy. Split them.

**Implicit slot ordering.** A component that changes behavior based on the order of children without documenting or enforcing that order. If `<Toolbar>` renders differently when `<ToolbarSearch>` is the first child vs the last, that is implicit coupling. Either enforce order with named slots or make order irrelevant.

### Real-World Examples

**Shopify Polaris `Button`** has a clean anatomy: `variant` (5 options), `size` (3 tiers: slim/medium/large with 28px/36px/44px heights), `tone` (critical for destructive variant), `icon` (optional leading/trailing), `loading`, `disabled`. This is 7 props covering 4 anatomical dimensions. They avoid prop sprawl by keeping icon-only buttons as a separate `IconButton` component.

**GitHub Primer `Dialog`** uses compound components: `Dialog`, `Dialog.Header`, `Dialog.Body`, `Dialog.Footer`, `Dialog.CloseButton`. The header slot is optional (some dialogs are headerless alerts). The footer slot supports left-aligned and right-aligned action groups. State (open/close) flows through context. Width is a variant: `small` (296px), `medium` (480px), `large` (640px), `xlarge` (960px).

**Salesforce Lightning `DataTable`** is the canonical complex organism. Its anatomy includes column definitions (with sort, resize, wrap), row selection (single/multi), inline editing, infinite scroll, and column reordering. Rather than 40+ props, it uses composition: `<DataTable>` wraps `<Column>` children, each column defines its own rendering, sorting, and editing behavior.

## Source

Robin Rendle, "Component API Design" (2021). React documentation on Composition vs Inheritance. Radix UI Primitives documentation on compound component patterns. Shopify Polaris component architecture documentation.

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
