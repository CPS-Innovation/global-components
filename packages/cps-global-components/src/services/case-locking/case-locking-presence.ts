import { HubConnection, HubConnectionBuilder, HttpTransportType } from "@microsoft/signalr";
import { Register } from "../../store/store";
import { CaseLockingPresentUser } from "./CaseLockingPresentUsers";
import { makeConsole } from "../../logging/makeConsole";

type HubFactory = (url: string) => HubConnection;

type Props = {
  apiUrl: string;
  username: string;
  appName: string;
  register: Register;
  hubFactory?: HubFactory;
};

type ConnectionEntry = {
  caseId: string;
  connection: HubConnection;
};

const { _debug, _warn, _error } = makeConsole("caseLockingPresence");

const defaultHubFactory: HubFactory = url =>
  new HubConnectionBuilder()
    .withUrl(url, {
      transport: HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents | HttpTransportType.LongPolling,
      accessTokenFactory: () =>
        "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6IlQxU3QtZUxHSGcxZ0o0d1RmZDl3Q3F6WnEtQjRvOFUiLCJ4NXQiOiJUMVN0LWVMR0hnMWdKNHdUZmQ5d0NxelpxLUI0bzhVIn0.eyJhdWQiOiJhcGk6Ly8xMTExMjIyMi0zMzMzLTQ0NDQtNTU1NS02NjY2Nzc3Nzg4ODgiLCJpc3MiOiJodHRwczovL2xvZ2luLm1pY3Jvc29mdG9ubGluZS5jb20vOTk5OTg4ODgtNzc3Ny02NjY2LTU1NTUtNDQ0NDMzMzMyMjIyL3YyLjAiLCJpYXQiOjE3MzU3MzI4MDAsIm5iZiI6MTczNTczMjgwMCwiZXhwIjoxNzM1NzM2NDAwLCJhaW8iOiJBV1FBbS84WEFBQUF0VjBtMFA3VnYxYnFVM3E0WWgxSncybjZtUThiMGs1cjN4Tj09IiwiYXpwIjoiOGQ2MTMzYWYtOTU5My00N2M2LTk0ZDAtNWM2NWU5ZTMxMGYxIiwiYXpwYWNyIjoiMSIsIm5hbWUiOiJUZXN0IFVzZXIiLCJvaWQiOiI3YzlmNGUyYS0xYjZkLTRjM2UtOWYwYS0yZDViOGUxYTRjN2YiLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJ0ZXN0LXVzZXJAY3BzLmdvdi51ayIsImVtYWlsIjoic3RlZkBjcHMuZ292LnVrIiwicmgiOiIwLkFBQUEuZ1kuIiwic2NwIjoiYXBpLnByZXNlbmNlLnVzZXIucmVhZHdyaXRlIiwic3ViIjoiQUFkajhrUTJyN3g5bU4zcEw1dFoxdkI2d1gwY1k0dUg4c0syZUY3Z1Q5YSIsInRpZCI6Ijk5OTk4ODg4LTc3NzctNjY2Ni01NTU1LTQ0NDQzMzMzMjIyMiIsInV0aSI6ImFCM2NENGVGNWdINmlKN2tMOG1OQUEiLCJ2ZXIiOiIyLjAifQ.dev-signature-not-validated-by-BearerTest-scheme",
    })
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
  let publishedCode: string | undefined;

  let reconcilePromise: Promise<void> = Promise.resolve();

  // Wire format agreed with the presence API: "<caseId>:<SECTION_KIND>", e.g. "12345:CASE".
  // Region codes are lower-case by local convention; the hub expects the kind upper-cased.
  const buildSectionKey = (caseId: string, code: string) => `${caseId}:${code.toUpperCase()}`;

  // The hub reports everyone in the section, ourselves included. Drop our own entry
  // so the banner only appears when someone *else* is on the case — otherwise a lone
  // user is told they are viewing the case they are looking at. Compared
  // case-insensitively because the server derives the name from token claims, whose
  // casing we don't control.
  const isSelf = ({ user }: CaseLockingPresentUser) => !!user && user.toLowerCase() === username.toLowerCase();

  const publishPresentUsers = (code: string, users: CaseLockingPresentUser[]) => {
    const others = users.filter(user => !isSelf(user));
    publishedCode = code;
    _debug("publishing present users", { code, users, others });
    register({ caseLockingPresentUsers: { code, users: others } });
  };

  const clearPublishedPresence = () => {
    if (!publishedCode) {
      return;
    }
    _debug("clearing published presence", { code: publishedCode });
    publishedCode = undefined;
    register({ caseLockingPresentUsers: undefined });
  };

  const clearPublishedPresenceIfStale = () => {
    if (!publishedCode) {
      return;
    }
    if (currentCaseId && desiredCodes.has(publishedCode) && connections.has(publishedCode)) {
      return;
    }
    clearPublishedPresence();
  };

  const startConnection = async (caseId: string, code: string) => {
    if (connections.has(code)) {
      return;
    }
    const sectionKey = buildSectionKey(caseId, code);
    _debug("starting connection", { sectionKey, code, caseId });
    const connection = hubFactory(apiUrl);
    connections.set(code, { caseId, connection });

    connection.on("Notify", (users: CaseLockingPresentUser[]) => {
      _debug("Notify received", { code, sectionKey, users });
      publishPresentUsers(code, users ?? []);
    });

    connection.onreconnected(() => {
      _debug("reconnected — re-invoking Connect", { sectionKey });
      connection.invoke("Connect", sectionKey, appName).catch(err => _warn("reconnect invoke failed", { sectionKey }, err));
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
      await connection.invoke("Connect", sectionKey, appName);
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
    if (publishedCode === code) {
      clearPublishedPresence();
    }
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
