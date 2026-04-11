# Module Federation

> Master module federation for micro-frontend architectures — runtime module sharing across independently deployed applications, shared dependency negotiation, version compatibility strategies, and performance optimization for federated systems.

## When to Use

- Multiple teams deploy independent frontend applications that compose into a unified experience
- Shared component libraries are duplicated across micro-frontends, inflating total download size
- A monolithic frontend needs to be incrementally decomposed without a full rewrite
- Independent deploy cadences require runtime integration rather than build-time bundling
- Shared dependencies (React, design system) are loaded multiple times across micro-frontends
- A plugin or extension system needs to load third-party code at runtime
- A/B testing requires swapping entire feature modules at runtime without redeployment
- The design system team wants to push updates to all consuming applications without each one rebuilding
- Legacy and modern applications need to coexist and share components
- Build times are unacceptable because all micro-frontends rebuild together in a monorepo

## Instructions

1. **Configure the host application.** The host (shell) application declares which remote modules it consumes and which dependencies it shares:

   ```javascript
   // webpack.config.js (host/shell)
   const { ModuleFederationPlugin } = require('webpack').container;

   module.exports = {
     plugins: [
       new ModuleFederationPlugin({
         name: 'shell',
         remotes: {
           catalog: 'catalog@https://catalog.example.com/remoteEntry.js',
           checkout: 'checkout@https://checkout.example.com/remoteEntry.js',
           account: 'account@https://account.example.com/remoteEntry.js',
         },
         shared: {
           react: { singleton: true, requiredVersion: '^18.0.0' },
           'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
           '@company/design-system': {
             singleton: true,
             requiredVersion: '^3.0.0',
           },
         },
       }),
     ],
   };
   ```

2. **Configure remote applications.** Each remote exposes specific modules and declares its shared dependencies:

   ```javascript
   // webpack.config.js (catalog remote)
   const { ModuleFederationPlugin } = require('webpack').container;

   module.exports = {
     plugins: [
       new ModuleFederationPlugin({
         name: 'catalog',
         filename: 'remoteEntry.js',
         exposes: {
           './ProductList': './src/components/ProductList',
           './ProductDetail': './src/components/ProductDetail',
           './SearchBar': './src/components/SearchBar',
         },
         shared: {
           react: { singleton: true, requiredVersion: '^18.0.0' },
           'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
           '@company/design-system': {
             singleton: true,
             requiredVersion: '^3.0.0',
           },
         },
       }),
     ],
   };
   ```

3. **Load remote modules dynamically.** Use dynamic imports with error boundaries for resilient loading:

   ```typescript
   // In the host application
   import { lazy, Suspense } from 'react';
   import ErrorBoundary from './ErrorBoundary';

   const RemoteProductList = lazy(() => import('catalog/ProductList'));
   const RemoteCheckout = lazy(() => import('checkout/CheckoutFlow'));

   function App() {
     return (
       <ErrorBoundary fallback={<FallbackCatalog />}>
         <Suspense fallback={<ProductListSkeleton />}>
           <RemoteProductList />
         </Suspense>
       </ErrorBoundary>
     );
   }
   ```

4. **Configure shared dependency versioning.** Prevent duplicate React instances while allowing compatible version ranges:

   ```javascript
   shared: {
     react: {
       singleton: true,       // only one instance at runtime
       strictVersion: false,   // allow compatible versions
       requiredVersion: '^18.0.0',
       eager: false,           // load asynchronously (default)
     },
     'lodash-es': {
       singleton: false,       // multiple versions OK
       requiredVersion: '^4.17.0',
     },
     '@company/utils': {
       singleton: true,
       version: '2.5.0',
       requiredVersion: '>=2.0.0 <3.0.0',
     },
   }
   ```

5. **Implement dynamic remote loading.** For scenarios where remote URLs are determined at runtime (feature flags, environment configuration):

   ```typescript
   // Dynamic remote container loading
   async function loadRemote(scope: string, module: string, url: string) {
     await loadScript(url);
     const container = (window as any)[scope];
     await container.init(__webpack_share_scopes__.default);
     const factory = await container.get(module);
     return factory();
   }

   function loadScript(url: string): Promise<void> {
     return new Promise((resolve, reject) => {
       const script = document.createElement('script');
       script.src = url;
       script.onload = () => resolve();
       script.onerror = reject;
       document.head.appendChild(script);
     });
   }

   // Usage
   const ProductList = lazy(() => loadRemote('catalog', './ProductList', getRemoteUrl('catalog')));
   ```

6. **Set up health checks and fallbacks.** Remote modules can fail to load due to network issues or deployment problems:

   ```typescript
   class FederationErrorBoundary extends React.Component {
     state = { hasError: false, retryCount: 0 };

     static getDerivedStateFromError() {
       return { hasError: true };
     }

     handleRetry = () => {
       this.setState(prev => ({
         hasError: false,
         retryCount: prev.retryCount + 1,
       }));
     };

     render() {
       if (this.state.hasError) {
         if (this.state.retryCount < 3) {
           return (
             <div>
               <p>Failed to load module. </p>
               <button onClick={this.handleRetry}>Retry</button>
             </div>
           );
         }
         return this.props.fallback;
       }
       return this.props.children;
     }
   }
   ```

7. **Monitor federation performance.** Track remote entry load times and shared dependency negotiation overhead:

   ```typescript
   // Measure remote module load time
   const start = performance.now();
   const RemoteModule = await import('catalog/ProductList');
   const duration = performance.now() - start;

   performance.measure('federation:catalog:ProductList', {
     start,
     duration,
   });
   ```

## Details

### How Module Federation Works

At build time, each federated application generates a `remoteEntry.js` manifest file that describes its exposed modules and shared dependency requirements. At runtime, the host loads the remote's manifest, negotiates shared dependencies (using the highest compatible version available), and lazily loads the requested module. The shared scope ensures that singleton libraries like React are loaded once and reused across all federated applications, preventing multiple React instance errors and reducing total download size.

### Version Negotiation Algorithm

When multiple federated applications declare different versions of a shared dependency, the runtime selects the highest version that satisfies all `requiredVersion` constraints. If no single version satisfies all constraints, the module that cannot be satisfied loads its own bundled version (unless `strictVersion: true` is set, which throws an error). The `singleton: true` flag ensures only one version is loaded globally — critical for libraries like React that break with multiple instances.

### Worked Example: IKEA Micro-Frontends

IKEA's web platform uses module federation to compose product browsing, cart, and checkout from independent applications maintained by separate teams. The shared dependency configuration ensures a single React instance (~40KB) and one design system (~60KB) are loaded regardless of how many micro-frontends are active. Each micro-frontend's `remoteEntry.js` is ~5KB and loads in <50ms. The total overhead of federation versus a monolithic build is approximately 15KB of runtime code, offset by the ability to deploy and cache each micro-frontend independently.

### Anti-Patterns

**Sharing too many dependencies as singletons.** Only libraries that break with multiple instances (React, React DOM, state management) should be singletons. Utility libraries (lodash, date-fns) can safely have multiple versions, and forcing them to singleton creates unnecessary version conflicts.

**Missing error boundaries around remote modules.** Without error boundaries, a failing remote crashes the entire host application. Every remote module should be wrapped in both an Error Boundary and a Suspense boundary with meaningful fallback UI.

**Eager loading all shared dependencies.** Setting `eager: true` on shared dependencies defeats the purpose of async loading. Only set eager on dependencies that must be available synchronously at bootstrap (rare). Default to `eager: false`.

**Tight coupling between host and remotes.** If the host directly imports TypeScript types from a remote's source code, the host depends on the remote at build time. Use shared interface packages published to npm, not direct source imports.

## Source

- webpack: Module Federation — https://webpack.js.org/concepts/module-federation/
- Module Federation documentation — https://module-federation.io/
- Zack Jackson: "Module Federation and Micro-Frontends" — https://module-federation.io/blog/
- Micro Frontends in Action — https://micro-frontends.org/

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Shared singleton dependencies (React, design system) load exactly once across all micro-frontends.
- Remote modules load within 200ms on broadband connections.
- Failed remote modules display fallback UI without crashing the host application.
- Each micro-frontend can be deployed independently without rebuilding the host.
- The federation runtime overhead is under 20KB gzipped.
