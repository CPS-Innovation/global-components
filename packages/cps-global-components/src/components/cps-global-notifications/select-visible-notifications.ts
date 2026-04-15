import { Notification } from "cps-global-configuration";

type Input = {
  notifications: Notification[];
  dismissedIds: string[];
  previewNotificationsEnabled: boolean;
  now: Date;
};

export const selectVisibleNotifications = ({ notifications, dismissedIds, previewNotificationsEnabled, now }: Input): Notification[] => {
  const dismissed = new Set(dismissedIds);
  const nowMs = now.getTime();

  const matching = notifications.filter(n => {
    if (dismissed.has(n.id)) {
      return false;
    }
    if (n.previewModeRequired && !previewNotificationsEnabled) {
      return false;
    }
    if (n.from && Date.parse(n.from) > nowMs) {
      return false;
    }
    if (n.to && Date.parse(n.to) < nowMs) {
      return false;
    }
    return true;
  });

  return matching.sort((a, b) => {
    const fromA = a.from ? Date.parse(a.from) : -Infinity;
    const fromB = b.from ? Date.parse(b.from) : -Infinity;
    if (fromA !== fromB) {
      return fromA - fromB;
    }

    return a.id.localeCompare(b.id);
  });
};
