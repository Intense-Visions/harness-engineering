# Design Intent: Neon AI

> Modern, AI-forward, and tech-centric design system for the Harness Engineering dashboard and documentation.

## Aesthetic Direction

- **Style**: **Neon AI / Tech Forward**. High-contrast dark mode with vibrant accent colors. Uses "Glassmorphism" for dashboard surfaces (translucency + subtle borders).
- **Tone**: **Precise, energetic, and efficient**. Focuses on code-readability and AI state visualization.
- **Differentiator**: Deep integration of monospace typography for code-first environments and high-intensity neon colors for AI-driven feedback loops.

## Usage Guidelines

### Colors

- **Primary (Electric Indigo)**: Used for primary calls to action, active navigation states, and core brand elements.
- **Secondary (Cyber Cyan)**: Used for AI status indicators, data visualization accents, and secondary highlights.
- **Neutral (Zinc/Stone)**: The foundational layer. `#09090b` for the main background and `#18181b` for elevated cards/surfaces.
- **Semantic Colors**: Stick strictly to `success`, `warning`, and `error` for system feedback to maintain clarity against the vibrant brand palette.

### Typography

- **Headings**: Use Inter (Semi-bold). Keep letter-spacing tight (`-0.02em`) for a modern, compact look.
- **Body**: Use Inter (Regular). Ensure line-height is at least `1.5` for documentation readability.
- **Code/Mono**: Use JetBrains Mono for all code snippets, terminal outputs, and AI-generated text.

### Spacing

- Use the 4px grid.
- **Component Padding**: `sm` (8px) for tight elements, `md` (16px) for standard cards.
- **Layout Gaps**: `lg` (24px) between main dashboard widgets.

## Anti-Patterns

- **No Light Mode**: This system is optimized for high-contrast dark environments. Do not implement a standard "light" theme without specific re-coloring.
- **No Heavy Shadows**: Use subtle, thin borders (`#27272a`) instead of heavy box-shadows to define surfaces.
- **No Gradients on Text**: Keep typography solid and readable. Limit gradients to decorative UI elements or AI-activity "auras."

## Platform Notes

- **Web**: Map tokens to Tailwind CSS colors or CSS Variables (`--color-primary-500`).
- **Dashboard**: Use `backdrop-filter: blur(8px)` on surface elements for the "Glass" effect.
