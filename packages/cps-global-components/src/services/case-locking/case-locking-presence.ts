import { HubConnection, HubConnectionBuilder, HttpTransportType } from "@microsoft/signalr";
import { CCPEnvironment, CCPNotification, CCPRoster, CCPSections } from "cps-global-presence";
import { Register } from "../../store/store";
import { CaseLockingPresentSection } from "./CaseLockingPresentUsers";
import { makeConsole } from "../../logging/makeConsole";

type HubFactory = (url: string) => HubConnection;

// Supplies the presence API access token, or null when we have not got one.
// Deliberately narrow: presence should not know how tokens are acquired, only
// that it may or may not get one.
export type GetAccessToken = () => Promise<string | null>;

/** A region on screen: a section kind (lower-case config code) and, for some kinds, a subject. */
export type PresenceRegion = { code: string; subjectId?: string };

type Props = {
  apiUrl: string;
  /** The reader, so they are never counted as occupying their own section. */
  username: string;
  appName: string;
  register: Register;
  getAccessToken: GetAccessToken;
  /**
   * Someone arrived in or left CMS CLASSIC. Not a general "presence updated" hook
   * in two respects: it fires only when the set of people IN CLASSIC changes, and
   * never on a re-publish of the same roster.
   *
   * Classic is singled out because an arrival or departure there is the CMS lock
   * being taken or released — the lock is held for exactly as long as the Classic
   * case screen is open. Presence elsewhere changes who is reading the case and
   * changes nothing about whether it can be written to. The service itself knows
   * nothing about locks or case details; the caller decides what to do.
   */
  onClassicPresenceChanged?: () => void;
  hubFactory?: HubFactory;
};

/* THE WIRE CONTRACT is the legacy clients': versioned snapshots per section,
 * applied by CCPRoster, which owns the ordering rule (a late snapshot must not
 * resurrect people who have left) and the section identity. Only the transport
 * differs: a SignalR connection per section here, JSONP sessions there.
 */
const NOTIFICATION_EVENT = "ReceiveNotification";
const NOTIFICATION_TYPE_PRESENCE = 0;

// The server evicts a session it has not heard from for 10 seconds, so we beat at
// 5: one missed tick is survivable, two are not. Without this the connection stays
// open while the SESSION quietly dies, and presence vanishes ten seconds after it
// appears — which reads exactly like "the API does not notify".
const KEEPALIVE_MS = 5000;

// The hub's error text when our session has been reaped. Not a failure to retry
// blindly: the session is gone, so the cure is to Connect again.
const SESSION_EVICTED = "SESSION_EVICTED";

/**
 * The application whose presence IS the case lock. One name, matched
 * case-insensitively because the server's casing is not ours to rely on.
 * Deliberately not a list: if another application starts taking locks, that is a
 * decision someone should make here.
 */
const LOCKING_APPLICATION = "cms classic";

const { _debug, _warn, _error } = makeConsole("caseLockingPresence");

// NEVER put a token literal here. Until 2026-09-01 this file carried a hardcoded
// JWT that shipped in the built bundle; the Stencil build now fails on one (see
// scripts/check-no-credentials.js).
//
// The token comes from MSAL, for the presence API's own scope — NOT the gateway
// scopes, which ask for Microsoft Graph and would yield the wrong audience. A null
// token means we send NO Authorization header: we are a guest component and must
// never trigger an interactive consent prompt, and a wrong-audience token would be
// worse than none.
export const makeHubFactory =
  (getAccessToken: GetAccessToken): HubFactory =>
  url =>
    new HubConnectionBuilder()
      .withUrl(url, {
        transport: /*HttpTransportType.WebSockets | */ HttpTransportType.ServerSentEvents | HttpTransportType.LongPolling,
        accessTokenFactory: async () => (await getAccessToken()) ?? "",
      })
      .withAutomaticReconnect()
      .build();

export type CaseLockingPresenceService = {
  setCaseId: (caseId: string | undefined) => void;
  /** Every region to hold now. Presence follows the regions: a caseId alone registers nothing. */
  setRegions: (regions: PresenceRegion[]) => void;
};

// Keyed by identity, not by code: two witnesses are two sections, and two regions
// naming the same witness are one.
export const regionKey = ({ code, subjectId }: PresenceRegion): string => (subjectId ? `${code}:${subjectId}` : code);

type Connection = {
  key: string;
  code: string;
  caseId: string;
  sectionId: string;
  hub: HubConnection;
  /**
   * Everything this session is sent: its own section AND every section the hub
   * says conflicts with it (a witness session hears about the case around it).
   */
  roster: ReturnType<typeof CCPRoster.createRoster>;
  /**
   * Was anyone else in our own section on its first snapshot? Undefined until
   * that snapshot arrives. LATCHED: a reconnect hands us a fresh first snapshot in
   * which the person who has been there all along looks like an incumbent we have
   * just walked in on, and recomputing would interrupt on every transient
   * disconnect.
   */
  occupiedOnEntry?: boolean;
  keepAlive?: ReturnType<typeof setInterval>;
  keepAliveInFlight: boolean;
};

const isSessionEvicted = (error: unknown): boolean => String((error as Error)?.message ?? error ?? "").includes(SESSION_EVICTED);

export const createCaseLockingPresence = ({
  apiUrl,
  username,
  appName,
  register,
  getAccessToken,
  onClassicPresenceChanged,
  hubFactory = makeHubFactory(getAccessToken),
}: Props): CaseLockingPresenceService => {
  _debug("creating presence service", { apiUrl, username, appName });

  let currentCaseId: string | undefined;
  let regions = new Map<string, PresenceRegion>();
  const connections = new Map<string, Connection>();
  let lastClassicSignature: string | undefined;

  // Compared case-insensitively: the server derives the address from token claims.
  const isSelf = (email: string) => email.toLowerCase() === username.toLowerCase();

  const membersOf = (c: Connection) => c.roster.members([c.sectionId], c.caseId);

  /**
   * WHO IS IN CMS CLASSIC, OURSELVES INCLUDED, as one comparable string. The
   * reader's own Classic session takes and releases the lock exactly as anyone
   * else's does — someone who locked a case themselves must see it clear when
   * they leave. Keyed on person-in-Classic, not person: someone already in RCMS
   * who opens Classic has taken the lock though the set of people is unchanged.
   */
  const classicSignature = () =>
    Array.from(
      new Set(
        Array.from(connections.values())
          .flatMap(membersOf)
          .filter(m => (m.sourceApplication ?? "").toLowerCase() === LOCKING_APPLICATION)
          .map(m => m.userEmail.toLowerCase()),
      ),
    )
      .sort((a, b) => a.localeCompare(b))
      .join(",");

  // Sections with nobody in them are dropped: a section everyone has left is not news.
  const publish = () => {
    const sections: CaseLockingPresentSection[] = Array.from(connections.values())
      .map(c => ({ code: c.code, members: membersOf(c), occupiedOnEntry: !!c.occupiedOnEntry }))
      .filter(section => section.members.length > 0);
    _debug("publishing present users", { sections });
    register({ caseLockingPresentUsers: sections.length ? { sections } : undefined });

    // Fired on the first publish too: arriving to find someone already in Classic
    // is the moment we most want a fresh lock reading.
    const signature = classicSignature();
    if (signature !== lastClassicSignature) {
      const first = lastClassicSignature === undefined;
      lastClassicSignature = signature;
      if (!first || signature) {
        _debug("Classic presence changed", { signature });
        onClassicPresenceChanged?.();
      }
    }
  };

  const onNotification = (c: Connection, notification: CCPNotification) => {
    if (notification?.type !== NOTIFICATION_TYPE_PRESENCE || !c.roster.apply([notification], c.sectionId)) {
      return;
    }
    // WAIT FOR OUR OWN SECTION before deciding: a payload can carry the conflicting
    // sections first, and latching then would record "empty" for a section we had
    // not yet heard about. Only someone else IN OUR SECTION is a clash — never the
    // reader, whatever countSelf says, and never someone merely on the case.
    if (c.occupiedOnEntry === undefined && Object.prototype.hasOwnProperty.call(c.roster.sections(), c.sectionId)) {
      c.occupiedOnEntry = membersOf(c).some(m => !isSelf(m.userEmail) && m.sections.some(s => s.isCurrent));
    }
    publish();
  };

  // Our session was replaced (a reconnect) or reaped (eviction): the new one may
  // count versions afresh. The members we hold stay until its snapshots replace
  // them, so the banner does not blink.
  const rejoin = (c: Connection) => {
    c.roster.rewind();
    return c.hub.invoke("Connect", c.sectionId, appName);
  };

  const stopKeepAlive = (c: Connection) => {
    clearInterval(c.keepAlive);
    c.keepAlive = undefined;
  };

  const startKeepAlive = (c: Connection) => {
    stopKeepAlive(c);
    c.keepAlive = setInterval(async () => {
      // A slow beat must not stack up behind itself, and a superseded connection
      // must not keep beating.
      if (c.keepAliveInFlight || connections.get(c.key) !== c) {
        return;
      }
      c.keepAliveInFlight = true;
      try {
        await c.hub.invoke("KeepAlive");
      } catch (err) {
        if (!isSessionEvicted(err)) {
          _warn("KeepAlive failed", { sectionId: c.sectionId }, err);
        } else {
          _debug("session evicted — rejoining", { sectionId: c.sectionId });
          await rejoin(c).catch(rejoinErr => _warn("rejoin failed — will retry next beat", { sectionId: c.sectionId }, rejoinErr));
        }
      } finally {
        c.keepAliveInFlight = false;
      }
    }, KEEPALIVE_MS);
  };

  const startConnection = async (caseId: string, key: string, region: PresenceRegion) => {
    // THE CIN SUFFIX GOES ON HERE, the one place we name a section of our own
    // rather than echo one the API sent. Registering "123:CASE" against a CMS
    // instance speaking "123:CASE_CIN3" isolates us silently — see CCPEnvironment.
    const sectionId = CCPSections.sectionId(caseId, CCPEnvironment.suffixKind(region.code.toUpperCase()), region.subjectId);
    if (!sectionId) {
      return;
    }
    _debug("starting connection", { sectionId, key });
    const c: Connection = { key, code: region.code, caseId, sectionId, hub: hubFactory(apiUrl), roster: CCPRoster.createRoster(), keepAliveInFlight: false };
    connections.set(key, c);

    c.hub.on(NOTIFICATION_EVENT, (notification: CCPNotification) => {
      _debug("notification received", { sectionId, notification });
      onNotification(c, notification);
    });
    c.hub.onreconnected(() => {
      _debug("reconnected — re-invoking Connect", { sectionId });
      rejoin(c).catch(err => _warn("reconnect invoke failed", { sectionId }, err));
    });
    c.hub.onclose(err => (err ? _warn("connection closed with error", { sectionId }, err) : _debug("connection closed", { sectionId })));

    try {
      await c.hub.start();
      await c.hub.invoke("Connect", sectionId, appName);
      _debug("Connect acknowledged", { sectionId });
      startKeepAlive(c);
    } catch (err) {
      _error("start/invoke failed", { sectionId }, err);
      stopKeepAlive(c);
      connections.delete(key);
      await c.hub.stop().catch(() => undefined);
    }
  };

  const stopConnection = async (c: Connection) => {
    _debug("stopping connection", { sectionId: c.sectionId });
    connections.delete(c.key);
    stopKeepAlive(c);
    publish();
    // Leave first so the server drops us at once rather than waiting out the
    // eviction window, then close. Both best-effort: a killed tab does neither,
    // which is why the server has a timeout at all.
    await c.hub.invoke("Leave").catch(err => _debug("Leave failed (already closed or evicted)", { sectionId: c.sectionId }, err));
    await c.hub.stop().catch(err => _warn("stop failed", { sectionId: c.sectionId }, err));
  };

  // Stop what is no longer wanted (or is on another case), then start what is
  // missing. Serialised, so a burst of changes cannot interleave starts and stops.
  const reconcile = async () => {
    const caseId = currentCaseId;
    const wanted = caseId ? regions : new Map<string, PresenceRegion>();
    _debug("reconciling", { caseId, wanted: Array.from(wanted.keys()), live: Array.from(connections.keys()) });
    for (const c of Array.from(connections.values())) {
      if (!wanted.has(c.key) || c.caseId !== caseId) {
        await stopConnection(c);
      }
    }
    for (const [key, region] of wanted) {
      if (!connections.has(key)) {
        await startConnection(caseId!, key, region);
      }
    }
  };

  let queue: Promise<void> = Promise.resolve();
  const queueReconcile = () => {
    queue = queue.then(reconcile, reconcile);
  };

  return {
    setCaseId: caseId => {
      if (caseId === currentCaseId) {
        return;
      }
      _debug("setCaseId", { from: currentCaseId, to: caseId });
      currentCaseId = caseId;
      queueReconcile();
    },
    setRegions: next => {
      const keyed = new Map(next.map(region => [regionKey(region), region]));
      if (keyed.size === regions.size && Array.from(keyed.keys()).every(key => regions.has(key))) {
        return;
      }
      _debug("setRegions", { regions: Array.from(keyed.keys()) });
      regions = keyed;
      queueReconcile();
    },
  };
};
