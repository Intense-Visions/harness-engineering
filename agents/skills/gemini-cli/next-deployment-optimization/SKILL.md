# Next.js Deployment Optimization

> Reduce bundle size, split code strategically, and optimize runtime performance for production

## When to Use

- Reducing JavaScript bundle size to improve Time to Interactive (TTI)
- Lazy loading heavy components (rich text editors, chart libraries, maps) that are not needed on first paint
- Analyzing which modules contribute most to bundle size
- Optimizing for Vercel, Docker, or self-hosted deployments
- Reducing cold start times for serverless functions

## Instructions

1. Run `ANALYZE=true next build` with `@next/bundle-analyzer` to identify large modules in the bundle.
2. Use `next/dynamic` to lazy load Client Components that are not needed for initial render.
3. Pass `{ ssr: false }` to `next/dynamic` for components that use browser-only APIs (`window`, `document`, `navigator`).
4. Use `import()` directly inside Server Components for code splitting without `next/dynamic`.
5. Move large libraries (PDF generators, Excel parsers, video processors) to Route Handlers or Server Actions to keep them off the client bundle entirely.
6. Set `experimental.optimizePackageImports` in `next.config.ts` for icon and component libraries to tree-shake unused exports.
7. Use `next/font` to self-host fonts with zero layout shift — fonts are downloaded at build time.
8. Enable compression and set proper cache headers in your deployment infrastructure for static assets.

```typescript
// next.config.ts — bundle analyzer and package optimization
import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const config: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', 'date-fns'],
  },
};

export default withBundleAnalyzer(config);

// app/editor/page.tsx — lazy load heavy Client Component
import dynamic from 'next/dynamic';

const RichTextEditor = dynamic(() => import('@/components/rich-text-editor'), {
  loading: () => <p>Loading editor...</p>,
  ssr: false, // editor uses window APIs
});

export default function EditorPage() {
  return <RichTextEditor />;
}

// app/fonts.ts — self-hosted fonts
import { Inter, Fira_Code } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
export const firaCode = Fira_Code({ subsets: ['latin'], variable: '--font-fira-code' });
```

## Details

Next.js performs automatic code splitting at the route level — each page only loads its own JavaScript. Additional optimization opportunities exist at the component and library level.

**Bundle analyzer workflow:** Install `@next/bundle-analyzer`, add it to `next.config.ts`, run `ANALYZE=true next build`. Two treemaps open (client and server bundles). Look for unexpectedly large modules, duplicated libraries (two versions of the same package), and server-only code in the client bundle.

**`next/dynamic` vs React.lazy:** `next/dynamic` wraps `React.lazy` and adds Next.js-specific features: `ssr: false`, loading components, and named export support. Use `next/dynamic` in Next.js projects — `React.lazy` works too but lacks these features.

**`ssr: false` use cases:** Components that import browser APIs at module level (not just in event handlers) must use `ssr: false`. Common examples: maps (Leaflet, Mapbox), rich text editors (Quill, TipTap), WebGL renderers.

**`optimizePackageImports`:** Icon libraries like `lucide-react` export hundreds of icons. Without tree-shaking, importing one icon pulls in the entire library. `optimizePackageImports` tells Next.js to rewrite imports to their direct module paths, enabling tree-shaking.

**Standalone output:** For Docker deployments, set `output: 'standalone'` in `next.config.ts`. This produces a minimal build artifact with only the production dependencies needed, significantly reducing Docker image size.

## Source

https://nextjs.org/docs/app/building-your-application/optimizing
