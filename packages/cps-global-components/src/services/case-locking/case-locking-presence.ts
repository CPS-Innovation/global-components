import { HubConnection, HubConnectionBuilder, HttpTransportType } from "@microsoft/signalr";
import { Register } from "../../store/store";
import { makeConsole } from "../../logging/makeConsole";

type HubFactory = (url: string) => HubConnection;

type Props = {
  apiUrl: string;
  username: string;
  appName: string;
  register: Register;
  hubFactory?: HubFactory;
};

type NotifyUser = { user: string; appName: string };

type ConnectionEntry = {
  caseId: string;
  connection: HubConnection;
  firstNotifyHandled: boolean;
  clashed: boolean;
};

const { _debug, _warn, _error } = makeConsole("caseLockingPresence");

const defaultHubFactory: HubFactory = url =>
  new HubConnectionBuilder()
    .withUrl(url, { transport: HttpTransportType.ServerSentEvents | HttpTransportType.LongPolling })
    .withAutomaticReconnect()
    .build();

export type CaseLockingPresenceService = {
  setCaseId: (caseId: string | undefined) => void;
  addCode: (code: string) => void;
  removeCode: (code: string) => void;
};

export const createCaseLockingPresence = ({ apiUrl, username, appName, register, hubFactory = defaultHubFactory }: Props): CaseLockingPresenceService => {
  _debug("creating presence service", { apiUrl, username, appName });

  let currentCaseId: string | undefined;
  const desiredCodes = new Set<string>();
  const connections = new Map<string, ConnectionEntry>();
  let clash: { upn: string; code: string; caseId: string } | undefined;

  let reconcilePromise: Promise<void> = Promise.resolve();

  const buildSectionKey = (caseId: string, code: string) => `case-${caseId}-${code}`;

  const setClash = (upn: string, code: string, caseId: string) => {
    clash = { upn, code, caseId };
    _debug("clash detected", { upn, code, caseId });
    register({ caseLockingClash: { upn, code } });
  };

  const clearClashIfStale = () => {
    if (!clash) {
      return;
    }
    const stillRelevant = clash.caseId === currentCaseId && desiredCodes.has(clash.code);
    if (stillRelevant) {
      return;
    }
    _debug("clearing clash", { ...clash, currentCaseId, stillDesired: desiredCodes.has(clash.code) });
    clash = undefined;
    register({ caseLockingClash: undefined });
  };

  const startConnection = async (caseId: string, code: string) => {
    if (connections.has(code)) {
      return;
    }
    const sectionKey = buildSectionKey(caseId, code);
    _debug("starting connection", { sectionKey, code, caseId });
    const connection = hubFactory(apiUrl);
    const entry: ConnectionEntry = { caseId, connection, firstNotifyHandled: false, clashed: false };
    connections.set(code, entry);

    connection.on("Notify", (users: NotifyUser[]) => {
      _debug("Notify received", { code, sectionKey, users });
      const others = (users ?? []).filter(u => u.user !== username);

      if (!entry.firstNotifyHandled) {
        entry.firstNotifyHandled = true;
        if (others.length > 0) {
          // Another user got here first — release our registration and surface the clash.
          entry.clashed = true;
          setClash(others[0].user, code, caseId);
          // Fire-and-forget the disconnect; reconcile will tidy up.
          void stopConnection(code);
        } else {
          _debug("first Notify clean — lock acquired", { sectionKey });
        }
      }
      // Subsequent Notifys are ignored: if we own the lock, late joiners are theirs to handle.
    });

    connection.onreconnected(() => {
      _debug("reconnected — re-invoking Connect", { sectionKey });
      connection.invoke("Connect", sectionKey, username, appName).catch(err => _warn("reconnect invoke failed", { sectionKey }, err));
    });

    connection.onclose(err => {
      if (err) {
        _warn("connection closed with error", { sectionKey }, err);
      } else {
        _debug("connection closed", { sectionKey });
      }
    });

    try {
      await connection.start();
      _debug("connection started — invoking Connect", { sectionKey });
      await connection.invoke("Connect", sectionKey, username, appName);
      _debug("Connect acknowledged", { sectionKey });
    } catch (err) {
      _error("start/invoke failed", { sectionKey }, err);
      connections.delete(code);
      try {
        await connection.stop();
      } catch {
        // already failing — nothing to do
      }
    }
  };

  const stopConnection = async (code: string) => {
    const entry = connections.get(code);
    if (!entry) {
      return;
    }
    _debug("stopping connection", { code, caseId: entry.caseId });
    connections.delete(code);
    try {
      await entry.connection.stop();
    } catch (err) {
      _warn("stop failed", { code }, err);
    }
  };

  const reconcile = async () => {
    const caseId = currentCaseId;
    const desired = caseId ? new Set(desiredCodes) : new Set<string>();
    _debug("reconciling", { caseId, desired: Array.from(desired), live: Array.from(connections.keys()) });

    clearClashIfStale();

    for (const [code, entry] of Array.from(connections.entries())) {
      if (!desired.has(code) || entry.caseId !== caseId) {
        await stopConnection(code);
      }
    }

    if (caseId) {
      for (const code of desired) {
        if (!connections.has(code)) {
          await startConnection(caseId, code);
        }
      }
    }
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
    addCode: (code: string) => {
      if (desiredCodes.has(code)) {
        return;
      }
      _debug("addCode", { code });
      desiredCodes.add(code);
      queueReconcile();
    },
    removeCode: (code: string) => {
      if (!desiredCodes.has(code)) {
        return;
      }
      _debug("removeCode", { code });
      desiredCodes.delete(code);
      queueReconcile();
    },
  };
};
