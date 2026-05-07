import { HubConnection, HubConnectionBuilder, HttpTransportType } from "@microsoft/signalr";
import { Register } from "../../store/store";
import { CaseLockingPresence, CaseLockingPresenceUser } from "./CaseLockingPresence";
import { makeConsole } from "../../logging/makeConsole";

type HubFactory = (url: string) => HubConnection;

type Props = {
  apiUrl: string;
  username: string;
  appName: string;
  register: Register;
  hubFactory?: HubFactory;
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
  const connections = new Map<string, { caseId: string; connection: HubConnection }>();
  const presenceByCode = new Map<string, CaseLockingPresenceUser[]>();

  let reconcilePromise: Promise<void> = Promise.resolve();

  const buildSectionKey = (caseId: string, code: string) => `case-${caseId}-${code}`;

  const publishPresence = () => {
    const next = Object.fromEntries(presenceByCode) as CaseLockingPresence;
    _debug("publishing presence", next);
    register({ caseLockingPresence: next });
  };

  const setPresenceForCode = (code: string, users: CaseLockingPresenceUser[]) => {
    presenceByCode.set(code, users);
    publishPresence();
  };

  const clearPresenceForCode = (code: string) => {
    if (!presenceByCode.delete(code)) {
      return;
    }
    publishPresence();
  };

  const startConnection = async (caseId: string, code: string) => {
    if (connections.has(code)) {
      return;
    }
    const sectionKey = buildSectionKey(caseId, code);
    _debug("starting connection", { sectionKey, code, caseId });
    const connection = hubFactory(apiUrl);
    connections.set(code, { caseId, connection });

    connection.on("Notify", (users: CaseLockingPresenceUser[]) => {
      _debug("Notify received", { code, sectionKey, users });
      const others = (users ?? []).filter(u => u.user !== username);
      setPresenceForCode(code, others);
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
    clearPresenceForCode(code);
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
