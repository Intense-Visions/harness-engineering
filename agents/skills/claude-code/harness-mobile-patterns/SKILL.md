# Harness Mobile Patterns

> Advise on mobile platform lifecycle management, permission handling, deep linking, push notifications, and app store submission compliance. Covers iOS, Android, React Native, and Flutter with platform-specific best practices.

## When to Use

- When building or reviewing a mobile feature that involves permissions, deep links, or push notifications
- When preparing a mobile application for App Store or Play Store submission
- When auditing an existing mobile app for platform lifecycle and configuration correctness
- NOT for mobile UI design patterns or component libraries (use harness-design-mobile)
- NOT for mobile accessibility auditing (use harness-accessibility)
- NOT for mobile performance profiling or bundle size analysis (use harness-perf)

## Process

### Phase 1: DETECT -- Identify Mobile Platform and Configuration

1. **Resolve project root.** Use provided path or cwd.

2. **Detect mobile platform and framework.** Scan for:
   - **React Native:** `app.json`, `App.tsx`, `react-native.config.js`, `node_modules/react-native`
   - **Flutter:** `pubspec.yaml`, `lib/main.dart`, `android/`, `ios/`
   - **Native iOS:** `*.xcodeproj`, `*.xcworkspace`, `Info.plist`, `AppDelegate.swift`
   - **Native Android:** `AndroidManifest.xml`, `build.gradle`, `*.kt` or `*.java` in `app/src/`
   - **Expo:** `app.json` with `expo` key, `eas.json`, `expo-modules-autolinking`

3. **Inventory platform configurations.** Read and catalog:
   - **iOS:** `Info.plist` (permissions, URL schemes, associated domains), `Entitlements.plist`, provisioning profile references
   - **Android:** `AndroidManifest.xml` (permissions, intent filters, deep links), `build.gradle` (target SDK, dependencies), `google-services.json`
   - **React Native:** `app.json` (display name, bundle ID), native module links, Podfile
   - **Flutter:** `pubspec.yaml` (dependencies), platform-specific configs under `ios/` and `android/`

4. **Detect feature implementations.** Scan source code for:
   - **Permissions:** `requestPermission`, `checkPermission`, `NSLocationWhenInUseUsageDescription`, `uses-permission`
   - **Deep linking:** URL scheme handlers, universal link configuration, App Links verification, `Linking.addEventListener`
   - **Push notifications:** Firebase Cloud Messaging setup, APNs configuration, notification handling code
   - **Lifecycle:** `AppState.addEventListener`, `onPause/onResume`, `WidgetsBindingObserver`, `applicationDidEnterBackground`

5. **Check build and signing configuration.** Verify:
   - Bundle identifier / application ID consistency across configs
   - Version number and build number format
   - Signing configuration references (keystore for Android, certificates for iOS)
   - Build variants (debug, release, staging)

6. **Report detection summary:**
   ```
   Mobile Platform Detection:
   Framework: React Native 0.73 (Expo managed workflow)
   Platforms: iOS 15+ (deployment target), Android API 24+ (minSdkVersion)
   Bundle ID: com.example.myapp (consistent across platforms)
   Permissions: camera, photo library, push notifications, location (when in use)
   Deep linking: URL scheme registered, universal links not configured
   Push: Firebase Cloud Messaging (Android), APNs (iOS)
   Build: 3 variants (debug, staging, release)
   ```

---

### Phase 2: ANALYZE -- Evaluate Platform Patterns

1. **Audit permission handling.** For each declared permission:
   - Is the permission requested at the point of use (not at app launch)?
   - Is there a pre-permission prompt explaining why it is needed?
   - Is the denied state handled gracefully? (fallback UI, re-request with rationale)
   - Is the permission usage description string clear and specific?
   - **iOS:** Are `NSUsageDescription` strings present for every requested permission?
   - **Android:** Is the runtime permission flow implemented for dangerous permissions (API 23+)?
   - **EARS pattern:** When the user denies camera permission, the system shall display a fallback UI explaining why the camera is needed and offer a button to open Settings.

2. **Audit deep linking.** Evaluate:
   - **URL scheme:** Is a custom scheme registered? (`myapp://`) Are conflicts possible with other apps?
   - **Universal Links (iOS):** Is the `apple-app-site-association` file configured? Is `applinks:` domain in entitlements?
   - **App Links (Android):** Is the `intent-filter` with `autoVerify="true"` configured? Is `assetlinks.json` hosted?
   - **Navigation:** Do deep links route to the correct screen? Is authentication state handled? (deep link to protected content when logged out)
   - **Fallback:** What happens when the app is not installed? Is there a web fallback or app store redirect?

3. **Audit push notification setup.** Evaluate:
   - Is push token registration handled at the right time? (after permission granted, not at startup)
   - Are notification payloads handled in all app states? (foreground, background, terminated)
   - Is the notification tap handler routing to the correct screen?
   - Are silent/background notifications handled separately from display notifications?
   - **iOS:** Is the APNs environment correct? (sandbox for dev, production for release)
   - **Android:** Are notification channels created for API 26+? Are channel importance levels appropriate?

4. **Audit lifecycle management.** Check:
   - Is app state change handled? (foreground, background, inactive/paused)
   - Are WebSocket connections and location updates paused when backgrounded?
   - Is local state persisted before backgrounding? (in-progress forms, drafts)
   - Are long-running tasks configured for background execution? (iOS: background modes, Android: WorkManager)
   - Is the splash screen / launch screen configured to avoid white flash?

5. **Audit app store readiness.** Check:
   - **iOS App Store:** Privacy nutrition labels match actual data collection, required screenshots and metadata
   - **Google Play Store:** Data safety section accuracy, target API level compliance (Play requires API 34+)
   - **Both:** Privacy policy URL configured, age rating appropriate, content declarations accurate
   - **Version requirements:** Does the app meet minimum OS version requirements for store submission?

6. **Classify findings by severity:**
   - **Error:** Missing permission usage description (App Store rejection), deep link to authenticated content without auth check, push token sent to server without encryption
   - **Warning:** Permissions requested at launch instead of point-of-use, missing universal link fallback, notification channels not created
   - **Info:** Optional background mode not configured, missing pre-permission prompt, version number format suggestion

---

### Phase 3: ADVISE -- Recommend Platform Best Practices

1. **Generate permission handling recommendations.** For each finding:
   - Provide the platform-specific fix with code reference
   - Show the recommended permission flow (request -> explain -> handle denial -> Settings redirect)
   - Include usage description string recommendations that explain user benefit, not technical need
   - Example: Instead of "This app needs camera access" use "Take photos to add to your project boards"

2. **Generate deep linking setup guide.** Based on what is missing:
   - **Universal Links:** Provide `apple-app-site-association` template, entitlement configuration, and server-side hosting instructions
   - **App Links:** Provide `assetlinks.json` template, `intent-filter` XML, and verification steps
   - **Deferred deep linking:** Recommend solutions for handling links when the app is not installed (Branch, Firebase Dynamic Links successor, or custom implementation)
   - Include routing logic for handling authentication state during deep link navigation

3. **Generate push notification checklist.** Provide:
   - Platform-specific setup steps (FCM for Android, APNs for iOS)
   - Notification handler implementation for all app states
   - Channel creation code for Android API 26+
   - Token refresh handling and server-side update logic
   - Testing strategy (push notification testing is notoriously difficult)

4. **Generate store submission checklist.** Provide:
   - Privacy manifest requirements (iOS 17+: required reason APIs, tracking declaration)
   - Data safety form guidance (Google Play: data collection, sharing, security practices)
   - Screenshot and metadata requirements per platform
   - Common rejection reasons and how to avoid them

5. **Recommend lifecycle improvements.** Provide:
   - State preservation patterns for the detected framework
   - Background task configuration for long-running operations
   - Memory management recommendations (clearing caches on memory warning)
   - Network reconnection patterns after backgrounding

---

### Phase 4: VALIDATE -- Verify Configuration Completeness

1. **Verify permission configuration completeness.** For each permission in code:
   - Is the permission declared in the platform manifest? (Info.plist / AndroidManifest.xml)
   - Is the runtime request implemented? (not just the manifest declaration)
   - Is the denial handler implemented?
   - Does the usage description match the actual use case?

2. **Verify deep link routing.** For each registered deep link pattern:
   - Does a route handler exist that matches the URL pattern?
   - Is the handler accessible from all app states? (cold start, warm start, foreground)
   - Are URL parameters validated before use?

3. **Verify push notification flow.** End-to-end:
   - Permission request -> token registration -> server-side storage -> notification receipt -> tap handling -> screen navigation
   - Each step must be implemented, not just the first and last

4. **Output mobile patterns report:**

   ```
   Mobile Patterns Report: [PASS/NEEDS_ATTENTION/FAIL]
   Platform: React Native 0.73 (iOS + Android)

   Permissions (4 declared):
     camera: OK (point-of-use request, denial handled, description clear)
     location: WARNING (requested at launch, should be point-of-use)
     push: OK (requested after onboarding, token registered)
     photo_library: ERROR (missing NSPhotoLibraryUsageDescription in Info.plist)

   Deep Linking:
     URL scheme: OK (myapp:// registered on both platforms)
     Universal Links: NOT_CONFIGURED (recommended for iOS)
     App Links: NOT_CONFIGURED (recommended for Android)
     Auth handling: WARNING (deep link to /profile without auth check)

   Push Notifications:
     iOS (APNs): OK
     Android (FCM): WARNING (no notification channels for API 26+)
     Foreground handling: OK
     Background handling: OK
     Terminated handling: MISSING

   Store Readiness:
     iOS: NEEDS_ATTENTION (missing privacy nutrition labels for location)
     Android: NEEDS_ATTENTION (target SDK 33, Play Store requires 34+)

   ERRORS: 1 | WARNINGS: 4 | INFO: 2
   ```

5. **Cross-reference platform configs.** Verify iOS and Android configurations are consistent:
   - Same deep link patterns registered on both platforms
   - Same permissions requested on both platforms (where applicable)
   - Same push notification handling on both platforms
   - Version numbers aligned

---

## Harness Integration

- **`harness skill run harness-mobile-patterns`** -- Primary command for mobile platform auditing.
- **`harness validate`** -- Run after applying configuration changes to verify project health.
- **`Glob`** -- Used to locate platform configs (Info.plist, AndroidManifest.xml), native modules, and framework files.
- **`Grep`** -- Used to find permission requests, deep link handlers, notification setup, and lifecycle methods in source code.
- **`Read`** -- Used to read platform manifests, entitlements, build configurations, and native module source.
- **`Write`** -- Used to generate configuration templates, `apple-app-site-association` files, and store submission checklists.
- **`Bash`** -- Used to check Xcode project settings, Gradle configurations, and run platform-specific validation commands.
- **`emit_interaction`** -- Used to present the audit report and confirm recommendations before generating configuration changes.

## Success Criteria

- Mobile platform and framework are correctly detected with version information
- All declared permissions are audited for request timing, denial handling, and description quality
- Deep linking configuration is evaluated for both URL schemes and universal/app links
- Push notification setup covers all app states (foreground, background, terminated)
- Lifecycle management is evaluated for state preservation and background behavior
- App store readiness is assessed against current submission requirements
- Report provides platform-specific, actionable findings with code references

## Examples

### Example: React Native App with Expo

```
Phase 1: DETECT
  Framework: React Native 0.73 (Expo SDK 50, managed workflow)
  Platforms: iOS 16+, Android API 26+
  Permissions: camera, notifications, location-when-in-use
  Deep linking: expo-linking configured, no universal links
  Push: expo-notifications with FCM

Phase 2: ANALYZE
  [MOB-ERR-001] app.json
    Missing NSCameraUsageDescription -- will cause App Store rejection
  [MOB-WARN-001] src/screens/HomeScreen.tsx:15
    Location permission requested on mount, not when map feature is used
  [MOB-WARN-002] No notification channel configuration for Android
  [MOB-INFO-001] expo-linking handles deep links but no deferred deep link support

Phase 3: ADVISE
  Add to app.json plugins: ["expo-camera", { cameraPermission: "Take photos for your profile" }]
  Move location request to MapScreen component
  Add expo-notifications channel creation in App.tsx useEffect
  Consider expo-linking with web fallback for deferred deep links

Phase 4: VALIDATE
  Permissions complete after fix: YES
  Deep link routing covers auth state: NO (needs auth check)
  Store readiness: iOS PASS (after fix), Android NEEDS_ATTENTION (target SDK)
```

### Example: Flutter App with Firebase

```
Phase 1: DETECT
  Framework: Flutter 3.19, Dart 3.3
  Platforms: iOS 14+, Android API 23+
  Dependencies: firebase_messaging, firebase_dynamic_links, permission_handler
  Permissions: camera, microphone, storage, notifications

Phase 2: ANALYZE
  [MOB-ERR-001] android/app/build.gradle
    targetSdkVersion 33 -- Play Store requires 34+ for new submissions
  [MOB-ERR-002] lib/services/push_service.dart
    onMessageOpenedApp handler missing -- tapped notifications from background do nothing
  [MOB-WARN-001] lib/main.dart
    All 4 permissions requested in initState -- should be contextual
  [MOB-WARN-002] ios/Runner/Info.plist
    NSMicrophoneUsageDescription: "Microphone access" -- too vague

Phase 3: ADVISE
  Update targetSdkVersion to 34 and test for behavioral changes
  Implement FirebaseMessaging.onMessageOpenedApp handler with navigation
  Move permission requests to feature screens (camera on photo screen, mic on voice screen)
  Update description: "Record voice messages to send to your team"

Phase 4: VALIDATE
  Config consistency iOS vs Android: 3/4 permissions aligned (storage is Android-only, OK)
  Push flow complete after fix: YES (foreground + background + terminated)
  Store readiness after fixes: iOS PASS, Android PASS
```

### Example: Native iOS App (Swift) Store Submission Audit

```
Phase 1: DETECT
  Framework: Native iOS (Swift 5.9, Xcode 15)
  Deployment target: iOS 16.0
  Capabilities: push notifications, associated domains, HealthKit
  Permissions: health-share, health-update, notifications, location-always

Phase 2: ANALYZE
  [MOB-ERR-001] Info.plist
    Missing NSHealthShareUsageDescription for HealthKit read access
  [MOB-ERR-002] Runner.entitlements
    Associated domains list includes staging URL -- remove before production build
  [MOB-WARN-001] AppDelegate.swift
    Location-always permission requested without location-when-in-use fallback
    Apple may reject: must request when-in-use first, then upgrade to always
  [MOB-WARN-002] Privacy manifest (PrivacyInfo.xcprivacy) not present
    Required for iOS 17+ submissions using required reason APIs

Phase 3: ADVISE
  Add NSHealthShareUsageDescription: "View your daily step count and activity trends"
  Create separate entitlements files for staging and production
  Implement progressive location permission: when-in-use first, then always with explanation
  Generate PrivacyInfo.xcprivacy with required reason API declarations

Phase 4: VALIDATE
  All permission descriptions present after fix: YES
  Entitlements clean for production: YES (after staging URL removal)
  Privacy manifest complete: YES (after generation)
  Store submission ready: PASS
```

## Rationalizations to Reject

| Rationalization                                                                                                                  | Reality                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "We request all permissions at launch to get them out of the way — users can deny them if they want."                            | App stores treat permissions-at-launch as a review red flag and users deny at much higher rates when there is no contextual explanation. Permissions requested at the moment they are needed, with a sentence explaining why, consistently achieve higher grant rates and reduce store rejection risk.   |
| "Universal Links are optional — the URL scheme fallback works fine for deep linking."                                            | URL scheme fallbacks (`myapp://`) can be claimed by any installed app on the device. A malicious or coincidentally named app can intercept links intended for yours. Universal Links with verified `apple-app-site-association` files are cryptographically bound to your domain and cannot be hijacked. |
| "The push notification handler works in foreground and background — we can handle the terminated state separately after launch." | Users often first interact with an app by tapping a push notification when the app is terminated. The cold-start tap handler is commonly the first impression. Shipping without it means a class of users experiences a broken entry point from day one.                                                 |
| "The staging configuration is slightly different but we'll remember to change it before the App Store build."                    | "Remember to change it" is not a process. Staging URLs, debug API keys, and sandbox APNs environments in production builds have shipped before and will again. Separate build configurations and environment-specific entitlement files are the only reliable mitigation.                                |
| "The privacy manifest requirement is new — we'll add it in the next release after the store flags it."                           | Apple has enforced PrivacyInfo.xcprivacy requirements for new submissions and updates since May 2024. Submitting without it results in rejection, which blocks the entire release. Adding it retroactively under rejection pressure is strictly more costly than adding it now.                          |

## Gates

- **No missing permission usage descriptions.** Every permission requested in code must have a corresponding usage description in the platform manifest. Missing descriptions cause automatic App Store rejection on iOS and are a best practice requirement on Android.
- **No deep links to authenticated content without auth checks.** Every deep link handler that navigates to a protected screen must verify authentication state first. Unauthenticated users must be redirected to login with the deep link preserved for post-login navigation.
- **No publishing with staging configuration.** Staging URLs, debug API keys, or test server endpoints in production build configurations are always an error. Verify build variants isolate environment-specific values.
- **No requesting all permissions at app launch.** Permissions must be requested at the point of use with contextual explanation. Requesting all permissions on first launch results in lower grant rates and potential store rejection.

## Escalation

- **When platform-specific native code is required but the team uses a cross-platform framework:** Flag the bridging need: "This feature requires a custom native module for iOS (Swift) and Android (Kotlin). The React Native bridge needs to be implemented in `ios/` and `android/` directories. Consider if an existing library covers this use case."
- **When app store guidelines have recently changed:** If the analysis references a guideline that may be outdated, flag it: "Apple updated App Review Guidelines in [month]. The privacy manifest requirements may have changed -- verify against the current guidelines at developer.apple.com."
- **When deep linking requires server-side configuration:** If universal links or app links need server-side files, flag the cross-team dependency: "Universal Links require hosting `.well-known/apple-app-site-association` on your web domain. This needs coordination with the web/infrastructure team."
- **When push notification testing requires physical devices:** Flag the testing limitation: "Push notification delivery cannot be fully tested in simulators. APNs requires a physical device with a valid push token. Consider using a staging environment with real devices for end-to-end push testing."
