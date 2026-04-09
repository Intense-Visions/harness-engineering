# Data Visualization Design

> Data visualization principles — chart type selection, color encoding, annotation strategy, Tufte's data-ink ratio, accessible charts, avoiding chartjunk, and small multiples for comparison

## When to Use

- Choosing which chart type to use for a given dataset and analytical question
- Designing dashboard visualizations that communicate data clearly without decoration
- Applying color to data encodings in a way that is both meaningful and accessible
- Adding annotations, labels, and legends to charts without creating clutter
- Evaluating existing charts against Tufte's data-ink ratio principle
- Designing charts that are accessible to colorblind users and screen reader users
- Using small multiples to compare datasets without overloading a single chart
- Building a data visualization component library for a design system

## Instructions

1. **Select chart type by analytical task, not by data shape.** The correct chart type depends on what question the viewer is answering, not on what the data looks like in a spreadsheet. Use this decision procedure:

   | Analytical Task                  | Chart Type                    | Why                                                     |
   | -------------------------------- | ----------------------------- | ------------------------------------------------------- |
   | Compare values across categories | Horizontal bar chart          | Length is the most accurate visual encoding             |
   | Show trend over time             | Line chart                    | Position along continuous axis reveals trajectory       |
   | Show part-to-whole relationship  | Stacked bar or treemap        | Area/length within a whole — NOT pie charts (see below) |
   | Show distribution                | Histogram or density plot     | Reveals shape, skew, outliers                           |
   | Show correlation                 | Scatter plot                  | Two-axis position reveals relationship                  |
   | Show geographic patterns         | Choropleth or dot-density map | Spatial encoding matches spatial data                   |
   | Compare many metrics at once     | Small multiples (see step 7)  | Separate panels share axes, enable comparison           |
   | Show composition over time       | Stacked area chart            | Area encodes part-to-whole as it evolves                |
   | Show ranked items                | Sorted horizontal bar chart   | Pre-sorted bars eliminate cognitive sort work           |
   | Show flow or conversion          | Sankey or funnel chart        | Width encodes volume through stages                     |

   Stripe's financial dashboards use line charts for revenue trends, horizontal bar charts for payment method breakdowns, and stacked area charts for revenue composition by product. Each chart type matches the analytical task, not a generic "make a chart" impulse.

2. **Maximize the data-ink ratio.** Edward Tufte's data-ink ratio principle: the proportion of ink (pixels) that represents actual data values should be as high as possible. Every non-data pixel needs justification. Concrete removals:
   - **Remove chart borders/boxes.** The chart area does not need a bounding rectangle. The axes and data define the space.
   - **Lighten or remove gridlines.** If gridlines are needed, use light gray (`#E5E7EB` or 15% opacity) and only horizontal gridlines on bar/line charts. Remove vertical gridlines unless the chart is a scatter plot.
   - **Remove redundant labels.** If the axis label says "Revenue ($)" and every data point has a tooltip, you do not also need value labels on every bar.
   - **Remove 3D effects.** 3D perspective on bar charts and pie charts distorts data perception. A bar that appears taller due to perspective projection is not taller in data terms. Always use 2D.
   - **Remove decorative fills.** Gradient fills, texture patterns, and pictographic fills (the "infographic" style) reduce data readability. Use flat, solid fills.

   Before: a chart with a gray border, crosshatched gridlines, 3D perspective, gradient fills, a decorative icon, and a legend that repeats axis labels. Data-ink ratio: ~30%. After: the same chart with only axes, data marks, and a direct title. Data-ink ratio: ~80%. The second chart communicates faster because there is less non-data visual processing.

3. **Encode data with color deliberately, not decoratively.** Color in data visualization is a data encoding channel — it maps data values to visual perception. Three color scale types:
   - **Sequential** — Low-to-high values. Single hue, varying lightness. Example: revenue from $0 (light blue `#E0F2FE`) to $1M (dark blue `#1E3A5F`). Use for heatmaps, choropleths, any single-variable intensity.
   - **Diverging** — Values diverge from a meaningful midpoint. Two hues with neutral center. Example: profit/loss where zero is white, profit is green, loss is red. Use when a natural midpoint exists (zero, average, target).
   - **Categorical** — Distinct categories. Maximally distinguishable hues at similar lightness. Example: product lines each assigned a distinct color. Limit to 5-7 categories — beyond this, colors become indistinguishable.

   Concrete palette construction for categorical encoding: start with the brand primary, then add colors at ~60-degree hue intervals around the color wheel, matched for lightness (~50-60 OKLCH lightness). Stripe's data visualization palette: violet (primary), teal, orange, pink, gray — 5 colors at equivalent perceptual weight.

   Critical rule: never use a rainbow/spectral color scale for sequential data. The rainbow scale (red-orange-yellow-green-blue-violet) has perceptual non-uniformities — yellow appears brighter than blue at the same data value, creating phantom "hot spots." Use a single-hue or multi-hue sequential scale designed for perceptual uniformity (viridis, cividis, or a custom OKLCH-based scale).

4. **Annotate to direct attention, not to add information.** Annotations (callout labels, reference lines, trend indicators) serve as reading instructions. They tell the viewer where to look and what to notice. Principles:
   - **Annotate the insight, not the data.** A label that says "Revenue: $4.2M" is data. A label that says "Revenue peaked in Q3 before holiday spending dipped" is insight. The second is more valuable.
   - **Use direct labels instead of legends when possible.** Place the series label at the end of each line in a multi-line chart, right next to the data it describes. This eliminates the legend-to-data lookup that wastes 2-3 seconds per series. The Financial Times and The New York Times use direct labels on nearly all their charts.
   - **Limit annotations to 1-3 per chart.** More than three annotated points creates visual noise equivalent to no annotation at all.
   - **Use consistent annotation styling.** Pick one annotation style: a thin leader line (1px, 40% opacity) connecting a text box (12px, regular weight, muted color) to the data point. Never mix arrows, circles, boxes, and underlines in the same chart.

   Stripe's dashboard charts annotate exactly one thing: the current period's total, displayed as a large number above the chart. The chart itself shows the trend; the annotation answers "what is the number right now?"

5. **Design for colorblind accessibility from the start.** Approximately 8% of men and 0.5% of women have color vision deficiency. Charts that rely solely on red-green distinction exclude these users:
   - **Never use red and green as the only differentiator.** For profit/loss, use blue (profit) and orange (loss) instead. Both are distinguishable by all common color vision types.
   - **Add a non-color encoding.** Use pattern fills (diagonal hatching for negative, solid for positive), shape differentiation (circles for one series, squares for another), or direct labels alongside color.
   - **Test with a CVD simulator.** Sim Daltonism (macOS), Color Oracle (cross-platform), or Figma's built-in vision simulation. Run every chart through deuteranopia (red-green, most common) and protanopia simulations before shipping.
   - **Use perceptually uniform palettes designed for CVD.** The `viridis` palette (matplotlib default) was designed to be readable by all common color vision types. Cividis was designed specifically for CVD accessibility. Both are freely available.

   Concrete test: export your chart, convert to grayscale. If any two data series become indistinguishable in grayscale, they need a non-color differentiator.

6. **Avoid chartjunk — decoration that adds no data value.** Tufte's term for visual elements that consume ink/pixels without encoding data. Specific examples:
   - **Pictographs and icons in bar charts** — A bar chart where each bar is a stack of dollar-sign icons. The viewer cannot compare heights accurately because the icons create perceptual noise. Use plain rectangular bars.
   - **Excessive tick marks** — A y-axis with tick marks at every $100 increment from $0 to $10,000. Use $0, $2,500, $5,000, $7,500, $10,000 — 5 ticks instead of 100.
   - **Background images** — A photo of a city skyline behind a bar chart showing city population. The photo competes with the data for visual attention.
   - **Animated transitions for static data** — Bars that bounce, lines that draw themselves, numbers that count up. Acceptable for presentation decks (one-time viewing). Harmful for dashboards (repeated viewing where animation becomes friction).

7. **Use small multiples for comparison across many categories.** Small multiples (also called trellis or panel charts) repeat the same chart structure with different data subsets, one per panel. They are the solution to the "spaghetti chart" problem — a single line chart with 12 overlapping series that is unreadable.

   Design rules for small multiples:
   - **Shared axes.** Every panel must use the same x-axis range and y-axis range. If one panel's y-axis goes to 100 and another's goes to 50, comparison is invalid.
   - **Minimal per-panel chrome.** Remove redundant axes — only the leftmost column needs a y-axis, only the bottom row needs an x-axis. All other panels show only data marks and a panel title.
   - **Panel titles are data.** Each panel is labeled with the category it represents (country name, product name, cohort ID). The title is the legend.
   - **Grid layout.** Arrange panels in a grid, typically 3-4 columns wide. More than 6 columns becomes too narrow to read. Fewer than 2 wastes space.

   The Financial Times uses small multiples extensively: 12-panel grids showing GDP growth for each Eurozone country, each panel a sparkline with shared axes. A viewer can instantly spot which countries diverge from the group pattern — something impossible in a single 12-line chart.

## Details

### Axis Design and Scale Decisions

Axis design carries hidden editorial choices. A y-axis that starts at 0 vs. one that starts at the data minimum can change the visual story dramatically:

- **Bar charts must start at zero.** Bar length encodes value. A bar chart starting at 95% instead of 0% can make a 97% vs. 95% difference look like 97% vs. 0% — a visual lie.
- **Line charts may start above zero** when the purpose is showing change, not absolute magnitude. A line chart of stock price starting at $190 rather than $0 is standard because the analytical interest is the trend shape, not the absolute level.
- **Time axes should use consistent intervals.** Do not mix daily, weekly, and monthly data points on the same axis. Irregular intervals distort the visual perception of rate-of-change.
- **Use log scale when data spans orders of magnitude.** COVID case counts from 1 to 10,000,000 are unreadable on a linear scale. Log scale makes exponential growth appear linear, which is sometimes the desired insight. Always label "Log Scale" prominently.

### Dashboard Composition

A dashboard is not a collection of charts — it is a narrative structure. Design principles:

- **One primary metric, visible without scrolling.** The single most important number should be the largest text element on the page. Stripe's dashboard leads with "Gross volume" in 32px bold.
- **Inverted pyramid of detail.** Top: the headline metric. Middle: trend chart showing that metric over time. Bottom: breakdowns and supporting tables. Users who need the overview stop at the top; users who need detail scroll down.
- **Consistent time range across all charts.** If the revenue chart shows "Last 30 days," the transaction volume chart must also show "Last 30 days." Mismatched time ranges cause false correlations.
- **Progressive disclosure.** The dashboard surface shows summary charts. Clicking a chart opens a detailed view with additional breakdowns, filters, and export options. Do not cram detail into the summary view.

### Anti-Patterns

1. **Pie Charts for Comparison.** Using pie charts to compare values across 8+ categories. Humans are poor at comparing angles and areas — we perceive a 30-degree slice vs. a 35-degree slice as identical. Fix: replace pie charts with horizontal bar charts. Bars use length (the most accurate visual encoding) instead of angle (one of the least accurate). The only defensible use of a pie chart is showing a simple two-part split (60/40) where the approximate proportion matters more than precise values.

2. **Dual Y-Axes.** A single chart with two y-axes (left and right) encoding different metrics. The visual correlation between the two lines is entirely determined by the axis scales — you can make any two datasets appear correlated by adjusting the y-axis ranges. Fix: use two separate charts stacked vertically with shared x-axes. This preserves time alignment without implying correlation through scale manipulation.

3. **Rainbow Color Scales.** Using a full-spectrum rainbow palette for sequential data (heatmaps, choropleths). The rainbow has perceptual non-uniformity: the yellow band appears brighter than the green and blue bands at the same data value, creating phantom "hot zones." Additionally, it is inaccessible to colorblind users. Fix: use a perceptually uniform sequential scale (viridis, cividis, or single-hue lightness ramp).

4. **Truncated Y-Axes on Bar Charts.** A bar chart where the y-axis starts at 990 instead of 0, making a difference between 995 and 1000 look like a 100% increase. Fix: bar charts must always start at zero because bar length encodes absolute value. If the interesting variation is small relative to the baseline, use a line chart (which may start above zero) or annotate the difference directly.

5. **Overcrowded Legends.** A legend with 15 color swatches for 15 data series, none of which are distinguishable. The viewer spends more time matching legend colors to chart lines than reading the data. Fix: if you have more than 5-7 series, use direct labels (text at the end of each line) or small multiples (one panel per series). Eliminate the legend entirely when direct labels are feasible.

### Real-World Examples

**Stripe — Data-Ink Purity in Financial Dashboards.** Stripe's payment dashboards exemplify Tufte's principles: no chart borders, light horizontal gridlines at 10% opacity, no 3D effects, flat solid fills with brand colors, and a single annotated metric (the current value) per chart. The line charts use 2px stroke weight with no data point markers (markers at every data point create visual clutter). Hover interaction reveals precise values — the default state shows only the shape and trend. Key lesson: dashboard charts should answer "what is the trend?" at a glance; precise values are available on interaction.

**The New York Times — Annotation as Journalism.** NYT graphics use annotation as editorial guidance: a chart of COVID cases has a callout "Delta variant emerges here" at the inflection point. The annotation transforms a generic line chart into a narrative. NYT charts also consistently use direct labels instead of legends, eliminating the color-matching cognitive load. Their categorical palettes are designed for print (CMYK-safe) and screen, maintaining distinction in both media. Key lesson: the best data visualizations tell the viewer what to notice, not just what the data is.

**Material Design — Chart Component System.** Material Design's data visualization guidelines define chart components as a system: consistent corner radius on bars (4px), consistent color token usage (primary, secondary, tertiary map to data series in order), consistent axis typography (12sp, medium weight, on-surface-variant color), and consistent interaction patterns (hover for tooltip, click for drill-down). The system ensures that a bar chart and a line chart on the same dashboard page feel like siblings, not strangers. Key lesson: data visualization needs a component system just as much as buttons and inputs do.

**GitHub — Contribution Graph as Iconic Visualization.** GitHub's contribution graph (the green squares) is one of the most recognizable data visualizations in technology. It is a calendar heatmap: 52 columns (weeks) by 7 rows (days), with a 4-step sequential green scale (none, light, medium, dark). The simplicity is the design: no axes, no labels, no legend text — just color intensity on a known calendar structure. Key lesson: when the data structure is intuitive (calendar), you can strip nearly all chart chrome and let pattern recognition do the work.

### Table vs. Chart Decision

Not all data belongs in a chart. Tables are superior when:

- **Precision matters more than pattern.** If the user needs to read exact values (an invoice, a permission matrix, individual account balances), a table with aligned numbers is faster than a chart with hover tooltips.
- **The dataset is small.** Fewer than 5 data points do not benefit from visual encoding — the chart chrome (axes, labels, grid) consumes more space than the data. Use a simple stat display or table row.
- **Heterogeneous data types.** When each row contains mixed types (text + number + status + date), a table handles the heterogeneity naturally. A chart would need multiple encoding channels.
- **Comparison is row-by-row.** If the user compares attributes of individual items (feature comparison matrix, product specs), a table with aligned columns enables horizontal scanning that charts cannot replicate.

Decision procedure: if the user's question is "what is the exact value of X?" — use a table. If the question is "what is the trend/pattern/distribution?" — use a chart. Many dashboards need both: a chart for the overview, a table below for detail drill-down.

### Responsive Data Visualization

Charts on mobile devices face severe constraints:

- **Width compression.** A 12-month bar chart that looks clean at 800px becomes unreadable at 320px. Solutions: reduce to 6 months with a "show more" control, switch from bars to a sparkline, or rotate the chart to use vertical scrolling for the category axis.
- **Touch targets.** Interactive chart elements (data points, legend items, filter controls) must meet the 44x44pt minimum touch target. A scatter plot with 200 data points at 4px radius is unusable on mobile. Solutions: increase point radius to 8px with overlap tolerance, or switch to a density heatmap at small viewports.
- **Annotation legibility.** Annotations at 11px font size are illegible on mobile. Scale annotation text to at minimum 14px on mobile viewports, or hide annotations behind a tap-to-reveal interaction.
- **Simplification, not scaling.** Never simply scale a desktop chart to mobile width — the proportions break. Design a separate mobile chart composition: fewer data points, larger elements, simplified annotations, and vertical orientation when the horizontal axis has many labels.

### Number Formatting in Charts

Consistent number formatting prevents misreading:

- **Abbreviate large numbers.** Y-axis labels of "$1,000,000" create clutter. Use "$1M" with a clear axis title: "Revenue (USD, millions)." Stripe abbreviates all dashboard values above $999 to K/M/B notation.
- **Use locale-aware formatting.** The decimal separator is a period in the US (1,234.56) and a comma in Germany (1.234,56). Charts serving international users must format numbers according to the viewer's locale. Use `Intl.NumberFormat` in JavaScript for automatic locale detection.
- **Align decimal places.** When displaying precise values (percentages, rates), align decimal places consistently: if one label shows "4.50%" and another shows "12.3%", the inconsistency is visually noisy. Normalize to the same precision: "4.50%" and "12.30%".
- **Timestamp formatting.** Time axes should use the shortest unambiguous format for the time range: "Jan" through "Dec" for yearly data, "Jan 15" for monthly data, "3:00 PM" for daily data. Never use full ISO timestamps ("2024-01-15T15:00:00Z") on a chart axis.

## Source

- Tufte, Edward — "The Visual Display of Quantitative Information" (2001)
- Few, Stephen — "Show Me the Numbers" (2012)
- Munzner, Tamara — "Visualization Analysis and Design" (2014)
- WCAG 2.2 — Use of Color (1.4.1), Non-text Contrast (1.4.11)
- Material Design 3 — Data Visualization Guidelines

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
