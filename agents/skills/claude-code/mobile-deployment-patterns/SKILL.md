# Mobile Deployment Patterns

> Deploy React Native apps with EAS Build, EAS Submit, OTA updates, and automated CI/CD pipelines

## When to Use

- Preparing a React Native app for App Store and Google Play submission
- Setting up automated build and release pipelines
- Implementing over-the-air (OTA) updates for instant bug fixes
- Managing multiple environments (dev, staging, production)
- Automating version bumping and changelog generation

## Instructions

1. **Configure EAS Build profiles for each environment.**

```json
// eas.json
{
  "cli": { "version": ">= 8.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "APP_ENV": "development" },
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "env": { "APP_ENV": "staging" },
      "channel": "preview"
    },
    "production": {
      "env": { "APP_ENV": "production" },
      "channel": "production",
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "developer@company.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCDE12345"
      },
      "android": {
        "serviceAccountKeyPath": "./play-store-key.json",
        "track": "internal"
      }
    }
  }
}
```

2. **Use environment-specific configuration in `app.config.ts`.**

```typescript
const IS_PROD = process.env.APP_ENV === 'production';
const IS_STAGING = process.env.APP_ENV === 'staging';

export default {
  name: IS_PROD ? 'MyApp' : IS_STAGING ? 'MyApp (Staging)' : 'MyApp (Dev)',
  slug: 'my-app',
  ios: {
    bundleIdentifier: IS_PROD ? 'com.company.myapp' : 'com.company.myapp.dev',
  },
  android: {
    package: IS_PROD ? 'com.company.myapp' : 'com.company.myapp.dev',
  },
  extra: {
    apiUrl: IS_PROD
      ? 'https://api.company.com'
      : IS_STAGING
        ? 'https://api.staging.company.com'
        : 'https://api.dev.company.com',
  },
};
```

3. **Build and submit with EAS CLI.**

```bash
# Build for production
eas build --platform all --profile production

# Submit to stores after build completes
eas submit --platform ios --profile production
eas submit --platform android --profile production

# Build and auto-submit in one command
eas build --platform all --profile production --auto-submit
```

4. **Implement OTA updates with EAS Update** for instant JavaScript-only fixes without store review.

```bash
npx expo install expo-updates
```

```typescript
// app.config.ts
export default {
  updates: {
    url: 'https://u.expo.dev/your-project-id',
  },
  runtimeVersion: {
    policy: 'appVersion', // or 'sdkVersion', 'fingerprint'
  },
};
```

```bash
# Publish an OTA update to the production channel
eas update --branch production --message "Fix checkout button alignment"

# Publish to preview channel
eas update --branch preview --message "Test new onboarding flow"
```

5. **Check for and apply updates in the app.**

```typescript
import * as Updates from 'expo-updates';

async function checkForUpdates() {
  if (__DEV__) return; // Updates do not work in development

  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      // Restart to apply the update
      await Updates.reloadAsync();
    }
  } catch (error) {
    console.error('Update check failed:', error);
  }
}

// Check on app foreground
useEffect(() => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') checkForUpdates();
  });
  return () => subscription.remove();
}, []);
```

6. **Set up CI/CD with GitHub Actions.**

```yaml
# .github/workflows/build.yml
name: Build and Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test

  build:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      - run: eas build --platform all --profile production --non-interactive --auto-submit

  update:
    needs: test
    if: github.ref == 'refs/heads/main' && !contains(github.event.head_commit.message, '[native]')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      - run: eas update --branch production --message "${{ github.event.head_commit.message }}"
```

7. **Manage version numbers.** Use `autoIncrement` in EAS Build for automatic build number bumps. Semantic version the `version` field in `app.config.ts`.

```bash
# Bump version
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0
```

8. **Test the production build before submission.** Build an internal distribution build and test on physical devices before submitting to stores.

```bash
eas build --platform ios --profile preview
# Install via QR code or direct link from EAS dashboard
```

## Details

**OTA update limitations:** OTA updates can only change JavaScript and assets. Changes to native code (new native modules, permission changes, SDK upgrades) require a new native build through the stores. Use `runtimeVersion` with `fingerprint` policy to automatically detect when a native build is needed.

**App Store review tips:**

- First submission takes 1-3 days; subsequent updates typically 24 hours
- Include clear screenshots and a demo account for reviewers
- Privacy policy is required; describe all data collection
- Do not mention competing platforms in metadata

**Google Play review:** Initial review takes hours to days. Use internal testing tracks for team testing, closed testing for beta users, and production for release.

**Release strategy:**

1. Merge to main triggers CI
2. CI runs tests, builds, and submits to internal testing
3. QA tests on internal track
4. Promote to production (manual approval)
5. Post-release JS fixes via OTA updates

**Common mistakes:**

- Shipping debug builds to production (check build profile)
- Not testing OTA updates before publishing to production
- Forgetting to update `runtimeVersion` when native dependencies change
- Not handling update download failures gracefully in the app

## Source

https://docs.expo.dev/deploy/build-project/

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
