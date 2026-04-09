# Expo Project Setup

> Set up and configure Expo projects with managed workflow, EAS Build, development builds, and config plugins

## When to Use

- Starting a new React Native project with Expo
- Migrating from bare React Native to Expo or vice versa
- Configuring EAS Build for cloud-based native builds
- Adding native modules that require config plugins
- Setting up environment-specific configuration (dev, staging, production)

## Instructions

1. **Create a new Expo project with the latest SDK.**

```bash
npx create-expo-app@latest my-app --template tabs
cd my-app
```

2. **Use `app.config.ts` instead of `app.json` for dynamic configuration.** The TypeScript config allows environment variables, conditional logic, and type safety.

```typescript
import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: process.env.APP_ENV === 'production' ? 'MyApp' : 'MyApp (Dev)',
  slug: 'my-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'myapp',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.company.myapp',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.company.myapp',
  },
  plugins: [
    'expo-router',
    ['expo-camera', { cameraPermission: 'Allow $(PRODUCT_NAME) to access your camera' }],
  ],
  extra: {
    apiUrl: process.env.API_URL ?? 'https://api.dev.example.com',
    eas: { projectId: 'your-project-id' },
  },
});
```

3. **Set up EAS Build for cloud-based native builds.** This replaces the classic `expo build` service.

```bash
npm install -g eas-cli
eas login
eas build:configure
```

```json
// eas.json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "you@example.com", "ascAppId": "123456789" },
      "android": { "serviceAccountKeyPath": "./google-credentials.json" }
    }
  }
}
```

4. **Use development builds instead of Expo Go for projects with native modules.** Development builds include your native code and config plugins, while Expo Go only supports the Expo SDK modules.

```bash
# Build for iOS simulator
eas build --platform ios --profile development

# Build for Android emulator
eas build --platform android --profile development

# Start the development server
npx expo start --dev-client
```

5. **Use config plugins to modify native projects without ejecting.** Config plugins run at build time to modify `AndroidManifest.xml`, `Info.plist`, Gradle files, and Podfiles.

```typescript
// app.config.ts
plugins: [
  ['expo-camera', { cameraPermission: 'Camera access is needed for scanning' }],
  ['expo-location', { locationAlwaysAndWhenInUsePermission: 'Allow location for delivery tracking' }],
  './plugins/withCustomSplash', // Custom config plugin
],
```

6. **Use Expo Router for file-based routing.** It provides Next.js-style file-system routing for React Native.

```
app/
  _layout.tsx      # Root layout
  index.tsx        # Home screen (/)
  settings.tsx     # Settings screen (/settings)
  [id].tsx         # Dynamic route (/:id)
  (tabs)/
    _layout.tsx    # Tab layout
    home.tsx       # Tab screen
    profile.tsx    # Tab screen
```

7. **Use environment variables with `EXPO_PUBLIC_` prefix** for client-side values.

```bash
# .env.local
EXPO_PUBLIC_API_URL=https://api.dev.example.com
API_SECRET=server-only  # Not exposed to client
```

```typescript
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
```

8. **Set up TypeScript path aliases** for clean imports.

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"]
    }
  }
}
```

## Details

**Managed vs. bare workflow:** The managed workflow (default) lets Expo handle native project configuration through config plugins and EAS Build. The bare workflow gives you direct access to `ios/` and `android/` directories. Start with managed; eject only if you need native code changes that config plugins cannot handle.

**Expo SDK versioning:** Each Expo SDK version pins specific React Native and native module versions. Upgrade with `npx expo install --fix` to resolve version mismatches. Major SDK upgrades can introduce breaking changes — follow the upgrade guide for each version.

**EAS Build vs. local builds:** EAS Build runs on Expo's cloud infrastructure — no Xcode or Android Studio needed on your machine. Use local builds (`npx expo run:ios`, `npx expo run:android`) when you need faster iteration or are debugging native code.

**Common mistakes:**

- Using Expo Go for projects with native modules (native code is not included)
- Hardcoding API URLs instead of using environment variables
- Not running `npx expo install --fix` after adding packages (version mismatches)
- Forgetting to rebuild after adding a config plugin (config plugins only take effect at build time)

## Source

https://docs.expo.dev/

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
