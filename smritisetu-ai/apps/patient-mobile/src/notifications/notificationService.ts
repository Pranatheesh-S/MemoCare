import { Platform } from "react-native";
import type { SupportedLanguage } from "@smritisetu/shared-types";
import type { PlannedReminder } from "./reminderScheduler";
import type * as ExpoNotifications from "expo-notifications";

/**
 * Local notifications.
 *
 * Reminders are scheduled *on the device*, so they fire with no network at all.
 * Push is only ever a secondary channel handled by the backend.
 *
 * Expo Go on Android (SDK 53+) ships with no notifications native module at
 * all, and `expo-notifications` throws as soon as it is *evaluated* there —
 * not only when a method is called. A static top-level `import` cannot be
 * wrapped in try/catch for that: the throw happens inside the module loader,
 * before this file's own code runs, which is what was taking down the whole
 * route table (Expo Router eagerly imports every screen at boot to build it).
 * Loading the module lazily, on first use, moves that throw into a place
 * this file already catches. A development or release build is unaffected.
 */
let cached: typeof ExpoNotifications | null | undefined;

async function loadNotifications(): Promise<typeof ExpoNotifications | null> {
  if (cached !== undefined) return cached;
  try {
    const module = await import("expo-notifications");
    module.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    cached = module;
  } catch {
    cached = null;
  }
  return cached;
}

export const REMINDER_CHANNEL_ID = "reminders";

export type PermissionState = "granted" | "denied" | "undetermined";

export const notificationService = {
  async ensurePermissions(): Promise<PermissionState> {
    const Notifications = await loadNotifications();
    if (!Notifications) return "denied";
    try {
      const existing = await Notifications.getPermissionsAsync();
      if (existing.granted) {
        await this.ensureChannel();
        return "granted";
      }
      if (!existing.canAskAgain) return "denied";

      const requested = await Notifications.requestPermissionsAsync();
      if (requested.granted) {
        await this.ensureChannel();
        return "granted";
      }
      return requested.canAskAgain ? "undetermined" : "denied";
    } catch {
      // Notifications being unavailable must never stop the app: the My Day
      // timeline still shows everything that is due.
      return "denied";
    }
  },

  async ensureChannel(): Promise<void> {
    if (Platform.OS !== "android") return;
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: "Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 200, 300],
      lightColor: "#0B2B26",
      sound: "default",
      // Reminders are personal; keep their content off a locked screen.
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  },

  /**
   * Schedules one reminder and returns its notification id so it can be
   * cancelled when the patient marks it done.
   */
  async scheduleReminder(
    reminder: PlannedReminder,
    eventId: string,
    language: SupportedLanguage,
    title: string,
    body: string,
  ): Promise<string | null> {
    if (reminder.dueAt.getTime() <= Date.now()) return null;
    const Notifications = await loadNotifications();
    if (!Notifications) return null;
    try {
      return await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { eventId, scheduleId: reminder.scheduleId, dueAt: reminder.dueAt.toISOString(), language },
          sound: "default",
          priority: reminder.critical
            ? Notifications.AndroidNotificationPriority.MAX
            : Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder.dueAt,
          channelId: REMINDER_CHANNEL_ID,
        },
      });
    } catch {
      return null;
    }
  },

  async cancel(notificationId: string | null | undefined): Promise<void> {
    if (!notificationId) return;
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => undefined);
  },

  /**
   * Clears everything this app has scheduled.
   *
   * Called before a rebuild so a schedule change or a device restart cannot
   * leave a stale reminder for a medicine that was stopped.
   */
  async cancelAll(): Promise<void> {
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  },

  async listScheduled(): Promise<ExpoNotifications.NotificationRequest[]> {
    const Notifications = await loadNotifications();
    if (!Notifications) return [];
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch {
      return [];
    }
  },
};
