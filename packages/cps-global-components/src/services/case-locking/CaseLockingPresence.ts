export type CaseLockingPresenceUser = { user: string; appName: string };

export type CaseLockingPresence = Record<string, CaseLockingPresenceUser[]>;
