# Push Notifications

> Implement push notifications with Expo Notifications, Firebase Cloud Messaging, and Apple Push Notification Service

## When to Use

- Adding push notifications to a React Native app
- Registering devices and managing push tokens
- Handling notification interactions (tap to open specific screen)
- Scheduling local notifications
- Setting up notification channels for Android

## Instructions

1. **Install and configure expo-notifications.**

```bash
npx expo install expo-notifications expo-device expo-constants
```

```typescript
// app.config.ts
export default {
  plugins: [
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#ffffff',
        sounds: ['./assets/notification-sound.wav'],
      },
    ],
  ],
  android: {
    googleServicesFile: './google-services.json',
  },
};
```

2. **Register for push notifications and get the device token.**

```typescript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  });

  return token.data;
}
```

3. **Send the token to your backend for server-side push delivery.**

```typescript
async function saveTokenToServer(pushToken: string, userId: string) {
  await fetch(`${API_URL}/users/${userId}/push-token`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: pushToken, platform: Platform.OS }),
  });
}
```

4. **Configure notification behavior (foreground display).**

```typescript
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Return how to display notifications when the app is in the foreground
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});
```

5. **Handle notification interactions (taps).**

```typescript
function useNotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    // Handle notification tap when app is already running
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data.screen === 'order') {
        router.push(`/orders/${data.orderId}`);
      }
    });

    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    // Handle notification that launched the app (cold start)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const data = response.notification.request.content.data;
        if (data.screen === 'order') {
          router.push(`/orders/${data.orderId}`);
        }
      }
    });
  }, []);
}
```

6. **Set up Android notification channels** for categorized notifications.

```typescript
if (Platform.OS === 'android') {
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Order Updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
    sound: 'notification-sound.wav',
  });

  await Notifications.setNotificationChannelAsync('promotions', {
    name: 'Promotions',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}
```

7. **Schedule local notifications.**

```typescript
await Notifications.scheduleNotificationAsync({
  content: {
    title: 'Reminder',
    body: 'Your order will arrive in 30 minutes',
    data: { screen: 'order', orderId: '123' },
    sound: 'notification-sound.wav',
    categoryIdentifier: 'order-update',
  },
  trigger: {
    seconds: 1800, // 30 minutes
    channelId: 'orders',
  },
});
```

8. **Send push notifications from your server using the Expo Push API.**

```typescript
// Server-side (Node.js)
async function sendPushNotification(pushToken: string, title: string, body: string, data: object) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: pushToken,
      title,
      body,
      data,
      sound: 'default',
      channelId: 'orders',
    }),
  });

  const result = await response.json();
  if (result.data?.status === 'error') {
    console.error('Push failed:', result.data.message);
  }
}
```

## Details

**Expo Push vs. direct FCM/APNs:** Expo Push API is a wrapper around FCM (Android) and APNs (iOS) that simplifies token management and payload format. For most apps, Expo Push is sufficient. Use direct FCM/APNs when you need advanced features (silent pushes, data-only messages, topic subscriptions).

**Token lifecycle:** Push tokens can change when the app is reinstalled, the OS is updated, or the user restores from backup. Re-register the token on every app launch and update it on your server.

**Notification categories (iOS):** Define action buttons that appear on the notification without opening the app.

```typescript
await Notifications.setNotificationCategoryAsync('order-update', [
  { identifier: 'track', buttonTitle: 'Track Order', isDestructive: false },
  { identifier: 'dismiss', buttonTitle: 'Dismiss', isDestructive: true },
]);
```

**Common mistakes:**

- Not requesting permissions before trying to get the push token
- Not handling permission denial gracefully (user may have declined)
- Testing push notifications on simulators (only works on physical devices)
- Not updating the push token on your server when it changes
- Sending too many notifications (users will disable them)

## Source

https://docs.expo.dev/push-notifications/overview/

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
