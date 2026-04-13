import { Notification } from "cps-global-configuration";

const SEVERITY_WEIGHT: Record<Notification["severity"], number> = {
  warning: 0,
  important: 1,
  info: 2,
};

type Input = {
  notifications: Notification[];
  dismissedIds: string[];
  previewEnabled: boolean;
  now: Date;
};

export const selectVisibleNotifications = ({ notifications, dismissedIds, previewEnabled, now }: Input): Notification[] => {
  const dismissed = new Set(dismissedIds);
  const nowMs = now.getTime();

  const matching = notifications.filter(n => {
    if (dismissed.has(n.id)) {
      return false;
    }
    if (n.previewModeRequired && !previewEnabled) {
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
    const severityDelta = SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    const fromA = a.from ? Date.parse(a.from) : -Infinity;
    const fromB = b.from ? Date.parse(b.from) : -Infinity;
    if (fromA !== fromB) {
      return fromA - fromB;
    }

    return a.id.localeCompare(b.id);
  });
};
