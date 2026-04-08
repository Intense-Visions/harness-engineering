# Astro Content Collections

> Type-safe, schema-validated content management built into Astro — no CMS required for structured Markdown, MDX, and data files.

## When to Use

- You are organizing Markdown, MDX, YAML, or JSON content files in `src/content/`
- You need frontmatter validation with helpful error messages (not silent failures)
- You want TypeScript types auto-generated from your content schema
- You are querying multiple content entries (blog posts, docs pages, team members) and need filtering and sorting
- You want to render Markdown content with `<Content />` and get full type safety on the rendered entry

## Instructions

1. Create a collection config at `src/content/config.ts`. This is the single source of truth for all collections.

2. Define each collection with `defineCollection()` and a Zod schema. Every frontmatter field should be declared:

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content', // 'content' for .md/.mdx, 'data' for .json/.yaml
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const authors = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    email: z.string().email(),
    avatar: z.string().url(),
  }),
});

export const collections = { blog, authors };
```

3. Place content files under `src/content/<collection-name>/`. The directory name must match the collection key exported from `config.ts`.

4. Use `getCollection()` to fetch all entries. Apply filters inline — do not load all entries and filter in the template:

```typescript
// src/pages/blog/index.astro
---
import { getCollection } from 'astro:content';

// Exclude drafts in production
const posts = await getCollection('blog', ({ data }) => {
  return import.meta.env.PROD ? !data.draft : true;
});

// Sort by date descending
const sorted = posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
---
```

5. Use `getEntry()` to fetch a single entry by collection name and slug:

```typescript
const post = await getEntry('blog', 'my-first-post');
if (!post) return Astro.redirect('/404');
const { Content } = await post.render();
```

6. Render Markdown/MDX content with the `<Content />` component returned from `entry.render()`:

```astro
---
const { Content, headings, remarkPluginFrontmatter } = await post.render();
---
<article>
  <Content />
</article>
```

7. Use `z.coerce.date()` for date fields in frontmatter — raw frontmatter dates are strings, and coercion converts them to `Date` objects automatically.

8. Reference images in frontmatter using the `image()` helper for build-time optimization integration:

```typescript
import { defineCollection, z, reference } from 'astro:content';
schema: ({ image }) =>
  z.object({
    cover: image(), // local image, processed by astro:assets
    author: reference('authors'), // type-safe cross-collection reference
  });
```

## Details

Content Collections were introduced in Astro 2.0 to solve the problem of unstructured, unvalidated frontmatter. Without collections, a typo in a date field or a missing required property would either silently pass or cause a runtime error deep in your template. With collections, Astro validates every entry at build time using Zod and surfaces clear errors.

**The `type` distinction:**

- `type: 'content'` — for `.md` and `.mdx` files. Entries have `body` (raw Markdown string), `render()` method, and `slug` (auto-derived from filename).
- `type: 'data'` — for `.json` and `.yaml` files. Entries have only `data` (the parsed object). No `render()` or `slug`.

**Generated types:**

Astro generates `.astro/types.d.ts` from your collection config. This gives you full IntelliSense on `entry.data.title`, `entry.data.pubDate`, etc., without manual type declarations.

**Slugs and IDs:**

- `entry.slug` — the path relative to the collection directory, without the extension. For `src/content/blog/2024/my-post.md`, the slug is `2024/my-post`.
- `entry.id` — same as slug but with the extension included. Primarily used for `data` collections.

**Cross-collection references:**

Use `reference('collectionName')` in a Zod schema to create typed cross-collection references. Astro validates that the referenced entry exists at build time. Resolve references with `getEntry(entry.data.author)`.

**Content Layer API (Astro 5+):**

Astro 5 introduced the Content Layer API, which extends collections to support external data sources (remote APIs, databases, CMSes). Use `loader` in `defineCollection()`:

```typescript
const products = defineCollection({
  loader: async () => {
    const res = await fetch('https://api.example.com/products');
    return res.json(); // array of objects with an `id` field
  },
  schema: z.object({ id: z.string(), name: z.string(), price: z.number() }),
});
```

**Performance:** `getCollection()` reads from the file system at build time (SSG) or at request time (SSR). In SSG, results are used to generate static pages via `getStaticPaths()`. In SSR, consider caching results if collections are large.

## Source

https://docs.astro.build/en/guides/content-collections
