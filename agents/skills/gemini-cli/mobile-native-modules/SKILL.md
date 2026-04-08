# Native Modules

> Bridge native platform APIs into React Native with Expo Modules API and Turbo Modules

## When to Use

- Accessing platform APIs not available in JavaScript (Bluetooth, NFC, HealthKit)
- Wrapping an existing native SDK (analytics, payment, maps)
- Building a reusable library that needs native code
- Optimizing performance-critical code by running it natively
- Choosing between Expo Modules API and React Native's Turbo Modules

## Instructions

1. **Prefer existing Expo SDK modules and community packages first.** Most common native functionality (camera, location, notifications, file system, biometrics) already has a well-maintained package. Only write custom native modules for genuinely missing functionality.

2. **Use Expo Modules API for new native modules in Expo projects.** It provides a unified Swift/Kotlin API that is simpler than React Native's Turbo Modules.

```bash
npx create-expo-module my-native-module
```

This scaffolds a module with iOS (Swift) and Android (Kotlin) source files.

3. **Define the module interface in Swift (iOS).**

```swift
// ios/MyNativeModule.swift
import ExpoModulesCore

public class MyNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MyNativeModule")

    // Synchronous function
    Function("getDeviceId") { () -> String in
      return UIDevice.current.identifierForVendor?.uuidString ?? ""
    }

    // Async function
    AsyncFunction("fetchHealthData") { (type: String, promise: Promise) in
      HealthKitManager.fetch(type: type) { result in
        switch result {
        case .success(let data):
          promise.resolve(data)
        case .failure(let error):
          promise.reject(error)
        }
      }
    }

    // Events
    Events("onStatusChange")

    // View component
    View(MyNativeView.self) {
      Prop("color") { (view, color: UIColor) in
        view.backgroundColor = color
      }
    }
  }
}
```

4. **Define the module interface in Kotlin (Android).**

```kotlin
// android/src/main/java/expo/modules/mynativemodule/MyNativeModule.kt
package expo.modules.mynativemodule

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MyNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MyNativeModule")

    Function("getDeviceId") {
      android.provider.Settings.Secure.getString(
        appContext.reactContext?.contentResolver,
        android.provider.Settings.Secure.ANDROID_ID
      )
    }

    AsyncFunction("fetchHealthData") { type: String ->
      // Android Health Connect implementation
    }

    Events("onStatusChange")
  }
}
```

5. **Use the module from JavaScript/TypeScript.**

```typescript
// src/MyNativeModule.ts
import { requireNativeModule } from 'expo-modules-core';

const MyNativeModule = requireNativeModule('MyNativeModule');

export function getDeviceId(): string {
  return MyNativeModule.getDeviceId();
}

export async function fetchHealthData(type: string): Promise<HealthData> {
  return MyNativeModule.fetchHealthData(type);
}

// Listen to events
import { EventEmitter } from 'expo-modules-core';

const emitter = new EventEmitter(MyNativeModule);

export function onStatusChange(callback: (status: string) => void) {
  return emitter.addListener('onStatusChange', callback);
}
```

6. **Use platform-specific files for platform-only code.** When a feature exists on only one platform, use `.ios.ts` and `.android.ts` extensions.

```
src/
  biometrics.ts         # Shared interface
  biometrics.ios.ts     # iOS implementation (Face ID)
  biometrics.android.ts # Android implementation (Fingerprint)
```

7. **Use config plugins to modify native project settings** when your module needs specific permissions, entitlements, or build settings.

```typescript
// plugin/withMyModule.ts
import { ConfigPlugin, withInfoPlist, withAndroidManifest } from 'expo/config-plugins';

const withMyModule: ConfigPlugin = (config) => {
  config = withInfoPlist(config, (config) => {
    config.modResults.NSHealthShareUsageDescription = 'Access health data';
    return config;
  });

  config = withAndroidManifest(config, (config) => {
    // Add Android permissions
    return config;
  });

  return config;
};

export default withMyModule;
```

8. **Write integration tests for native modules** using Expo's test utilities or by building a test app that exercises each function.

## Details

**Expo Modules API vs. Turbo Modules:** Expo Modules API provides a higher-level DSL in Swift/Kotlin with automatic type conversion, event support, and view definitions. Turbo Modules (React Native's new architecture) use C++ and codegen for type-safe bridging. Use Expo Modules for Expo projects; use Turbo Modules for bare RN projects or when you need C++ performance.

**Threading:** By default, native module functions run on the main thread (iOS) or the native modules thread (Android). For heavy computation, dispatch to a background queue/thread and use promises to return results.

**Data types that cross the bridge:** Strings, numbers, booleans, arrays, and dictionaries (objects) are automatically converted. For complex types, serialize to JSON. Binary data should use base64 encoding or file URIs.

**Common mistakes:**

- Blocking the main thread with synchronous heavy computation
- Not handling permission requests before accessing protected APIs
- Missing null checks on Android context (React context can be null during initialization)
- Forgetting to add the module to the Expo config plugin pipeline

## Source

https://docs.expo.dev/modules/overview/
