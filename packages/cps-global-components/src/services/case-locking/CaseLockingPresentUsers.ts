export type CaseLockingPresentUser = { user: string; appName: string };

export type CaseLockingPresentUsers = { code: string; users: CaseLockingPresentUser[] } | undefined;
