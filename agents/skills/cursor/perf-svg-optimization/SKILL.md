# SVG Optimization

> Master SVG optimization — automated minification with SVGO, inline versus external delivery trade-offs, SVG sprite sheet systems, accessibility patterns, rendering performance for complex vector graphics, and icon system architecture.

## When to Use

- SVGs exported from design tools contain unnecessary metadata, comments, and editor artifacts
- An icon system uses individual SVG files causing many HTTP requests
- Inline SVGs bloat HTML document size and prevent caching
- Complex SVGs with many paths cause rendering jank during scrolling or animation
- Lighthouse flags large SVG assets that could be optimized
- SVG icons lack accessibility attributes (title, role, aria-label)
- A design system needs a scalable, performant icon delivery strategy
- SVGs contain embedded raster images or fonts that inflate file size
- SVG animations cause high CPU usage on lower-powered devices
- Migrating from icon fonts to SVG icons for better accessibility and rendering

## Instructions

1. **Optimize SVGs with SVGO.** SVGO removes editor metadata, simplifies paths, and reduces file size by 30-80%:

   ```bash
   # Install and run SVGO
   npx svgo icon.svg -o icon.min.svg

   # Batch optimize a directory
   npx svgo -f src/icons/ -o dist/icons/

   # Show detailed savings
   npx svgo icon.svg --pretty --indent=2
   ```

   ```javascript
   // svgo.config.js — recommended configuration
   module.exports = {
     multipass: true,
     plugins: [
       'preset-default',
       'removeDimensions', // use viewBox instead of width/height
       'sortAttrs',
       {
         name: 'removeAttrs',
         params: { attrs: ['data-name', 'class'] }, // remove editor cruft
       },
       {
         name: 'preset-default',
         params: {
           overrides: {
             removeViewBox: false, // keep viewBox for scalability
             cleanupIds: {
               minify: true,
               remove: false, // keep IDs for sprite references
             },
           },
         },
       },
     ],
   };
   ```

2. **Choose the right delivery method.** Each approach has specific trade-offs:

   ```
   Method           | Cacheable | Styleable | HTTP Requests | HTML Size
   -----------------|-----------|-----------|---------------|----------
   Inline SVG       | No        | Full CSS  | 0             | Increases
   External <img>   | Yes       | None      | 1 per icon    | Minimal
   SVG sprite <use> | Yes       | Limited   | 1 total       | Minimal
   CSS background   | Yes       | None      | 1 per icon    | Minimal
   Data URI         | No        | None      | 0             | Increases
   ```

   **Inline SVG** for icons that need CSS styling (color, hover states) and appear above the fold. **SVG sprites** for icon systems with many icons across the site. **External `<img>`** for complex illustrations that benefit from caching.

3. **Build an SVG sprite sheet.** Combine icons into a single file referenced via `<use>`:

   ```bash
   # Generate sprite with svg-sprite
   npx svg-sprite --symbol --symbol-dest=dist --symbol-sprite=icons.svg src/icons/*.svg
   ```

   ```html
   <!-- icons.svg sprite file -->
   <svg xmlns="http://www.w3.org/2000/svg" style="display:none">
     <symbol id="icon-search" viewBox="0 0 24 24">
       <path d="M15.5 14h-.79l-.28-.27A6.47..." />
     </symbol>
     <symbol id="icon-close" viewBox="0 0 24 24">
       <path d="M19 6.41L17.59 5 12 10.59..." />
     </symbol>
   </svg>

   <!-- Reference icons anywhere in the page -->
   <svg width="24" height="24" aria-hidden="true">
     <use href="/icons.svg#icon-search"></use>
   </svg>
   ```

4. **Make SVGs accessible.** Icons need proper ARIA attributes depending on their role:

   ```html
   <!-- Decorative icon (next to text label): hide from screen readers -->
   <button>
     <svg width="20" height="20" aria-hidden="true" focusable="false">
       <use href="#icon-search"></use>
     </svg>
     Search
   </button>

   <!-- Informational icon (no visible label): provide accessible name -->
   <button aria-label="Search">
     <svg width="20" height="20" role="img" aria-label="Search" focusable="false">
       <use href="#icon-search"></use>
     </svg>
   </button>

   <!-- Complex illustration: use title and desc -->
   <svg role="img" aria-labelledby="chart-title chart-desc">
     <title id="chart-title">Revenue Growth 2024</title>
     <desc id="chart-desc">Bar chart showing 23% year-over-year revenue growth</desc>
     <!-- chart paths -->
   </svg>
   ```

5. **Optimize complex SVGs for rendering performance.** SVGs with thousands of paths cause layout and paint cost:

   ```html
   <!-- Contain rendering cost of complex SVGs -->
   <div style="contain: layout paint; will-change: transform;">
     <svg viewBox="0 0 1000 1000">
       <!-- complex illustration with many paths -->
     </svg>
   </div>

   <!-- Simplify paths: reduce control points -->
   <!-- Before: <path d="M 10.123456 20.789012 C 30.111111..."> -->
   <!-- After:  <path d="M 10.1 20.8 C 30.1..."> -->
   ```

   ```javascript
   // SVGO: reduce path precision
   module.exports = {
     plugins: [
       {
         name: 'preset-default',
         params: {
           overrides: {
             cleanupNumericValues: { floatPrecision: 1 },
             convertPathData: { floatPrecision: 1 },
           },
         },
       },
     ],
   };
   ```

6. **Implement an icon component for consistent delivery.** Abstract the sprite reference into a reusable component:

   ```typescript
   interface IconProps {
     name: string;
     size?: number;
     className?: string;
     title?: string;
   }

   function Icon({ name, size = 24, className, title }: IconProps) {
     const hasTitle = Boolean(title);
     return (
       <svg
         width={size}
         height={size}
         className={className}
         role={hasTitle ? 'img' : undefined}
         aria-label={hasTitle ? title : undefined}
         aria-hidden={hasTitle ? undefined : true}
         focusable="false"
       >
         {hasTitle && <title>{title}</title>}
         <use href={`/icons.svg#icon-${name}`} />
       </svg>
     );
   }

   // Usage
   <Icon name="search" />
   <Icon name="close" title="Close dialog" />
   ```

7. **Remove embedded raster images and fonts.** Design tools sometimes embed base64-encoded PNGs or font subsets inside SVGs:

   ```bash
   # Find SVGs with embedded images
   grep -rl 'image.*base64' src/icons/
   grep -rl '<font' src/icons/

   # These need to be re-exported from the design tool
   # without "include images" or "outline fonts" options
   ```

## Details

### SVG vs Icon Font Comparison

Icon fonts (Font Awesome, Material Icons) were the standard icon delivery method before SVG systems matured. SVGs are superior in every dimension: per-icon loading (icon fonts are all-or-nothing), multi-color support, CSS animation control, accessibility (icon fonts use pseudo-elements that screen readers handle inconsistently), and rendering precision (icon fonts suffer from anti-aliasing artifacts at certain sizes). The only advantage of icon fonts is simpler setup — a single CSS include.

### Worked Example: GitHub Octicons

GitHub's Octicons icon system uses inline SVGs for above-the-fold icons (navigation, status indicators) and an SVG sprite for the full icon set. Each icon is optimized with SVGO to under 500 bytes. The sprite file (~15KB for 250+ icons) is loaded once and cached with a content-hashed filename. Icons use `aria-hidden="true"` when adjacent to text labels and `aria-label` when standalone. The Icon React component enforces these accessibility patterns, making incorrect usage a lint error. Total icon overhead per page: ~2KB inline + 15KB sprite (cached).

### Worked Example: Figma to Production Pipeline

Figma exports SVGs with editor metadata (`data-name`, Figma-specific attributes) that double file size. A production pipeline runs: (1) Export from Figma via API, (2) SVGO with custom config that strips Figma metadata and reduces precision to 1 decimal, (3) Generate sprite sheet with svg-sprite, (4) Generate TypeScript icon name union type from the sprite for type safety. This automated pipeline runs in CI when designers push to the Figma file, ensuring icons are always optimized and type-safe.

### Anti-Patterns

**Inlining large SVGs in every page.** A 20KB inline SVG illustration on every page adds 20KB to every HTML response and is never cached. Use `<img>` or `<object>` for illustrations larger than 2KB so the browser can cache them.

**Using SVGs with embedded raster images.** An SVG containing a base64-encoded PNG is worse than serving the PNG directly: larger file, no responsive image benefits, and the SVG wrapper adds parse overhead.

**Animating SVG properties that trigger layout.** Animating `width`, `height`, `x`, `y`, or path `d` attributes causes layout recalculation on every frame. Use `transform` (translate, scale, rotate) and `opacity` for smooth 60fps animations.

**Not setting viewBox on SVG elements.** Without `viewBox`, SVGs cannot scale proportionally. Always include `viewBox` and remove fixed `width`/`height` attributes (set dimensions via CSS or the parent element instead).

## Source

- SVGO — https://github.com/svg/svgo
- svg-sprite — https://github.com/svg-sprite/svg-sprite
- SVG Accessibility Best Practices — https://www.w3.org/WAI/tutorials/images/complex/
- web.dev: SVG optimization — https://web.dev/articles/reduce-network-payloads-using-text-compression

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- All SVGs are processed through SVGO with appropriate configuration.
- Icon system uses SVG sprites for efficient delivery and caching.
- SVG icons include correct accessibility attributes (aria-hidden or aria-label).
- No SVGs contain embedded raster images or font data.
- Complex SVGs use CSS containment to limit rendering cost.
