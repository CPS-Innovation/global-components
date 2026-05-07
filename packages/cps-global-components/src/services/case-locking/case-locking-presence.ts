import { HubConnection, HubConnectionBuilder, HttpTransportType } from "@microsoft/signalr";
import { Register } from "../../store/store";
import { CaseLockingPresence, CaseLockingPresenceUser } from "./CaseLockingPresence";

type HubFactory = (url: string) => HubConnection;

type Props = {
  apiUrl: string;
  username: string;
  appName: string;
  register: Register;
  hubFactory?: HubFactory;
  log?: (...args: unknown[]) => void;
};

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

export const createCaseLockingPresence = ({
  apiUrl,
  username,
  appName,
  register,
  hubFactory = defaultHubFactory,
  log = () => {},
}: Props): CaseLockingPresenceService => {
  let currentCaseId: string | undefined;
  const desiredCodes = new Set<string>();
  const connections = new Map<string, { caseId: string; connection: HubConnection }>();
  const presenceByCode = new Map<string, CaseLockingPresenceUser[]>();

  let reconcilePromise: Promise<void> = Promise.resolve();

  const buildSectionKey = (caseId: string, code: string) => `case-${caseId}-${code}`;

  const publishPresence = () => {
    register({ caseLockingPresence: Object.fromEntries(presenceByCode) as CaseLockingPresence });
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
    const connection = hubFactory(apiUrl);
    connections.set(code, { caseId, connection });

    connection.on("Notify", (users: CaseLockingPresenceUser[]) => {
      const others = (users ?? []).filter(u => u.user !== username);
      setPresenceForCode(code, others);
    });

    connection.onreconnected(() => {
      connection.invoke("Connect", sectionKey, username, appName).catch(err => log("reconnect invoke failed", err));
    });

    connection.onclose(err => {
      if (err) {
        log("connection closed with error", err);
      }
    });

    try {
      await connection.start();
      await connection.invoke("Connect", sectionKey, username, appName);
    } catch (err) {
      log("start/invoke failed", err);
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
    connections.delete(code);
    clearPresenceForCode(code);
    try {
      await entry.connection.stop();
    } catch (err) {
      log("stop failed", err);
    }
  };

  const reconcile = async () => {
    const caseId = currentCaseId;
    const desired = caseId ? new Set(desiredCodes) : new Set<string>();

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
      currentCaseId = caseId;
      queueReconcile();
    },
    addCode: (code: string) => {
      if (desiredCodes.has(code)) {
        return;
      }
      desiredCodes.add(code);
      queueReconcile();
    },
    removeCode: (code: string) => {
      if (!desiredCodes.has(code)) {
        return;
      }
      desiredCodes.delete(code);
      queueReconcile();
    },
  };
};
