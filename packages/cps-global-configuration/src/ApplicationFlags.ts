// Runtime-determined application flags. Set once by the host bundle during
// startup based on URL hostname, deploy-time env, etc. Type lives here so the
// handover bundle (and the shared feature-flag layer) can reference it.

export type ApplicationFlags = {
  isOutSystems: boolean;
  e2eTestMode:
    | { isE2eTestMode: true; isAuthed: boolean; adGroups: string[] }
    | { isE2eTestMode: false; isAuthed?: boolean; adGroups?: string[] };
  isLocalDevelopment: boolean;
  environment: string;
  origin: string;
};
