import { Config, Notification, notificationsFileSchema, dismissedNotificationIdsSchema } from "cps-global-configuration";
import { getArtifactUrl } from "../../utils/get-artifact-url";
import { makeConsole } from "../../logging/makeConsole";
import { Register } from "../../store/store";
import { fetchState } from "../state/fetch-state";
import { StatePutResponseSchema } from "../state/StatePutResponse";
import { Handlers } from "../handlers/handlers";

const { _error, _warn } = makeConsole("initialise-notifications");

const DISMISSED_STATE_URL = "../state/dismissed-notifications";

const fetchNotificationsFile = async (rootUrl: string): Promise<Notification[]> => {
  const url = getArtifactUrl(rootUrl, "notification.json");
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`notification.json fetch not ok: ${response.status}`);
    }
    const parsed = notificationsFileSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw parsed.error;
    }
    return parsed.data.notifications;
  } catch (err) {
    _error("notification fetch or validation failed; rendering none", err);
    return [];
  }
};

export const initialiseNotifications = async ({ rootUrl, register, handlers, config }: { rootUrl: string; register: Register; handlers: Handlers; config: Config }): Promise<void> => {
  if (!config.SHOW_NOTIFICATIONS) {
    // Feature gated off for this environment: skip all network, leave the `notifications` and
    // `dismissedNotificationIds` store slots undefined. The controller's readyState gate
    // covers both, so the banner never renders. No handler binding either — the no-op default
    // in handlers.dismissNotification stays in place.
    return;
  }

  const [notifications, dismissedResult] = await Promise.all([
    fetchNotificationsFile(rootUrl),
    fetchState({ rootUrl, url: DISMISSED_STATE_URL, schema: dismissedNotificationIdsSchema, defaultResultWhenNull: [] as string[] }),
  ]);

  const storedDismissed = dismissedResult.found ? dismissedResult.result : [];
  const activeIds = new Set(notifications.map(n => n.id));
  let currentDismissed = storedDismissed.filter(id => activeIds.has(id));

  register({ notifications, dismissedNotificationIds: currentDismissed });

  // If any stale IDs were pruned, persist the pruned list so the cookie stays tidy.
  if (currentDismissed.length !== storedDismissed.length) {
    fetchState({ rootUrl, url: DISMISSED_STATE_URL, schema: StatePutResponseSchema, data: currentDismissed }).catch(error => _warn("Unexpected error pruning dismissed notifications", String(error)));
  }

  handlers.dismissNotification = (id: string) => {
    if (currentDismissed.includes(id)) {
      return;
    }
    currentDismissed = [...currentDismissed, id];
    register({ dismissedNotificationIds: currentDismissed });
    fetchState({ rootUrl, url: DISMISSED_STATE_URL, schema: StatePutResponseSchema, data: currentDismissed }).catch(error => _warn("Unexpected error setting dismissed notifications", String(error)));
  };
};
