import { z } from "zod";

export const notificationSchema = z.object({
  id: z.string().min(1).max(64),
  heading: z.string().optional(),
  bodyHtml: z.string(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  previewModeRequired: z.boolean().optional(),
  dismissible: z.boolean().optional(),
});

export type Notification = z.infer<typeof notificationSchema>;

// Shape on disk in blob storage (what developers edit in configuration/notification.*.json).
// Served verbatim by the nginx blob passthrough; no server-side merging.
export const notificationsFileSchema = z.object({
  notifications: z.array(notificationSchema),
});

export type NotificationsFile = z.infer<typeof notificationsFileSchema>;

// Shape of the user-specific dismissal state stored via the generic state endpoint
// at /global-components/state/dismissed-notifications (cookie-backed).
export const dismissedNotificationIdsSchema = z.array(z.string());
