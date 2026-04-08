# Nuxt Layouts and Pages

> Structure applications with file-based routing, named layouts, and per-page configuration via definePageMeta

## When to Use

- You are building out the route structure of a Nuxt application
- You need multiple layouts (default, auth, dashboard) with different navigation or sidebar configurations
- You want to configure page-level metadata, transitions, middleware, or keepAlive from within the page SFC
- You are implementing nested routes or catch-all pages

## Instructions

**Pages — file-based routing:**

1. Create `.vue` files in `pages/` — the path maps directly to the URL route:

```
pages/
  index.vue          → /
  about.vue          → /about
  users/
    index.vue        → /users
    [id].vue         → /users/:id
  [...slug].vue      → /* (catch-all)
```

2. Place `<NuxtPage />` in `app.vue` (or within a layout) to render the active page:

```html
<!-- app.vue -->
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
```

3. Access route params with `useRoute`:

```typescript
const route = useRoute();
const id = route.params.id; // typed if using typed routes
```

**Layouts:**

4. Create layouts in `layouts/`. The `default.vue` layout is applied automatically. Named layouts require explicit opt-in:

```html
<!-- layouts/default.vue -->
<template>
  <div>
    <AppHeader />
    <slot />
    <AppFooter />
  </div>
</template>
```

```html
<!-- layouts/dashboard.vue -->
<template>
  <div class="dashboard-grid">
    <DashboardSidebar />
    <main><slot /></main>
  </div>
</template>
```

5. Apply a named layout from a page using `definePageMeta`:

```typescript
// pages/admin/users.vue
<script setup lang="ts">
definePageMeta({
  layout: 'dashboard'
})
</script>
```

6. Disable the layout entirely for specific pages (e.g., a full-screen login page):

```typescript
definePageMeta({ layout: false });
```

7. Switch layouts dynamically at runtime using `setPageLayout`:

```typescript
const { setPageLayout } = useLayout();
setPageLayout('minimal');
```

**definePageMeta — per-page configuration:**

8. Use `definePageMeta` for all page-level config — it is a compiler macro and must be called at the top level of `<script setup>`:

```typescript
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'role-admin'],
  keepalive: true,
  pageTransition: { name: 'slide-left', mode: 'out-in' },
  title: 'User Management', // custom meta field
});
```

**Page transitions:**

9. Configure route transitions globally in `nuxt.config.ts` or per-page:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
  },
});
```

```css
/* assets/transitions.css */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.3s;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}
```

## Details

**Nested routes:**

Create a parent page component alongside a subdirectory of the same name to implement nested routing. The parent must include `<NuxtPage />` to render the child:

```
pages/
  parent.vue         → /parent  (contains <NuxtPage />)
  parent/
    child.vue        → /parent/child
```

**Optional catch-all:**

`[[...slug]].vue` matches both `/` (optional slug) and `/a/b/c`. Useful for CMS-driven routing.

**Typed routes:**

Enable `experimental.typedPages` in `nuxt.config.ts` to get full TypeScript inference for route params and query strings:

```typescript
export default defineNuxtConfig({
  experimental: { typedPages: true },
});
```

**NuxtPage key — force remount on param change:**

By default, navigating between `/users/1` and `/users/2` reuses the page component. Force a remount with a `:key` binding:

```html
<NuxtPage :page-key="route => route.fullPath" />
```

**Layout transitions vs. page transitions:**

- `pageTransition` — animates the `<NuxtPage />` slot content
- `layoutTransition` — animates the outer `<NuxtLayout />` when switching layouts

Both accept Vue transition options or a boolean.

**Custom page meta:**

Extend `definePageMeta` with custom fields by augmenting the `PageMeta` interface:

```typescript
// types/nuxt.d.ts
declare module '#app' {
  interface PageMeta {
    title?: string;
    requiresRole?: string;
  }
}
```

Then read it in middleware: `to.meta.requiresRole`.

## Source

https://nuxt.com/docs/guide/directory-structure/pages
