export type ApplicationFlags = {
  isOutSystems: boolean;
  e2eTestMode: { isE2eTestMode: true; isAuthed: boolean; adGroups: string[] } | { isE2eTestMode: false; isAuthed?: boolean; adGroups?: string[] };
  isLocalDevelopment: boolean;
};
