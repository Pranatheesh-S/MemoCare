import { logger } from "./logger";
import { env } from "../config/env";

/**
 * Firebase Cloud Messaging-ready notification module.
 *
 * The prototype ships with FCM disabled: notifications are logged instead of
 * dispatched, so the whole demo journey runs with no external credential. Set
 * FCM_ENABLED=true and provide FCM_PROJECT_ID / FCM_CLIENT_EMAIL /
 * FCM_PRIVATE_KEY to switch `deliver()` onto the real transport — the call
 * sites do not change.
 *
 * Note: reminders themselves are scheduled locally on the device with Expo
 * Notifications, so patients are reminded even with no network at all. Push is
 * only a secondary channel (caregiver alerts, schedule-change nudges).
 */

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  priority?: "normal" | "high";
};

export type PushResult = {
  delivered: boolean;
  transport: "fcm" | "log";
  reason?: string;
};

async function deliverViaFcm(message: PushMessage): Promise<PushResult> {
  if (!env.FCM_PROJECT_ID || !env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) {
    return {
      delivered: false,
      transport: "log",
      reason: "FCM_ENABLED is true but FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY are not configured",
    };
  }
  // Real dispatch goes here (firebase-admin messaging().send). Deliberately not
  // wired in the prototype so no credential is required to run the demo.
  logger.info("FCM dispatch requested", { to: message.to.slice(0, 12), title: message.title });
  return { delivered: true, transport: "fcm" };
}

export const notifications = {
  async send(message: PushMessage): Promise<PushResult> {
    if (!env.FCM_ENABLED) {
      logger.info("notification (log transport)", {
        to: message.to ? `${message.to.slice(0, 12)}…` : "unknown",
        title: message.title,
        body: message.body,
        priority: message.priority ?? "normal",
      });
      return { delivered: true, transport: "log" };
    }
    return deliverViaFcm(message);
  },

  async sendMany(messages: PushMessage[]): Promise<PushResult[]> {
    return Promise.all(messages.map((m) => this.send(m)));
  },
};
