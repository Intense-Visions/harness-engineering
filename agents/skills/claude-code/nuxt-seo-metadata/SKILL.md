# Nuxt SEO Metadata

> Set page titles, Open Graph tags, canonical URLs, and structured data with useSeoMeta and useHead

## When to Use

- You need to set unique `<title>`, `<meta description>`, or OG tags per page
- You are implementing social sharing previews (og:image, twitter:card)
- You need to configure robots directives or canonical URLs
- You are adding JSON-LD structured data for search engine rich results
- You want to set global defaults and override them per page

## Instructions

**useSeoMeta — typed meta tags (preferred):**

1. Use `useSeoMeta` for all standard SEO and OG meta tags. It provides full TypeScript autocompletion and prevents common tag duplication mistakes:

```typescript
// pages/product/[id].vue
useSeoMeta({
  title: product.name,
  description: product.description,
  ogTitle: product.name,
  ogDescription: product.description,
  ogImage: product.imageUrl,
  ogType: 'product',
  twitterCard: 'summary_large_image',
  twitterTitle: product.name,
  twitterImage: product.imageUrl,
});
```

2. Use `useServerSeoMeta` in SSR-only contexts for better performance (skips client-side hydration):

```typescript
useServerSeoMeta({
  robots: 'index, follow',
  ogSiteName: 'My Site',
});
```

**useHead — generic head management:**

3. Use `useHead` for tags not covered by `useSeoMeta` (canonical, structured data, custom link tags):

```typescript
useHead({
  link: [{ rel: 'canonical', href: `https://mysite.com${route.path}` }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        offers: { '@type': 'Offer', price: product.price },
      }),
    },
  ],
});
```

4. Set global defaults in `app.vue` or a layout, then override per page:

```typescript
// app.vue
useHead({
  titleTemplate: (title) => (title ? `${title} — My Site` : 'My Site'),
  htmlAttrs: { lang: 'en' },
  meta: [{ name: 'theme-color', content: '#ffffff' }],
});
```

**Reactive meta — computed values:**

5. Pass computed refs or reactive values to update meta when data changes:

```typescript
const { data: post } = await useAsyncData('post', () => fetchPost(id));

useSeoMeta({
  title: () => post.value?.title ?? 'Loading...',
  description: () => post.value?.excerpt,
  ogImage: () => post.value?.coverImage,
});
```

**Robots configuration:**

6. Configure robots globally in `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  app: {
    head: {
      meta: [{ name: 'robots', content: 'index, follow' }],
    },
  },
});
```

7. Block specific pages from indexing:

```typescript
// pages/admin/settings.vue
useSeoMeta({ robots: 'noindex, nofollow' });
```

**nuxt-site-config module:**

8. For production-grade SEO including automatic canonical URLs, robots.txt, and sitemap integration, use the `@nuxtjs/seo` module family:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-site-config'],
  site: {
    url: 'https://mysite.com',
    name: 'My Site',
    defaultLocale: 'en',
  },
});
```

## Details

**useSeoMeta vs. useHead:**

`useSeoMeta` is a higher-level abstraction built on top of `useHead`. It knows which meta tags belong in `name` vs. `property` attributes, prevents duplicate tags, and offers typed keys. Prefer it for all standard SEO and social meta. Use `useHead` for raw head control (scripts, links, custom attributes).

**Tag deduplication:**

Nuxt uses `@unhead/vue` under the hood. Tags are deduplicated by key — the most recently called composable wins. This means a page's `useSeoMeta` call overrides the layout's defaults without any explicit merge logic.

**Open Graph image requirements:**

- Minimum size: 1200x630px for optimal display
- Use absolute URLs (include the full `https://` origin)
- For dynamic OG images, consider `@nuxtjs/og-image` which generates them at build time or on-demand

```typescript
// With @nuxtjs/og-image
defineOgImage({
  component: 'MyOgImageTemplate',
  title: post.title,
  description: post.excerpt,
});
```

**Structured data (JSON-LD) patterns:**

Common schema types for Nuxt apps:

- `Article` — blog posts, news
- `Product` — e-commerce
- `BreadcrumbList` — navigation path
- `Organization` — company info in layout
- `FAQPage` — FAQ sections

Place organization-level JSON-LD in the default layout; page-specific data in individual pages.

**Performance note:**

`useServerSeoMeta` renders meta tags only during SSR and skips the client-side hydration step, reducing JavaScript execution. Use it for any meta that does not need to change after initial render.

## Source

https://nuxt.com/docs/getting-started/seo-meta
