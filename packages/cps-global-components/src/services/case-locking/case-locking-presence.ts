import { HubConnection, HubConnectionBuilder, HttpTransportType } from "@microsoft/signalr";
import { Register } from "../../store/store";
import { CaseLockingPresentUser } from "./CaseLockingPresentUsers";
import { makeConsole } from "../../logging/makeConsole";

type HubFactory = (url: string) => HubConnection;

// Supplies the presence API access token, or null when we have not got one.
// Deliberately narrow: presence should not know how tokens are acquired, only
// that it may or may not get one.
export type GetAccessToken = () => Promise<string | null>;

type Props = {
  apiUrl: string;
  username: string;
  appName: string;
  register: Register;
  getAccessToken: GetAccessToken;
  // Count ourselves among the present users. Off by default: in production,
  // telling someone they are viewing the case they are looking at is noise. On
  // (via the caseLockingCountSelf preview flag) a lone developer can see the
  // banner without a second person, which is the only way to tell a working
  // mechanism from a broken one single-handed.
  countSelf?: boolean;
  hubFactory?: HubFactory;
};

/* ---- the wire contract ------------------------------------------------------
 *
 * What the presence API actually sends, and what both legacy CMS clients already
 * consume. This service spoke an older shape until 2026-09-01 — a flat user list
 * on a "Notify" event — which the API had long since stopped sending, so the
 * handler never fired at all.
 *
 * A notification carries SNAPSHOTS, one per section, each with a VERSION. They
 * are not guaranteed to arrive in order, which is why the version matters: a late
 * snapshot must be discarded rather than applied, or it resurrects people who
 * have left. An empty members array is a valid update meaning "everyone left".
 */
const NOTIFICATION_EVENT = "ReceiveNotification";
const NOTIFICATION_TYPE_PRESENCE = 0;

type PresenceMember = { userEmail?: string; sourceApplication?: string; joinedAt?: string };
type PresenceSection = { caseId?: string | number | null; kind?: string | null; subjectId?: string | number | null };
type PresenceSnapshot = { section?: PresenceSection; version?: number; members?: PresenceMember[] };
type PresenceNotification = { type?: number; payload?: { snapshots?: PresenceSnapshot[] } };

// The server evicts a session it has not heard from for 10 seconds, so we beat at
// 5: one missed tick is survivable, two are not. The legacy clients use the same
// window (Classic polls at 3s, the SignalR reference beat at 5s). Without this the
// connection stays open while the SESSION quietly dies, and presence vanishes ten
// seconds after it appears — which reads exactly like "the API does not notify".
const KEEPALIVE_MS = 5000;

// The hub's error text when our session has been reaped. Not a failure to retry
// blindly: the session is gone, so the cure is to Connect again.
const SESSION_EVICTED = "SESSION_EVICTED";

const { _debug, _warn, _error } = makeConsole("caseLockingPresence");

// NEVER put a token literal here. Until 2026-09-01 this file carried a hardcoded
// JWT that shipped in the built bundle: a dev token for the API's BearerTest
// scheme, expired since 2025-01-01, carrying a real email address. The legacy
// client build fails on exactly that string; the Stencil build now does too (see
// scripts/check-no-credentials.js).
//
// The token comes from MSAL, for the presence API's own scope — NOT the gateway
// scopes, which ask for Microsoft Graph and would yield a token with the wrong
// audience. The presence API and this SPA are the same app registration, so the
// token we send is the same shape the legacy clients already send and the API
// already accepts.
//
// A null token means we send NO Authorization header, and the proxy leaves the
// request unauthenticated (see presenceBearer). That is the right failure: we are
// a guest component and must never trigger an interactive consent prompt, and a
// wrong-audience token would be worse than none — accepted today by BearerTest,
// rejected the day real validation lands.
export const makeHubFactory =
  (getAccessToken: GetAccessToken): HubFactory =>
  url =>
    new HubConnectionBuilder()
      .withUrl(url, {
        transport: HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents | HttpTransportType.LongPolling,
        accessTokenFactory: async () => (await getAccessToken()) ?? "",
      })
      .withAutomaticReconnect()
      .build();

export type CaseLockingPresenceService = {
  setCaseId: (caseId: string | undefined) => void;
  addRegion: (code: string, subjectId?: string) => void;
  removeRegion: (code: string, subjectId?: string) => void;
};

/**
 * One section we want to be present in: a kind, and a subject for the kinds that
 * have one. `code` is the region's lower-case convention; buildSectionId
 * upper-cases it into the wire form.
 */
type SectionSpec = { code: string; subjectId?: string };

// Keyed by identity, not by code, so a case-wide section and a subject-scoped one
// of the same kind are different sections — and two regions naming the same
// subject are one.
const specKey = (spec: SectionSpec): string => (spec.subjectId ? `${spec.code}:${spec.subjectId}` : spec.code);

type ConnectionEntry = {
  caseId: string;
  sectionId: string;
  connection: HubConnection;
  // Highest snapshot version applied for this section. -Infinity so the first
  // snapshot always wins, whatever the server starts counting from.
  version: number;
  keepAlive: ReturnType<typeof setInterval> | undefined;
  keepAliveInFlight: boolean;
};

/**
 * A section id as the presence API expects it, and as CCPSections.sectionId builds
 * it for the legacy clients: case-wide kinds carry NO subject and NO trailing
 * colon ("544545:CASE"), while subject-scoped kinds append theirs
 * ("544545:VICTIM_WITNESS:98765"). The two must agree, or one section is tracked
 * under two names and the rosters never meet.
 *
 * Region codes are lower-case by local convention; the hub expects the kind
 * upper-cased.
 */
export const buildSectionId = (caseId: string, kind: string, subjectId?: string | null): string =>
  subjectId ? `${caseId}:${kind.toUpperCase()}:${subjectId}` : `${caseId}:${kind.toUpperCase()}`;

// The same identity, derived from a snapshot's section object rather than parts.
const sectionIdOf = (section: PresenceSection | undefined): string => {
  if (!section || section.caseId === undefined || section.caseId === null || !section.kind) {
    return "";
  }
  const subjectId = section.subjectId === undefined || section.subjectId === null ? "" : String(section.subjectId);
  return buildSectionId(String(section.caseId), String(section.kind), subjectId || null);
};

const isSessionEvicted = (error: unknown): boolean => String((error as Error)?.message ?? error ?? "").includes(SESSION_EVICTED);

export const createCaseLockingPresence = ({
  apiUrl,
  username,
  appName,
  register,
  getAccessToken,
  countSelf = false,
  hubFactory = makeHubFactory(getAccessToken),
}: Props): CaseLockingPresenceService => {
  _debug("creating presence service", { apiUrl, username, appName });

  let currentCaseId: string | undefined;
  // Regions currently on screen, keyed by section identity. Presence follows the
  // regions: a caseId on its own registers nothing, which is what the region
  // shims in this app are for.
  const desiredRegions = new Map<string, SectionSpec>();
  const connections = new Map<string, ConnectionEntry>();
  let publishedKey: string | undefined;

  // Every section we should be holding right now.
  const desiredSections = (): Map<string, SectionSpec> => {
    const desired = new Map<string, SectionSpec>();
    if (!currentCaseId) {
      return desired;
    }
    for (const [key, spec] of desiredRegions) {
      desired.set(key, spec);
    }
    return desired;
  };

  let reconcilePromise: Promise<void> = Promise.resolve();

  // The hub reports everyone in the section, ourselves included.
  //
  // Compared case-insensitively because the server derives the name from token
  // claims, whose casing we don't control.
  const isSelf = ({ user }: CaseLockingPresentUser) => !!user && user.toLowerCase() === username.toLowerCase();

  // The API's member shape flattened to what the store already publishes. Mapped
  // rather than replaced on purpose: the UI is changing shortly, so this keeps the
  // existing contract instead of inventing a second one that is about to be thrown
  // away.
  const toPresentUser = (member: PresenceMember): CaseLockingPresentUser => ({
    user: member.userEmail ?? "",
    appName: member.sourceApplication ?? "",
  });

  // The store still receives the region CODE rather than the section identity —
  // the UI is changing shortly, so this keeps its existing contract.
  const publishPresentUsers = (key: string, code: string, users: CaseLockingPresentUser[]) => {
    const others = countSelf ? users : users.filter(user => !isSelf(user));
    publishedKey = key;
    _debug("publishing present users", { key, code, users, others });
    register({ caseLockingPresentUsers: { code, users: others } });
  };

  const clearPublishedPresence = () => {
    if (!publishedKey) {
      return;
    }
    _debug("clearing published presence", { key: publishedKey });
    publishedKey = undefined;
    register({ caseLockingPresentUsers: undefined });
  };

  const clearPublishedPresenceIfStale = () => {
    if (!publishedKey) {
      return;
    }
    if (desiredSections().has(publishedKey) && connections.has(publishedKey)) {
      return;
    }
    clearPublishedPresence();
  };

  // Apply one notification to one connection's section. Snapshots for any other
  // section are ignored here: each connection owns exactly one, and whichever
  // connection owns the other will receive its own copy.
  const applyNotification = (key: string, spec: SectionSpec, entry: ConnectionEntry, notification: PresenceNotification) => {
    if (!notification || notification.type !== NOTIFICATION_TYPE_PRESENCE) {
      return;
    }
    const snapshots = notification.payload?.snapshots;
    if (!snapshots || !snapshots.length) {
      return;
    }
    for (const snapshot of snapshots) {
      if (sectionIdOf(snapshot?.section) !== entry.sectionId) {
        continue;
      }
      const version = typeof snapshot.version === "number" ? snapshot.version : NaN;
      // A version we have already passed is stale and must not be applied. NaN
      // compares false against everything, so an unversioned snapshot is always
      // accepted — the best available behaviour when the server gives us nothing
      // to order by.
      if (version <= entry.version) {
        _debug("discarding stale snapshot", { key, sectionId: entry.sectionId, version, applied: entry.version });
        continue;
      }
      entry.version = version;
      publishPresentUsers(key, spec.code, (snapshot.members ?? []).map(toPresentUser));
    }
  };

  const stopKeepAlive = (entry: ConnectionEntry) => {
    if (entry.keepAlive !== undefined) {
      clearInterval(entry.keepAlive);
      entry.keepAlive = undefined;
    }
  };

  const startKeepAlive = (key: string, entry: ConnectionEntry) => {
    stopKeepAlive(entry);
    entry.keepAlive = setInterval(async () => {
      // A slow beat must not stack up behind itself, and a superseded entry must
      // not keep beating on a connection nobody is listening to.
      if (entry.keepAliveInFlight || connections.get(key) !== entry) {
        return;
      }
      entry.keepAliveInFlight = true;
      try {
        await entry.connection.invoke("KeepAlive");
      } catch (err) {
        if (!isSessionEvicted(err)) {
          _warn("KeepAlive failed", { sectionId: entry.sectionId }, err);
        } else {
          // Our session was reaped. Everything we hold is now fiction, so the
          // version goes back and the rejoined session's first snapshot is taken.
          _debug("session evicted — rejoining", { sectionId: entry.sectionId });
          entry.version = Number.NEGATIVE_INFINITY;
          try {
            await entry.connection.invoke("Connect", entry.sectionId, appName);
          } catch (rejoinErr) {
            _warn("rejoin failed — will retry next beat", { sectionId: entry.sectionId }, rejoinErr);
          }
        }
      } finally {
        entry.keepAliveInFlight = false;
      }
    }, KEEPALIVE_MS);
  };

  const startConnection = async (caseId: string, key: string, spec: SectionSpec) => {
    if (connections.has(key)) {
      return;
    }
    const sectionId = buildSectionId(caseId, spec.code, spec.subjectId);
    _debug("starting connection", { sectionId, key, caseId });
    const connection = hubFactory(apiUrl);
    const entry: ConnectionEntry = {
      caseId,
      sectionId,
      connection,
      version: Number.NEGATIVE_INFINITY,
      keepAlive: undefined,
      keepAliveInFlight: false,
    };
    connections.set(key, entry);

    connection.on(NOTIFICATION_EVENT, (notification: PresenceNotification) => {
      _debug("notification received", { key, sectionId, notification });
      applyNotification(key, spec, entry, notification);
    });

    connection.onreconnected(() => {
      // A new transport means a new session; the roster we hold describes a world
      // that no longer exists, so the version goes back with it.
      _debug("reconnected — re-invoking Connect", { sectionId });
      entry.version = Number.NEGATIVE_INFINITY;
      connection.invoke("Connect", sectionId, appName).catch(err => _warn("reconnect invoke failed", { sectionId }, err));
    });

    connection.onclose(err => {
      if (err) {
        _warn("connection closed with error", { sectionId }, err);
      } else {
        _debug("connection closed", { sectionId });
      }
    });

    try {
      await connection.start();
      _debug("connection started — invoking Connect", { sectionId });
      await connection.invoke("Connect", sectionId, appName);
      _debug("Connect acknowledged", { sectionId, keepAliveMs: KEEPALIVE_MS });
      startKeepAlive(key, entry);
    } catch (err) {
      _error("start/invoke failed", { sectionId }, err);
      stopKeepAlive(entry);
      connections.delete(key);
      try {
        await connection.stop();
      } catch {
        // already failing — nothing to do
      }
    }
  };

  const stopConnection = async (key: string) => {
    const entry = connections.get(key);
    if (!entry) {
      return;
    }
    _debug("stopping connection", { key, sectionId: entry.sectionId });
    connections.delete(key);
    stopKeepAlive(entry);
    if (publishedKey === key) {
      clearPublishedPresence();
    }
    // Leave first so the server drops us at once rather than waiting out the
    // eviction window, then close the socket. Both are best-effort — a killed tab
    // does neither, which is exactly why the server has a timeout at all.
    try {
      await entry.connection.invoke("Leave");
    } catch (err) {
      _debug("Leave failed (already closed or evicted)", { key }, err);
    }
    try {
      await entry.connection.stop();
    } catch (err) {
      _warn("stop failed", { key }, err);
    }
  };

  const reconcile = async () => {
    const caseId = currentCaseId;
    const desired = desiredSections();
    _debug("reconciling", { caseId, desired: Array.from(desired.keys()), live: Array.from(connections.keys()) });

    for (const [key, entry] of Array.from(connections.entries())) {
      if (!desired.has(key) || entry.caseId !== caseId) {
        await stopConnection(key);
      }
    }

    if (caseId) {
      for (const [key, spec] of desired) {
        if (!connections.has(key)) {
          await startConnection(caseId, key, spec);
        }
      }
    }

    clearPublishedPresenceIfStale();
  };

  const queueReconcile = () => {
    reconcilePromise = reconcilePromise.then(reconcile, reconcile);
    return reconcilePromise;
  };

  return {
    setCaseId: (caseId: string | undefined) => {
      if (caseId === currentCaseId) {
        return;
      }
      _debug("setCaseId", { from: currentCaseId, to: caseId });
      currentCaseId = caseId;
      queueReconcile();
    },
    addRegion: (code: string, subjectId?: string) => {
      const spec: SectionSpec = { code, subjectId };
      const key = specKey(spec);
      if (desiredRegions.has(key)) {
        return;
      }
      _debug("addRegion", { key, code, subjectId });
      desiredRegions.set(key, spec);
      queueReconcile();
    },
    removeRegion: (code: string, subjectId?: string) => {
      const key = specKey({ code, subjectId });
      if (!desiredRegions.has(key)) {
        return;
      }
      _debug("removeRegion", { key, code, subjectId });
      desiredRegions.delete(key);
      queueReconcile();
    },
  };
};
